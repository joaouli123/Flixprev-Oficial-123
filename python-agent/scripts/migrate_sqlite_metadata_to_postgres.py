from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime
from pathlib import Path

import psycopg


def parse_dt(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value

    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.utcnow()


def sqlite_rows(conn: sqlite3.Connection, table: str) -> list[dict[str, object]]:
    return [dict(row) for row in conn.execute(f"SELECT * FROM {table}").fetchall()]


def get_target_url() -> str:
    target_url = os.environ.get("DATABASE_PUBLIC_URL") or os.environ.get("PYTHON_AGENT_DATABASE_URL")
    if not target_url:
        raise RuntimeError("DATABASE_PUBLIC_URL or PYTHON_AGENT_DATABASE_URL is required")

    if target_url.startswith("postgresql+psycopg://"):
        return target_url.replace("postgresql+psycopg://", "postgresql://", 1)

    return target_url


def migrate(source_db: Path) -> dict[str, int]:
    if not source_db.exists():
        raise FileNotFoundError(f"source db not found: {source_db}")

    src = sqlite3.connect(source_db)
    src.row_factory = sqlite3.Row
    collections = sqlite_rows(src, "collections")
    documents = sqlite_rows(src, "documents")
    chunks = sqlite_rows(src, "chunks")
    jobs = sqlite_rows(src, "ingestion_jobs")
    collection_ids = {str(row["id"]) for row in collections}
    jobs = [row for row in jobs if str(row.get("collection_id")) in collection_ids]

    with psycopg.connect(get_target_url()) as conn:
        with conn.cursor() as cur:
            for row in collections:
                cur.execute(
                    """
                    INSERT INTO collections (id, name, description, qdrant_collection, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        qdrant_collection = EXCLUDED.qdrant_collection,
                        created_at = EXCLUDED.created_at
                    """,
                    (row["id"], row["name"], row.get("description"), row["qdrant_collection"], parse_dt(row.get("created_at"))),
                )

            for row in documents:
                cur.execute(
                    """
                    INSERT INTO documents (id, collection_id, source_type, source_name, source_uri, page_count, status, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        collection_id = EXCLUDED.collection_id,
                        source_type = EXCLUDED.source_type,
                        source_name = EXCLUDED.source_name,
                        source_uri = EXCLUDED.source_uri,
                        page_count = EXCLUDED.page_count,
                        status = EXCLUDED.status,
                        created_at = EXCLUDED.created_at
                    """,
                    (
                        row["id"],
                        row["collection_id"],
                        row["source_type"],
                        row["source_name"],
                        row.get("source_uri"),
                        row.get("page_count"),
                        row["status"],
                        parse_dt(row.get("created_at")),
                    ),
                )

            chunk_sql = """
                INSERT INTO chunks (id, collection_id, document_id, point_id, text, source_file, source_uri, page_number, section_title, position, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    collection_id = EXCLUDED.collection_id,
                    document_id = EXCLUDED.document_id,
                    point_id = EXCLUDED.point_id,
                    text = EXCLUDED.text,
                    source_file = EXCLUDED.source_file,
                    source_uri = EXCLUDED.source_uri,
                    page_number = EXCLUDED.page_number,
                    section_title = EXCLUDED.section_title,
                    position = EXCLUDED.position,
                    created_at = EXCLUDED.created_at
            """
            cur.executemany(
                chunk_sql,
                [
                    (
                        row["id"],
                        row["collection_id"],
                        row["document_id"],
                        row["point_id"],
                        row["text"],
                        row.get("source_file"),
                        row.get("source_uri"),
                        row.get("page_number"),
                        row.get("section_title"),
                        row.get("position") or 0,
                        parse_dt(row.get("created_at")),
                    )
                    for row in chunks
                ],
            )

            for row in jobs:
                cur.execute(
                    """
                    INSERT INTO ingestion_jobs (id, collection_id, document_id, status, progress, message, error, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        collection_id = EXCLUDED.collection_id,
                        document_id = EXCLUDED.document_id,
                        status = EXCLUDED.status,
                        progress = EXCLUDED.progress,
                        message = EXCLUDED.message,
                        error = EXCLUDED.error,
                        created_at = EXCLUDED.created_at,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        row["id"],
                        row["collection_id"],
                        row.get("document_id"),
                        row["status"],
                        row.get("progress") or 0,
                        row.get("message"),
                        row.get("error"),
                        parse_dt(row.get("created_at")),
                        parse_dt(row.get("updated_at")),
                    ),
                )

        conn.commit()

    return {
        "collections": len(collections),
        "documents": len(documents),
        "chunks": len(chunks),
        "jobs": len(jobs),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Python agent metadata from local SQLite to Postgres")
    parser.add_argument("--source", default="agent.db", help="Path to local SQLite agent metadata DB")
    args = parser.parse_args()

    print(migrate(Path(args.source)))


if __name__ == "__main__":
    main()