from __future__ import annotations

import httpx

from config import Settings
from core.retrieval.hybrid_search import RetrievedChunk


class CohereReranker:
    """Optional reranker; falls back to retrieval order when key is absent."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.cohere_api_key)

    def rerank(self, query: str, chunks: list[RetrievedChunk], top_n: int) -> list[RetrievedChunk]:
        if not chunks:
            return []

        ordered = sorted(chunks, key=lambda item: item.score, reverse=True)
        if not self.is_configured:
            return ordered[:top_n]

        try:
            response = httpx.post(
                "https://api.cohere.com/v2/rerank",
                headers={
                    "Authorization": f"Bearer {self.settings.cohere_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.settings.cohere_rerank_model,
                    "query": query,
                    "documents": [{"text": chunk.text} for chunk in chunks],
                    "top_n": top_n,
                },
                timeout=self.settings.request_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            reranked: list[RetrievedChunk] = []
            for item in payload.get("results", []):
                idx = int(item.get("index", -1))
                if idx < 0 or idx >= len(chunks):
                    continue
                reranked.append(chunks[idx].with_score(float(item.get("relevance_score", 0.0))))

            if reranked:
                return reranked
        except Exception:
            pass

        return ordered[:top_n]
