from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from sqlalchemy.orm import Session

from config import Settings
from core.database.metadata import ChunkRecord, CollectionRecord, DocumentRecord
from core.embeddings.voyage import VoyageEmbedder
from core.ingestion.chunker import Chunker
from core.ingestion.document_parser import DocumentParser, ParsedSection
from core.ingestion.web_scraper import WebScraper
from core.retrieval.vector_store import QdrantVectorStore, VectorPoint

ProgressCallback = Callable[[float, str], None]


class IngestionService:
    """Ingest files or URLs into SQL metadata and Qdrant vectors."""

    def __init__(
        self,
        *,
        settings: Settings,
        parser: DocumentParser,
        scraper: WebScraper,
        chunker: Chunker,
        embedder: VoyageEmbedder,
        vector_store: QdrantVectorStore,
    ) -> None:
        self.settings = settings
        self.parser = parser
        self.scraper = scraper
        self.chunker = chunker
        self.embedder = embedder
        self.vector_store = vector_store

    def ingest_document(
        self,
        db: Session,
        *,
        collection: CollectionRecord,
        file_path: Path,
        source_name: str,
        progress_cb: ProgressCallback | None = None,
    ) -> DocumentRecord:
        document = DocumentRecord(
            collection_id=collection.id,
            source_type="file",
            source_name=source_name,
            source_uri=None,
            status="processing",
        )
        db.add(document)
        db.flush()
        db.commit()
        db.refresh(document)

        try:
            self._progress(progress_cb, 0.10, "Parsing document")

            def parser_progress(done_pages: int, total_pages: int, message: str) -> None:
                if total_pages <= 0:
                    return
                ratio = max(0.0, min(done_pages / total_pages, 1.0))
                self._progress(
                    progress_cb,
                    0.10 + (ratio * 0.24),
                    f"{message} ({done_pages}/{total_pages})",
                )

            sections = self.parser.parse_file(file_path, progress_cb=parser_progress)
            if not sections:
                raise ValueError("No parseable text found in document")

            page_numbers = [section.page_number for section in sections if section.page_number is not None]
            document.page_count = max(page_numbers) if page_numbers else None

            self._progress(progress_cb, 0.35, "Chunking document")
            chunks = self.chunker.chunk_sections(
                sections,
                collection_id=collection.id,
                document_id=document.id,
            )
            if not chunks:
                raise ValueError("No chunks generated from document")

            self._progress(progress_cb, 0.55, "Embedding and indexing chunks")
            self._index_chunks(db, collection, chunks, progress_cb=progress_cb)

            document.status = "completed"
            db.commit()
            db.refresh(document)
            self._progress(progress_cb, 1.00, "Document ingestion completed")
            return document
        except Exception:
            document.status = "failed"
            db.commit()
            raise

    def ingest_url(
        self,
        db: Session,
        *,
        collection: CollectionRecord,
        url: str,
        progress_cb: ProgressCallback | None = None,
    ) -> DocumentRecord:
        document = DocumentRecord(
            collection_id=collection.id,
            source_type="url",
            source_name=url,
            source_uri=url,
            status="processing",
        )
        db.add(document)
        db.flush()
        db.commit()
        db.refresh(document)

        try:
            self._progress(progress_cb, 0.15, "Fetching URL")
            sections = self.scraper.parse_url(url)
            if not sections:
                raise ValueError("No parseable text found in URL")

            self._progress(progress_cb, 0.35, "Chunking URL content")
            chunks = self.chunker.chunk_sections(
                sections,
                collection_id=collection.id,
                document_id=document.id,
            )
            if not chunks:
                raise ValueError("No chunks generated from URL content")

            self._progress(progress_cb, 0.60, "Embedding and indexing chunks")
            self._index_chunks(db, collection, chunks, progress_cb=progress_cb)

            document.status = "completed"
            db.commit()
            db.refresh(document)
            self._progress(progress_cb, 1.00, "URL ingestion completed")
            return document
        except Exception:
            document.status = "failed"
            db.commit()
            raise

    def _index_chunks(
        self,
        db: Session,
        collection: CollectionRecord,
        chunks,
        *,
        progress_cb: ProgressCallback | None,
    ) -> None:
        chunk_rows = [
            ChunkRecord(
                collection_id=chunk.collection_id,
                document_id=chunk.document_id,
                point_id=chunk.point_id,
                text=chunk.text,
                source_file=chunk.source_file,
                source_uri=chunk.source_uri,
                page_number=chunk.page_number,
                section_title=chunk.section_title,
                position=chunk.position,
            )
            for chunk in chunks
        ]
        db.add_all(chunk_rows)
        db.flush()
        db.commit()

        if not self.vector_store.is_configured or not self.embedder.is_configured:
            self._progress(progress_cb, 0.95, "Dense indexing skipped; lexical index ready")
            return

        vector_points: list[VectorPoint] = []
        total = len(chunks)

        try:
            for offset in range(0, total, self.settings.embedding_batch_size):
                batch = chunks[offset : offset + self.settings.embedding_batch_size]
                embeddings = self.embedder.embed_documents([chunk.text for chunk in batch])
                for chunk, embedding in zip(batch, embeddings, strict=True):
                    payload = {
                        "collection_id": chunk.collection_id,
                        "document_id": chunk.document_id,
                        "chunk_id": chunk.point_id,
                        "text": chunk.text,
                        "source_file": chunk.source_file,
                        "source_uri": chunk.source_uri,
                        "page_number": chunk.page_number,
                        "section_title": chunk.section_title,
                        "position": chunk.position,
                    }
                    vector_points.append(
                        VectorPoint(
                            point_id=chunk.point_id,
                            vector=embedding,
                            payload=payload,
                        )
                    )

                ratio = (offset + len(batch)) / total
                self._progress(progress_cb, 0.60 + (ratio * 0.30), f"Embedded {offset + len(batch)} / {total} chunks")

            if not vector_points:
                self._progress(progress_cb, 0.95, "Dense indexing skipped; lexical index ready")
                return

            vector_size = len(vector_points[0].vector)
            self.vector_store.ensure_collection(collection.qdrant_collection, vector_size=vector_size)
            self.vector_store.upsert_chunks(collection.qdrant_collection, vector_points)
        except Exception as exc:
            self._progress(
                progress_cb,
                0.95,
                f"Dense indexing skipped ({self._short_error(exc)}); lexical index ready",
            )
            return

    @staticmethod
    def _progress(progress_cb: ProgressCallback | None, progress: float, message: str) -> None:
        if progress_cb is None:
            return
        bounded = max(0.0, min(progress, 1.0))
        progress_cb(bounded, message)

    @staticmethod
    def _short_error(exc: Exception) -> str:
        message = str(exc).strip()
        if not message:
            return exc.__class__.__name__
        return message[:220]
