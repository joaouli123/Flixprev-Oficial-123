from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Generator

from anthropic import Anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from config import Settings
from core.agent.prompts import (
    ANSWER_SYSTEM_PROMPT,
    ANSWER_USER_TEMPLATE,
    QUERY_EXPANSION_PROMPT,
    REPAIR_ANSWER_SYSTEM_PROMPT,
    REPAIR_ANSWER_USER_TEMPLATE,
    VERIFICATION_PROMPT,
)
from core.retrieval.hybrid_search import RetrievedChunk


@dataclass(slots=True)
class VerificationResult:
    supported: bool
    unsupported_claims: list[str]
    suggested_query: str | None


@dataclass(slots=True)
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0

    @property
    def total_input_tokens(self) -> int:
        return self.input_tokens + self.cache_creation_input_tokens + self.cache_read_input_tokens

    @property
    def total_tokens(self) -> int:
        return self.total_input_tokens + self.output_tokens

    def accumulate(self, other: "TokenUsage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_creation_input_tokens += other.cache_creation_input_tokens
        self.cache_read_input_tokens += other.cache_read_input_tokens


class ClaudeClient:
    """Claude wrapper for answering, query expansion, and answer verification."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = Anthropic(api_key=settings.anthropic_api_key) if settings.anthropic_api_key else None

    @property
    def is_configured(self) -> bool:
        return self._client is not None

    def generate_answer(
        self,
        question: str,
        chunks: list[RetrievedChunk],
        agent_instructions: str | None = None,
    ) -> tuple[str, TokenUsage]:
        user_prompt = self._prepend_agent_instructions(
            ANSWER_USER_TEMPLATE.format(
                question=question,
                evidence=self._format_evidence(chunks),
            ),
            agent_instructions,
        )
        return self._call_model(system_prompt=ANSWER_SYSTEM_PROMPT, user_prompt=user_prompt, max_tokens=3000)

    def generate_answer_stream(
        self,
        question: str,
        chunks: list[RetrievedChunk],
        agent_instructions: str | None = None,
    ) -> Generator[tuple[str, TokenUsage | None], None, None]:
        """Stream answer tokens. Yields (text_chunk, None) per token then ('', TokenUsage) at end."""
        user_prompt = self._prepend_agent_instructions(
            ANSWER_USER_TEMPLATE.format(
                question=question,
                evidence=self._format_evidence(chunks),
            ),
            agent_instructions,
        )
        client = self._require_client()
        with client.messages.stream(
            model=self.settings.claude_model,
            max_tokens=3000,
            temperature=0.0,
            system=ANSWER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            for text in stream.text_stream:
                yield text, None
            final_message = stream.get_final_message()
            usage = self._extract_usage(final_message)
            yield "", usage

    def expand_query(self, question: str) -> tuple[list[str], TokenUsage]:
        if not question.strip():
            return [], TokenUsage()
        text, usage = self._call_model(
            system_prompt="You are a search query rewriter.",
            user_prompt=f"{QUERY_EXPANSION_PROMPT}\n\nQuestion: {question}",
            max_tokens=400,
        )
        payload = self._parse_json_payload(text)
        if payload is None:
            return [], usage

        queries = payload.get("queries", [])
        if not isinstance(queries, list):
            return [], usage
        return [str(item).strip() for item in queries if str(item).strip()], usage

    def verify_answer(
        self,
        question: str,
        answer: str,
        chunks: list[RetrievedChunk],
    ) -> tuple[VerificationResult, TokenUsage]:
        prompt = VERIFICATION_PROMPT.format(
            question=question,
            answer=answer,
            evidence=self._format_evidence(chunks),
        )
        text, usage = self._call_model(
            system_prompt="You are a strict factual verifier.",
            user_prompt=prompt,
            max_tokens=900,
        )
        payload = self._parse_json_payload(text)
        if payload is None:
            return (
                VerificationResult(
                    supported=False,
                    unsupported_claims=["Could not parse verifier output"],
                    suggested_query=None,
                ),
                usage,
            )

        supported = bool(payload.get("supported", False))
        unsupported = payload.get("unsupported_claims", [])
        if not isinstance(unsupported, list):
            unsupported = []
        suggested = str(payload.get("suggested_query", "")).strip()
        return (
            VerificationResult(
                supported=supported,
                unsupported_claims=[str(item) for item in unsupported],
                suggested_query=suggested or None,
            ),
            usage,
        )

    def repair_answer(
        self,
        question: str,
        answer: str,
        chunks: list[RetrievedChunk],
        issues: list[str],
        agent_instructions: str | None = None,
    ) -> tuple[str, TokenUsage]:
        issue_lines = "\n".join(f"- {item}" for item in issues) if issues else "- Answer needs factual repair or completion."
        prompt = self._prepend_agent_instructions(
            REPAIR_ANSWER_USER_TEMPLATE.format(
                question=question,
                answer=answer,
                issues=issue_lines,
                evidence=self._format_evidence(chunks),
            ),
            agent_instructions,
        )
        return self._call_model(
            system_prompt=REPAIR_ANSWER_SYSTEM_PROMPT,
            user_prompt=prompt,
            max_tokens=3000,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def _call_model(self, *, system_prompt: str, user_prompt: str, max_tokens: int) -> tuple[str, TokenUsage]:
        client = self._require_client()
        response = client.messages.create(
            model=self.settings.claude_model,
            max_tokens=max_tokens,
            temperature=0.0,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        texts: list[str] = []
        for block in response.content:
            content = getattr(block, "text", None)
            if content:
                texts.append(content)
        usage = self._extract_usage(response)
        return "\n".join(texts).strip(), usage

    def _require_client(self) -> Anthropic:
        if self._client is None:
            raise RuntimeError("ANTHROPIC_API_KEY is missing. Configure it before querying.")
        return self._client

    @staticmethod
    def _prepend_agent_instructions(prompt: str, agent_instructions: str | None = None) -> str:
        instructions = str(agent_instructions or "").strip()
        if not instructions:
            return prompt

        return (
            "Additional agent instructions (they define the agent's scope/domain boundary and must be followed unless they conflict with the evidence-only rules or the required natural, direct, non-robotic answer style. If the evidence contains unrelated material, do not broaden the answer beyond this scope. Source names, legal act numbers, and dates in these instructions are scope hints, not evidence; state them only when they also appear in the evidence):\n"
            f"{instructions}\n\n"
            f"{prompt}"
        )

    @staticmethod
    def _extract_usage(response) -> TokenUsage:
        usage = getattr(response, "usage", None)
        if usage is None:
            return TokenUsage()
        return TokenUsage(
            input_tokens=ClaudeClient._safe_int(getattr(usage, "input_tokens", 0)),
            output_tokens=ClaudeClient._safe_int(getattr(usage, "output_tokens", 0)),
            cache_creation_input_tokens=ClaudeClient._safe_int(
                getattr(usage, "cache_creation_input_tokens", 0)
            ),
            cache_read_input_tokens=ClaudeClient._safe_int(getattr(usage, "cache_read_input_tokens", 0)),
        )

    @staticmethod
    def _safe_int(value: object) -> int:
        try:
            return int(value) if value is not None else 0
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _parse_json_payload(text: str) -> dict | None:
        raw = (text or "").strip()
        if not raw:
            return None

        if raw.startswith("```"):
            lines = raw.splitlines()
            if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
                raw = "\n".join(lines[1:-1]).strip()

        for candidate in (raw, ClaudeClient._extract_json_object(raw)):
            if not candidate:
                continue
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue

        return None

    @staticmethod
    def _extract_json_object(text: str) -> str | None:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        return text[start : end + 1]

    @staticmethod
    def _format_evidence(chunks: list[RetrievedChunk]) -> str:
        blocks: list[str] = []
        for index, chunk in enumerate(chunks, start=1):
            source = chunk.source_file or chunk.source_uri or "unknown"
            page = chunk.page_number if chunk.page_number is not None else "n/a"
            section = chunk.section_title or "n/a"
            snippet = chunk.text.strip()
            blocks.append(
                "\n".join(
                    [
                        f"[Chunk {index}]",
                        f"Source: {source}",
                        f"Page: {page}",
                        f"Section: {section}",
                        "Text:",
                        snippet,
                    ]
                )
            )
        return "\n\n".join(blocks)
