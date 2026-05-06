from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_ingestion_service
from api.models import IngestionJobResponse, IngestUrlRequest
from config import get_settings
from core.database.metadata import CollectionRecord, IngestionJobRecord, SessionLocal
from core.ingestion.service import IngestionService

router = APIRouter(prefix="/ingest", tags=["ingestion"])


def _to_job_response(job: IngestionJobRecord) -> IngestionJobResponse:
    return IngestionJobResponse(
        id=job.id,
        collection_id=job.collection_id,
        document_id=job.document_id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _set_job_state(
    *,
    job_id: str,
    status_value: str,
    progress: float,
    message: str,
    error: str | None = None,
    document_id: str | None = None,
) -> None:
    with SessionLocal() as db:
        job = db.get(IngestionJobRecord, job_id)
        if job is None:
            return
        job.status = status_value
        job.progress = max(0.0, min(progress, 1.0))
        job.message = message
        job.error = error
        if document_id:
            job.document_id = document_id
        job.updated_at = datetime.utcnow()
        db.commit()


def _run_document_ingestion(
    *,
    job_id: str,
    collection_id: str,
    file_path: str,
    source_name: str,
    ingestion_service: IngestionService,
) -> None:
    target = Path(file_path)
    try:
        with SessionLocal() as db:
            collection = db.get(CollectionRecord, collection_id)
            if collection is None:
                raise ValueError("Collection not found")

            def progress_cb(progress: float, message: str) -> None:
                _set_job_state(
                    job_id=job_id,
                    status_value="processing",
                    progress=progress,
                    message=message,
                )

            _set_job_state(
                job_id=job_id,
                status_value="processing",
                progress=0.05,
                message="Starting file ingestion",
            )

            document = ingestion_service.ingest_document(
                db,
                collection=collection,
                file_path=target,
                source_name=source_name,
                progress_cb=progress_cb,
            )

            _set_job_state(
                job_id=job_id,
                status_value="completed",
                progress=1.0,
                message="Ingestion completed",
                document_id=document.id,
            )
    except Exception as exc:
        _set_job_state(
            job_id=job_id,
            status_value="failed",
            progress=1.0,
            message="Ingestion failed",
            error=str(exc),
        )
    finally:
        if target.exists():
            target.unlink(missing_ok=True)


def _run_url_ingestion(
    *,
    job_id: str,
    collection_id: str,
    url: str,
    ingestion_service: IngestionService,
) -> None:
    try:
        with SessionLocal() as db:
            collection = db.get(CollectionRecord, collection_id)
            if collection is None:
                raise ValueError("Collection not found")

            def progress_cb(progress: float, message: str) -> None:
                _set_job_state(
                    job_id=job_id,
                    status_value="processing",
                    progress=progress,
                    message=message,
                )

            _set_job_state(
                job_id=job_id,
                status_value="processing",
                progress=0.05,
                message="Starting URL ingestion",
            )

            document = ingestion_service.ingest_url(
                db,
                collection=collection,
                url=url,
                progress_cb=progress_cb,
            )

            _set_job_state(
                job_id=job_id,
                status_value="completed",
                progress=1.0,
                message="Ingestion completed",
                document_id=document.id,
            )
    except Exception as exc:
        _set_job_state(
            job_id=job_id,
            status_value="failed",
            progress=1.0,
            message="Ingestion failed",
            error=str(exc),
        )


@router.post("/document", response_model=IngestionJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_document(
    background_tasks: BackgroundTasks,
    collection_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    ingestion_service: IngestionService = Depends(get_ingestion_service),
) -> IngestionJobResponse:
    collection = db.get(CollectionRecord, collection_id)
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    job = IngestionJobRecord(
        collection_id=collection.id,
        status="queued",
        progress=0.0,
        message="Ingestion queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    filename = Path(file.filename or "upload.bin").name
    settings = get_settings()
    target_path = settings.upload_dir / f"{job.id}_{filename}"

    with target_path.open("wb") as handle:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    await file.close()

    background_tasks.add_task(
        _run_document_ingestion,
        job_id=job.id,
        collection_id=collection.id,
        file_path=str(target_path),
        source_name=filename,
        ingestion_service=ingestion_service,
    )

    return _to_job_response(job)


@router.post("/url", response_model=IngestionJobResponse, status_code=status.HTTP_202_ACCEPTED)
def ingest_url(
    payload: IngestUrlRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ingestion_service: IngestionService = Depends(get_ingestion_service),
) -> IngestionJobResponse:
    collection = db.get(CollectionRecord, payload.collection_id)
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    job = IngestionJobRecord(
        collection_id=collection.id,
        status="queued",
        progress=0.0,
        message="URL ingestion queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        _run_url_ingestion,
        job_id=job.id,
        collection_id=collection.id,
        url=str(payload.url),
        ingestion_service=ingestion_service,
    )

    return _to_job_response(job)


@router.get("/status/{job_id}", response_model=IngestionJobResponse)
def get_ingestion_status(job_id: str, db: Session = Depends(get_db)) -> IngestionJobResponse:
    job = db.get(IngestionJobRecord, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return _to_job_response(job)
