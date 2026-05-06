from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Sequence

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from core.database.metadata import ChunkRecord, CollectionRecord
from core.embeddings.voyage import VoyageEmbedder
from core.retrieval.vector_store import QdrantVectorStore, SearchHit

TOKEN_PATTERN = re.compile(r"[\w\-]{2,}", re.UNICODE)

# BM25 cache: collection_id -> (chunk_count, rows, BM25Okapi index)
# Keyed on count so the cache auto-invalidates after new ingestion.
_bm25_cache: dict[str, tuple[int, list[ChunkRecord], BM25Okapi]] = {}
_bm25_lock = threading.Lock()


@dataclass(slots=True)
class RetrievedChunk:
    point_id: str
    text: str
    score: float
    source_file: str | None
    source_uri: str | None
    page_number: int | None
    section_title: str | None
    document_id: str | None = None
    position: int | None = None

    def with_score(self, score: float) -> "RetrievedChunk":
        return RetrievedChunk(
            point_id=self.point_id,
            text=self.text,
            score=score,
            source_file=self.source_file,
            source_uri=self.source_uri,
            page_number=self.page_number,
            section_title=self.section_title,
            document_id=self.document_id,
            position=self.position,
        )


class HybridRetriever:
    """RRF over dense vector search and BM25 keyword search."""

    def __init__(
        self,
        *,
        settings: Settings,
        embedder: VoyageEmbedder,
        vector_store: QdrantVectorStore,
        session_factory: sessionmaker[Session],
    ) -> None:
        self.settings = settings
        self.embedder = embedder
        self.vector_store = vector_store
        self.session_factory = session_factory

    def search(
        self,
        *,
        collection: CollectionRecord,
        query: str,
        query_variants: Sequence[str] | None = None,
        limit: int | None = None,
        dense_query_limit: int | None = None,
    ) -> list[RetrievedChunk]:
        candidate_limit = limit or self.settings.retrieval_candidates
        variants = self._dedupe_queries([query, *(query_variants or [])])
        dense_variants = variants[:dense_query_limit] if dense_query_limit is not None else variants

        vector_ranked = self._dense_search(collection.qdrant_collection, dense_variants, candidate_limit)
        lexical_ranked = self._bm25_search(collection.id, variants, candidate_limit)
        merged = self._rrf_merge(vector_ranked, lexical_ranked)
        return merged[:candidate_limit]

    def search_exact_terms(
        self,
        *,
        collection_id: str,
        terms: Sequence[str],
        limit_per_term: int = 10,
    ) -> list[RetrievedChunk]:
        exact_terms = self._dedupe_queries(terms)
        if not exact_terms:
            return []

        by_id: dict[str, RetrievedChunk] = {}
        with self.session_factory() as session:
            for term in exact_terms:
                rows = (
                    session.execute(
                        select(ChunkRecord)
                        .where(ChunkRecord.collection_id == collection_id, ChunkRecord.text.ilike(f"%{term}%"))
                        .order_by(ChunkRecord.position.asc())
                        .limit(limit_per_term)
                    )
                    .scalars()
                    .all()
                )
                for rank, row in enumerate(rows, start=1):
                    score = 1.0 / rank
                    chunk = self._from_chunk_record(row, score=score)
                    existing = by_id.get(chunk.point_id)
                    if existing is None or chunk.score > existing.score:
                        by_id[chunk.point_id] = chunk

        return sorted(by_id.values(), key=lambda item: item.score, reverse=True)

    def _dense_search(
        self,
        qdrant_collection: str,
        queries: Sequence[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        if not self.vector_store.is_configured or not self.embedder.is_configured:
            return []

        best_by_id: dict[str, RetrievedChunk] = {}
        try:
            vectors = self.embedder.embed_queries(list(queries))
        except Exception:
            # If dense retrieval provider is temporarily unavailable
            # (rate limit, timeout, service issue), fallback to BM25-only.
            return []

        for vector in vectors:
            try:
                hits = self.vector_store.search(qdrant_collection, vector, limit)
            except Exception:
                continue

            for hit in hits:
                chunk = self._from_search_hit(hit)
                if chunk is None:
                    continue
                existing = best_by_id.get(chunk.point_id)
                if existing is None or chunk.score > existing.score:
                    best_by_id[chunk.point_id] = chunk

        return sorted(best_by_id.values(), key=lambda item: item.score, reverse=True)

    def _get_bm25_index(self, collection_id: str) -> tuple[list[ChunkRecord], BM25Okapi | None]:
        """Return (rows, bm25) from cache, rebuilding only when chunk count changes."""
        with self.session_factory() as session:
            rows: list[ChunkRecord] = (
                session.execute(
                    select(ChunkRecord).where(ChunkRecord.collection_id == collection_id)
                )
                .scalars()
                .all()
            )

        if not rows:
            return [], None

        count = len(rows)
        with _bm25_lock:
            cached = _bm25_cache.get(collection_id)
            if cached is not None and cached[0] == count:
                return cached[1], cached[2]
            corpus = [self._tokenize(row.text) for row in rows]
            bm25 = BM25Okapi(corpus) if any(corpus) else None
            if bm25 is not None:
                _bm25_cache[collection_id] = (count, rows, bm25)
            return rows, bm25

    def _bm25_search(self, collection_id: str, queries: Sequence[str], limit: int) -> list[RetrievedChunk]:
        rows, bm25 = self._get_bm25_index(collection_id)

        if not rows or bm25 is None:
            return []

        best_by_id: dict[str, RetrievedChunk] = {}
        for query in self._dedupe_queries(queries):
            scores = bm25.get_scores(self._tokenize(query))
            ranked_indexes = sorted(range(len(scores)), key=lambda idx: scores[idx], reverse=True)[:limit]

            max_score = max((scores[idx] for idx in ranked_indexes), default=1.0) or 1.0
            for idx in ranked_indexes:
                row = rows[idx]
                normalized = float(scores[idx] / max_score)
                chunk = self._from_chunk_record(row, score=normalized)
                existing = best_by_id.get(chunk.point_id)
                if existing is None or chunk.score > existing.score:
                    best_by_id[chunk.point_id] = chunk

        return sorted(best_by_id.values(), key=lambda item: item.score, reverse=True)[:limit]

    def _rrf_merge(
        self,
        vector_ranked: list[RetrievedChunk],
        lexical_ranked: list[RetrievedChunk],
        *,
        k: int = 60,
    ) -> list[RetrievedChunk]:
        by_id: dict[str, RetrievedChunk] = {}
        rrf_scores: dict[str, float] = {}

        for rank, chunk in enumerate(vector_ranked, start=1):
            by_id.setdefault(chunk.point_id, chunk)
            rrf_scores[chunk.point_id] = rrf_scores.get(chunk.point_id, 0.0) + (1.0 / (k + rank))

        for rank, chunk in enumerate(lexical_ranked, start=1):
            by_id.setdefault(chunk.point_id, chunk)
            rrf_scores[chunk.point_id] = rrf_scores.get(chunk.point_id, 0.0) + (1.0 / (k + rank))

        merged = [
            by_id[point_id].with_score(score)
            for point_id, score in sorted(rrf_scores.items(), key=lambda item: item[1], reverse=True)
        ]
        return merged

    @staticmethod
    def _dedupe_queries(queries: Sequence[str]) -> list[str]:
        deduped: list[str] = []
        seen: set[str] = set()
        for query in queries:
            normalized = query.strip()
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(normalized)
        return deduped

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return TOKEN_PATTERN.findall((text or "").lower())

    @staticmethod
    def _from_search_hit(hit: SearchHit) -> RetrievedChunk | None:
        payload = hit.payload or {}
        text = str(payload.get("text", "")).strip()
        if not text:
            return None

        return RetrievedChunk(
            point_id=str(payload.get("chunk_id") or hit.point_id),
            text=text,
            score=float(hit.score),
            source_file=payload.get("source_file"),
            source_uri=payload.get("source_uri"),
            page_number=payload.get("page_number"),
            section_title=payload.get("section_title"),
            document_id=payload.get("document_id"),
            position=HybridRetriever._safe_int_or_none(payload.get("position")),
        )

    @staticmethod
    def _from_chunk_record(row: ChunkRecord, *, score: float) -> RetrievedChunk:
        return RetrievedChunk(
            point_id=row.point_id,
            text=row.text,
            score=score,
            source_file=row.source_file,
            source_uri=row.source_uri,
            page_number=row.page_number,
            section_title=row.section_title,
            document_id=row.document_id,
            position=row.position,
        )

    @staticmethod
    def _safe_int_or_none(value: object) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None
