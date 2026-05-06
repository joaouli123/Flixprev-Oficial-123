from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class CollectionCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class CollectionUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class CollectionResponse(BaseModel):
    id: str
    name: str
    description: str | None
    qdrant_collection: str
    created_at: datetime


class CollectionDocumentSummaryResponse(BaseModel):
    id: str
    source_type: str
    source_name: str
    status: str
    page_count: int | None
    chunk_count: int
    created_at: datetime


class CollectionOverviewResponse(BaseModel):
    collection_id: str
    collection_name: str
    document_count: int
    completed_documents: int
    processing_documents: int
    failed_documents: int
    chunk_count: int
    recent_documents: list[CollectionDocumentSummaryResponse]


class IngestUrlRequest(BaseModel):
    collection_id: str
    url: HttpUrl


class IngestionJobResponse(BaseModel):
    id: str
    collection_id: str
    document_id: str | None
    status: str
    progress: float
    message: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime


class QueryRequest(BaseModel):
    collection_id: str
    question: str = Field(min_length=1)
    agent_instructions: str | None = Field(default=None, max_length=6000)
    top_k: int | None = Field(default=None, gt=0, le=50)
    fast_mode: bool = False


class CitationResponse(BaseModel):
    source_file: str | None
    source_uri: str | None
    page_number: int | None
    section_title: str | None
    point_id: str
    score: float


class TokenUsageResponse(BaseModel):
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    total_input_tokens: int
    total_tokens: int


class QueryResponse(BaseModel):
    answer: str
    citations: list[CitationResponse]
    verified: bool
    iterations: int
    unsupported_claims: list[str]
    token_usage: TokenUsageResponse
