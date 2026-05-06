from __future__ import annotations

import re
from dataclasses import dataclass

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from config import Settings


@dataclass(slots=True)
class VectorPoint:
    point_id: str
    vector: list[float]
    payload: dict


@dataclass(slots=True)
class SearchHit:
    point_id: str
    score: float
    payload: dict


class QdrantVectorStore:
    """Qdrant abstraction for collection creation, upsert, and search."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: QdrantClient | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.qdrant_url and self.settings.qdrant_api_key)

    def build_collection_name(self, collection_id: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]+", "_", collection_id).strip("_").lower()
        prefix = re.sub(r"[^a-zA-Z0-9_]+", "_", self.settings.qdrant_collection_prefix).strip("_")
        candidate = f"{prefix}_{safe}" if prefix else safe
        return candidate[:255]

    def ensure_collection(self, collection_name: str, vector_size: int) -> None:
        client = self._require_client()
        existing = client.get_collections().collections
        if any(item.name == collection_name for item in existing):
            return

        client.create_collection(
            collection_name=collection_name,
            vectors_config=qmodels.VectorParams(size=vector_size, distance=qmodels.Distance.COSINE),
        )

    def delete_collection(self, collection_name: str) -> None:
        client = self._require_client()
        existing = client.get_collections().collections
        if not any(item.name == collection_name for item in existing):
            return
        client.delete_collection(collection_name=collection_name)

    def upsert_chunks(self, collection_name: str, points: list[VectorPoint]) -> None:
        if not points:
            return
        client = self._require_client()

        batch_size = 128
        for offset in range(0, len(points), batch_size):
            batch = points[offset : offset + batch_size]
            qdrant_points = [
                qmodels.PointStruct(id=point.point_id, vector=point.vector, payload=point.payload)
                for point in batch
            ]
            client.upsert(collection_name=collection_name, points=qdrant_points, wait=True)

    def search(self, collection_name: str, query_vector: list[float], limit: int) -> list[SearchHit]:
        client = self._require_client()
        if hasattr(client, "query_points"):
            response = client.query_points(
                collection_name=collection_name,
                query=query_vector,
                with_payload=True,
                limit=limit,
            )
            items = list(getattr(response, "points", []) or [])
        elif hasattr(client, "search"):
            # Backward compatibility with older qdrant-client releases.
            items = client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                with_payload=True,
                limit=limit,
            )
        else:
            raise RuntimeError("Unsupported qdrant-client version: no query/search method available")

        hits: list[SearchHit] = []
        for item in items:
            payload = dict(item.payload or {})
            hits.append(
                SearchHit(
                    point_id=str(item.id),
                    score=float(item.score),
                    payload=payload,
                )
            )
        return hits

    def _require_client(self) -> QdrantClient:
        if not self.is_configured:
            raise RuntimeError("Qdrant is not configured. Set QDRANT_URL and QDRANT_API_KEY.")

        if self._client is None:
            self._client = QdrantClient(
                url=self.settings.qdrant_url,
                api_key=self.settings.qdrant_api_key,
                timeout=self.settings.qdrant_timeout_seconds,
            )

        return self._client
