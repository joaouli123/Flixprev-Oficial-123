from __future__ import annotations

from functools import lru_cache
from typing import Generator

from sqlalchemy.orm import Session

from config import Settings, get_settings
from core.agent.claude import ClaudeClient
from core.agent.rag_pipeline import RAGPipeline
from core.database.metadata import SessionLocal, get_db_session
from core.embeddings.voyage import VoyageEmbedder
from core.ingestion.chunker import Chunker
from core.ingestion.document_parser import DocumentParser
from core.ingestion.service import IngestionService
from core.ingestion.web_scraper import WebScraper
from core.retrieval.hybrid_search import HybridRetriever
from core.retrieval.reranker import CohereReranker
from core.retrieval.vector_store import QdrantVectorStore


def get_db() -> Generator[Session, None, None]:
    yield from get_db_session()


@lru_cache(maxsize=1)
def get_cached_settings() -> Settings:
    return get_settings()


@lru_cache(maxsize=1)
def get_vector_store() -> QdrantVectorStore:
    return QdrantVectorStore(get_cached_settings())


@lru_cache(maxsize=1)
def get_embedder() -> VoyageEmbedder:
    return VoyageEmbedder(get_cached_settings())


@lru_cache(maxsize=1)
def get_reranker() -> CohereReranker:
    return CohereReranker(get_cached_settings())


@lru_cache(maxsize=1)
def get_claude() -> ClaudeClient:
    return ClaudeClient(get_cached_settings())


@lru_cache(maxsize=1)
def get_retriever() -> HybridRetriever:
    return HybridRetriever(
        settings=get_cached_settings(),
        embedder=get_embedder(),
        vector_store=get_vector_store(),
        session_factory=SessionLocal,
    )


@lru_cache(maxsize=1)
def get_rag_pipeline() -> RAGPipeline:
    return RAGPipeline(
        settings=get_cached_settings(),
        retriever=get_retriever(),
        reranker=get_reranker(),
        claude=get_claude(),
    )


@lru_cache(maxsize=1)
def get_ingestion_service() -> IngestionService:
    settings = get_cached_settings()
    return IngestionService(
        settings=settings,
        parser=DocumentParser(),
        scraper=WebScraper(timeout_seconds=settings.request_timeout_seconds),
        chunker=Chunker(
            chunk_size_tokens=settings.max_chunk_tokens,
            chunk_overlap_tokens=settings.chunk_overlap_tokens,
        ),
        embedder=get_embedder(),
        vector_store=get_vector_store(),
    )
