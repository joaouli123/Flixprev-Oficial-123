from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import requests
from sqlalchemy import select

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.database.metadata import ChunkRecord, CollectionRecord, DocumentRecord, SessionLocal

FALLBACK_TEXT = "esta informacao nao foi encontrada na base de conhecimento."
STOPWORDS = {
    "a",
    "o",
    "os",
    "as",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "em",
    "na",
    "no",
    "nas",
    "nos",
    "e",
    "ou",
    "que",
    "para",
    "por",
    "com",
    "um",
    "uma",
    "ao",
    "aos",
    "como",
    "se",
    "sua",
    "seu",
    "sobre",
    "mais",
    "menos",
}
TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9\u00C0-\u017F]{3,}", re.UNICODE)
SENTENCE_SPLIT = re.compile(r"(?<=[\.!\?;])\s+")


@dataclass(slots=True)
class QuestionCase:
    question: str
    reference_sentence: str
    chunk_id: str
    page_number: int | None


def normalize_tokens(text: str) -> list[str]:
    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text or "")]
    return [token for token in tokens if token not in STOPWORDS]


def make_question(sentence: str) -> str:
    compact = " ".join(sentence.split())
    compact = compact.replace('"', "'")
    words = compact.split()
    quoted = " ".join(words[: min(len(words), 20)])

    art_match = re.search(r"\bart\.?\s*\d+[a-zA-Z0-9\-]*", compact, flags=re.IGNORECASE)
    if art_match:
        return f"No documento CNIS, o que diz {art_match.group(0)}?"

    return f"No documento CNIS, explique o trecho: \"{quoted}\"."


def lexical_overlap(answer: str, reference: str) -> float:
    answer_tokens = set(normalize_tokens(answer))
    reference_tokens = set(normalize_tokens(reference))
    if not reference_tokens:
        return 0.0
    common = answer_tokens.intersection(reference_tokens)
    return len(common) / len(reference_tokens)


def ask_query(base_url: str, collection_id: str, question: str, retries: int = 4) -> dict:
    delay = 1.0
    last_error: str | None = None
    for _ in range(retries):
        try:
            response = requests.post(
                f"{base_url.rstrip('/')}/query",
                json={"collection_id": collection_id, "question": question},
                timeout=180,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            time.sleep(delay)
            delay = min(delay * 2, 12)

    return {
        "answer": f"ERROR: {last_error}",
        "citations": [],
        "verified": False,
        "iterations": 0,
        "unsupported_claims": [last_error or "unknown error"],
        "token_usage": {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "total_input_tokens": 0,
            "total_tokens": 0,
        },
    }


def load_cases(collection_name: str, question_count: int, seed: int) -> tuple[str, list[QuestionCase]]:
    random.seed(seed)
    with SessionLocal() as session:
        collection = session.execute(
            select(CollectionRecord).where(CollectionRecord.name == collection_name)
        ).scalar_one_or_none()
        if collection is None:
            raise RuntimeError(f"Collection not found: {collection_name}")

        latest_completed_document = session.execute(
            select(DocumentRecord)
            .where(
                DocumentRecord.collection_id == collection.id,
                DocumentRecord.status == "completed",
            )
            .order_by(DocumentRecord.created_at.desc())
        ).scalars().first()
        if latest_completed_document is None:
            raise RuntimeError("No completed document available for this collection")

        chunks = session.execute(
            select(ChunkRecord)
            .where(ChunkRecord.document_id == latest_completed_document.id)
            .order_by(ChunkRecord.position.asc())
        ).scalars().all()

    sentence_pool: list[tuple[str, str, int | None]] = []
    for chunk in chunks:
        text = " ".join((chunk.text or "").split())
        if len(text) < 80:
            continue
        sentences = SENTENCE_SPLIT.split(text)
        for sentence in sentences:
            cleaned = " ".join(sentence.split())
            if len(cleaned) < 80 or len(cleaned) > 320:
                continue
            sentence_pool.append((cleaned, chunk.point_id, chunk.page_number))

    if len(sentence_pool) < question_count:
        raise RuntimeError(
            f"Not enough candidate sentences for {question_count} questions. Available: {len(sentence_pool)}"
        )

    selected = random.sample(sentence_pool, question_count)
    cases = [
        QuestionCase(
            question=make_question(sentence),
            reference_sentence=sentence,
            chunk_id=chunk_id,
            page_number=page_number,
        )
        for sentence, chunk_id, page_number in selected
    ]
    return collection.id, cases


def run_battery(
    base_url: str,
    collection_name: str,
    question_count: int,
    seed: int,
    *,
    progress_every: int = 10,
    live_preview: bool = False,
) -> dict:
    collection_id, cases = load_cases(collection_name, question_count, seed)

    results: list[dict] = []
    token_total = 0
    start = time.time()

    for idx, case in enumerate(cases, start=1):
        response = ask_query(base_url, collection_id, case.question)
        answer = str(response.get("answer", "") or "")
        citations = response.get("citations") or []
        token_usage = response.get("token_usage") or {}
        turn_tokens = int(token_usage.get("total_tokens", 0) or 0)
        token_total += turn_tokens

        fallback = FALLBACK_TEXT in answer.strip().lower()
        overlap = lexical_overlap(answer, case.reference_sentence)
        has_citation = len(citations) > 0
        passed = (not fallback) and has_citation and overlap >= 0.12

        result = {
            "index": idx,
            "question": case.question,
            "reference_sentence": case.reference_sentence,
            "reference_chunk_id": case.chunk_id,
            "reference_page_number": case.page_number,
            "answer": answer,
            "has_citation": has_citation,
            "fallback": fallback,
            "overlap": round(overlap, 4),
            "passed": passed,
            "verified": bool(response.get("verified", False)),
            "iterations": int(response.get("iterations", 0) or 0),
            "citations": citations,
            "unsupported_claims": response.get("unsupported_claims") or [],
            "token_usage": token_usage,
        }
        results.append(result)

        if live_preview:
            question_preview = case.question.replace("\n", " ").strip()
            if len(question_preview) > 140:
                question_preview = question_preview[:137] + "..."
            print(f"[{idx}/{question_count}] {question_preview}", flush=True)
            print(
                f"   -> pass={passed} fallback={fallback} citations={len(citations)} overlap={round(overlap, 4)} tokens={turn_tokens}",
                flush=True,
            )

        if progress_every > 0 and idx % progress_every == 0:
            print(f"progress: {idx}/{question_count} | cumulative_tokens={token_total}", flush=True)

    elapsed = round(time.time() - start, 2)
    passes = sum(1 for item in results if item["passed"])
    fallbacks = sum(1 for item in results if item["fallback"])
    citations = sum(1 for item in results if item["has_citation"])
    avg_overlap = round(sum(item["overlap"] for item in results) / len(results), 4)
    avg_iterations = round(sum(item["iterations"] for item in results) / len(results), 3)
    verified_true = sum(1 for item in results if item["verified"])

    errors = Counter()
    for item in results:
        if item["answer"].startswith("ERROR:"):
            errors[item["answer"]] += 1

    return {
        "collection_name": collection_name,
        "collection_id": collection_id,
        "question_count": question_count,
        "elapsed_seconds": elapsed,
        "summary": {
            "pass_count": passes,
            "pass_rate": round(passes / len(results), 4),
            "fallback_count": fallbacks,
            "fallback_rate": round(fallbacks / len(results), 4),
            "citation_count": citations,
            "citation_rate": round(citations / len(results), 4),
            "verified_true_count": verified_true,
            "verified_true_rate": round(verified_true / len(results), 4),
            "avg_overlap": avg_overlap,
            "avg_iterations": avg_iterations,
            "total_tokens": token_total,
            "avg_tokens_per_question": round(token_total / len(results), 2),
            "error_buckets": dict(errors),
        },
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run 100-question battery against CNIS RAG collection")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--collection-name", default="CNIS Battery v2")
    parser.add_argument("--question-count", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--progress-every", type=int, default=10)
    parser.add_argument("--live-preview", action="store_true")
    parser.add_argument(
        "--output",
        default="data/reports/cnis_battery_report.json",
        help="Path to output JSON report",
    )
    args = parser.parse_args()

    report = run_battery(
        base_url=args.base_url,
        collection_name=args.collection_name,
        question_count=args.question_count,
        seed=args.seed,
        progress_every=args.progress_every,
        live_preview=args.live_preview,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("summary", json.dumps(report["summary"], ensure_ascii=False))
    print("report_path", str(output_path))


if __name__ == "__main__":
    main()
