from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_rag_pipeline
from api.models import CitationResponse, QueryRequest, QueryResponse, TokenUsageResponse
from core.agent.rag_pipeline import QueryResult, RAGPipeline
from core.database.metadata import CollectionRecord

router = APIRouter(prefix="/query", tags=["query"])


def _to_query_response(result: QueryResult) -> QueryResponse:
    return QueryResponse(
        answer=result.answer,
        citations=[
            CitationResponse(
                source_file=item.source_file,
                source_uri=item.source_uri,
                page_number=item.page_number,
                section_title=item.section_title,
                point_id=item.point_id,
                score=item.score,
            )
            for item in result.citations
        ],
        verified=result.verified,
        iterations=result.iterations,
        unsupported_claims=result.unsupported_claims,
        token_usage=TokenUsageResponse(
            input_tokens=result.token_usage.input_tokens,
            output_tokens=result.token_usage.output_tokens,
            cache_creation_input_tokens=result.token_usage.cache_creation_input_tokens,
            cache_read_input_tokens=result.token_usage.cache_read_input_tokens,
            total_input_tokens=result.token_usage.total_input_tokens,
            total_tokens=result.token_usage.total_tokens,
        ),
    )


@router.post("", response_model=QueryResponse)
def query(
    payload: QueryRequest,
    db: Session = Depends(get_db),
    rag_pipeline: RAGPipeline = Depends(get_rag_pipeline),
) -> QueryResponse:
    collection = db.get(CollectionRecord, payload.collection_id)
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    try:
        result = rag_pipeline.ask(
            collection=collection,
            question=payload.question,
            agent_instructions=payload.agent_instructions,
            top_k=payload.top_k,
            fast_mode=payload.fast_mode,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Query pipeline failed: {exc}")

    return _to_query_response(result)


@router.post("/stream")
def query_stream(
    payload: QueryRequest,
    db: Session = Depends(get_db),
    rag_pipeline: RAGPipeline = Depends(get_rag_pipeline),
) -> StreamingResponse:
    collection = db.get(CollectionRecord, payload.collection_id)
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    def event_stream():
        initial_event = {
            "type": "status",
            "message": "Iniciando analise precisa...",
            "padding": " " * 2048,
        }
        yield f"data: {json.dumps(initial_event, ensure_ascii=False)}\n\n"

        try:
            for event in rag_pipeline.ask_stream(
                collection=collection,
                question=payload.question,
                agent_instructions=payload.agent_instructions,
                top_k=payload.top_k,
                fast_mode=payload.fast_mode,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except RuntimeError as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': f'Query pipeline failed: {exc}'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
