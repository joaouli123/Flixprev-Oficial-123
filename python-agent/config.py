from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Surgical RAG Agent"
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = Field(default="sqlite:///./agent.db", validation_alias="PYTHON_AGENT_DATABASE_URL")

    data_dir: Path = Path("./data")
    upload_dir: Path = Path("./data/uploads")

    qdrant_url: str | None = None
    qdrant_api_key: str | None = None
    qdrant_timeout_seconds: float = 60.0
    qdrant_collection_prefix: str = "kb"

    anthropic_api_key: str | None = None
    claude_model: str = "claude-3-5-sonnet-20241022"

    voyage_api_key: str | None = None
    voyage_model: str = "voyage-4"
    voyage_embedding_dimension: int = Field(default=1024, gt=0)

    cohere_api_key: str | None = None
    cohere_rerank_model: str = "rerank-v4.0-pro"

    max_chunk_tokens: int = Field(default=512, gt=64)
    chunk_overlap_tokens: int = Field(default=128, ge=0)
    retrieval_top_k: int = Field(default=5, gt=0)
    retrieval_candidates: int = Field(default=10, gt=0)
    max_verify_iterations: int = Field(default=1, gt=0)
    embedding_batch_size: int = Field(default=64, gt=0)

    request_timeout_seconds: float = 60.0

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings
