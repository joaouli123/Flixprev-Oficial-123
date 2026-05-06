from __future__ import annotations

import voyageai
from tenacity import retry, stop_after_attempt, wait_exponential

from config import Settings


class VoyageEmbedder:
    """Voyage AI embedding wrapper."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = voyageai.Client(api_key=settings.voyage_api_key) if settings.voyage_api_key else None

    @property
    def is_configured(self) -> bool:
        return self._client is not None

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = self._embed(texts=texts, input_type="document")
        return [list(vector) for vector in response.embeddings]

    def embed_query(self, text: str) -> list[float]:
        response = self._embed(texts=[text], input_type="query")
        return list(response.embeddings[0])

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = self._embed(texts=texts, input_type="query")
        return [list(vector) for vector in response.embeddings]

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=1, max=20), reraise=True)
    def _embed(self, *, texts: list[str], input_type: str):
        client = self._require_client()
        return client.embed(
            texts=texts,
            model=self.settings.voyage_model,
            input_type=input_type,
        )

    def _require_client(self) -> voyageai.Client:
        if self._client is None:
            raise RuntimeError("VOYAGE_API_KEY is missing. Configure it before embedding.")
        return self._client
