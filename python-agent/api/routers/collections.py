from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_vector_store
from api.models import (
    CollectionCreateRequest,
    CollectionDocumentSummaryResponse,
    CollectionOverviewResponse,
    CollectionResponse,
    CollectionUpdateRequest,
)
from config import get_settings
from core.database.metadata import ChunkRecord, CollectionRecord, DocumentRecord
from core.retrieval.vector_store import QdrantVectorStore

router = APIRouter(prefix="/collections", tags=["collections"])


def _to_response(record: CollectionRecord) -> CollectionResponse:
    return CollectionResponse(
        id=record.id,
        name=record.name,
        description=record.description,
        qdrant_collection=record.qdrant_collection,
        created_at=record.created_at,
    )


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreateRequest,
    db: Session = Depends(get_db),
    vector_store: QdrantVectorStore = Depends(get_vector_store),
) -> CollectionResponse:
    if not vector_store.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Qdrant not configured. Set QDRANT_URL and QDRANT_API_KEY.",
        )

    existing = db.execute(
        select(CollectionRecord).where(CollectionRecord.name == payload.name.strip())
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Collection name already exists")

    collection_id = str(uuid4())
    qdrant_collection = vector_store.build_collection_name(collection_id)

    record = CollectionRecord(
        id=collection_id,
        name=payload.name.strip(),
        description=payload.description,
        qdrant_collection=qdrant_collection,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    settings = get_settings()
    try:
        vector_store.ensure_collection(
            collection_name=qdrant_collection,
            vector_size=settings.voyage_embedding_dimension,
        )
    except Exception as exc:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to create Qdrant collection: {exc}")

    return _to_response(record)


@router.get("", response_model=list[CollectionResponse])
def list_collections(db: Session = Depends(get_db)) -> list[CollectionResponse]:
    rows = db.execute(select(CollectionRecord).order_by(CollectionRecord.created_at.desc())).scalars().all()
    return [_to_response(row) for row in rows]


@router.get("/{collection_id}/overview", response_model=CollectionOverviewResponse)
def get_collection_overview(collection_id: str, db: Session = Depends(get_db)) -> CollectionOverviewResponse:
    collection = db.get(CollectionRecord, collection_id)
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    document_count = db.execute(
        select(func.count()).select_from(DocumentRecord).where(DocumentRecord.collection_id == collection_id)
    ).scalar_one()
    chunk_count = db.execute(
        select(func.count()).select_from(ChunkRecord).where(ChunkRecord.collection_id == collection_id)
    ).scalar_one()

    status_rows = db.execute(
        select(DocumentRecord.status, func.count())
        .where(DocumentRecord.collection_id == collection_id)
        .group_by(DocumentRecord.status)
    ).all()
    status_counts = {str(status_name): int(total) for status_name, total in status_rows}

    recent_docs = db.execute(
        select(DocumentRecord)
        .where(DocumentRecord.collection_id == collection_id)
        .order_by(DocumentRecord.created_at.desc())
        .limit(20)
    ).scalars().all()

    if recent_docs:
        recent_doc_ids = [doc.id for doc in recent_docs]
        chunk_rows = db.execute(
            select(ChunkRecord.document_id, func.count())
            .where(ChunkRecord.document_id.in_(recent_doc_ids))
            .group_by(ChunkRecord.document_id)
        ).all()
        chunk_counts_by_doc = {str(doc_id): int(total) for doc_id, total in chunk_rows}
    else:
        chunk_counts_by_doc = {}

    return CollectionOverviewResponse(
        collection_id=collection.id,
        collection_name=collection.name,
        document_count=int(document_count),
        completed_documents=status_counts.get("completed", 0),
        processing_documents=status_counts.get("processing", 0) + status_counts.get("queued", 0),
        failed_documents=status_counts.get("failed", 0),
        chunk_count=int(chunk_count),
        recent_documents=[
            CollectionDocumentSummaryResponse(
                id=doc.id,
                source_type=doc.source_type,
                source_name=doc.source_name,
                status=doc.status,
                page_count=doc.page_count,
                chunk_count=chunk_counts_by_doc.get(doc.id, 0),
                created_at=doc.created_at,
            )
            for doc in recent_docs
        ],
    )


@router.patch("/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: str,
    payload: CollectionUpdateRequest,
    db: Session = Depends(get_db),
) -> CollectionResponse:
    record = db.get(CollectionRecord, collection_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    if payload.name is not None:
        name = payload.name.strip()
        conflict = db.execute(
            select(CollectionRecord).where(CollectionRecord.name == name, CollectionRecord.id != collection_id)
        ).scalar_one_or_none()
        if conflict is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Collection name already exists")
        record.name = name
    if payload.description is not None:
        record.description = payload.description
    db.commit()
    db.refresh(record)
    return _to_response(record)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    vector_store: QdrantVectorStore = Depends(get_vector_store),
) -> None:
    record = db.get(CollectionRecord, collection_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    if vector_store.is_configured:
        try:
            vector_store.delete_collection(record.qdrant_collection)
        except Exception:
            pass

    db.delete(record)
    db.commit()
