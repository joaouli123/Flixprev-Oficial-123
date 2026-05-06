from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from core.ingestion.document_parser import ParsedSection


@dataclass(slots=True)
class IngestionChunk:
    point_id: str
    collection_id: str
    document_id: str
    text: str
    source_file: str | None
    source_uri: str | None
    page_number: int | None
    section_title: str | None
    position: int


class Chunker:
    """Token-length based chunking with overlap."""

    def __init__(self, chunk_size_tokens: int, chunk_overlap_tokens: int) -> None:
        self.chunk_size_tokens = chunk_size_tokens
        self.chunk_overlap_tokens = min(chunk_overlap_tokens, chunk_size_tokens // 2)

    def chunk_sections(
        self,
        sections: list[ParsedSection],
        *,
        collection_id: str,
        document_id: str,
    ) -> list[IngestionChunk]:
        chunks: list[IngestionChunk] = []
        position = 0

        for section in sections:
            for chunk_text in self._chunk_text(section.text):
                if not chunk_text.strip():
                    continue
                chunks.append(
                    IngestionChunk(
                        point_id=str(uuid4()),
                        collection_id=collection_id,
                        document_id=document_id,
                        text=chunk_text,
                        source_file=section.source_file,
                        source_uri=section.source_uri,
                        page_number=section.page_number,
                        section_title=section.section_title,
                        position=position,
                    )
                )
                position += 1
        return chunks

    @staticmethod
    def _line_token_count(line: str) -> int:
        return len(line.split())

    @staticmethod
    def _join_lines(lines: list[str]) -> str:
        cleaned: list[str] = []
        for line in lines:
            if line:
                cleaned.append(line)
            elif cleaned and cleaned[-1] != "":
                cleaned.append("")
        return "\n".join(cleaned).strip()

    def _chunk_long_line(self, line: str) -> list[str]:
        words = line.split()
        if not words:
            return []

        if len(words) <= self.chunk_size_tokens:
            return [" ".join(words)]

        chunks: list[str] = []
        start = 0
        while start < len(words):
            end = min(start + self.chunk_size_tokens, len(words))
            chunks.append(" ".join(words[start:end]))
            if end >= len(words):
                break
            start = max(end - self.chunk_overlap_tokens, start + 1)
        return chunks

    def _overlap_lines(self, lines: list[str]) -> list[str]:
        if self.chunk_overlap_tokens <= 0:
            return []

        overlap: list[str] = []
        token_total = 0
        for line in reversed(lines):
            overlap.insert(0, line)
            token_total += self._line_token_count(line)
            if token_total >= self.chunk_overlap_tokens:
                break

        while overlap and overlap[0] == "":
            overlap.pop(0)
        return overlap

    def _chunk_text(self, text: str) -> list[str]:
        normalized = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
        if not normalized:
            return []

        lines = normalized.split("\n")
        if len(lines) == 1:
            return self._chunk_long_line(lines[0])

        chunks: list[str] = []
        current_lines: list[str] = []
        current_tokens = 0

        def flush() -> None:
            nonlocal current_lines, current_tokens
            chunk_text = self._join_lines(current_lines)
            if chunk_text:
                chunks.append(chunk_text)
            current_lines = self._overlap_lines(current_lines)
            current_tokens = sum(self._line_token_count(line) for line in current_lines)

        for raw_line in lines:
            line = raw_line.rstrip()
            line_tokens = self._line_token_count(line)

            if not line.strip():
                if current_lines and current_lines[-1] != "":
                    current_lines.append("")
                continue

            if line_tokens > self.chunk_size_tokens:
                if current_lines:
                    flush()
                for piece in self._chunk_long_line(line):
                    piece_tokens = self._line_token_count(piece)
                    if current_lines and current_tokens + piece_tokens > self.chunk_size_tokens:
                        flush()
                    current_lines.append(piece)
                    current_tokens += piece_tokens
                continue

            if current_lines and current_tokens + line_tokens > self.chunk_size_tokens:
                flush()

            current_lines.append(line)
            current_tokens += line_tokens

        if current_lines:
            chunk_text = self._join_lines(current_lines)
            if chunk_text:
                chunks.append(chunk_text)

        return chunks
