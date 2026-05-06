from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Generator

from config import Settings
from core.agent.claude import ClaudeClient, TokenUsage, VerificationResult
from core.database.metadata import CollectionRecord
from core.retrieval.hybrid_search import HybridRetriever, RetrievedChunk
from core.retrieval.reranker import CohereReranker


@dataclass(slots=True)
class Citation:
    source_file: str | None
    source_uri: str | None
    page_number: int | None
    section_title: str | None
    point_id: str
    score: float


@dataclass(slots=True)
class QueryResult:
    answer: str
    citations: list[Citation]
    verified: bool
    iterations: int
    unsupported_claims: list[str]
    token_usage: TokenUsage


class RAGPipeline:
    """Retrieval + rerank + answer + verify loop."""

    FALLBACK_NOT_FOUND = "Nao encontrei essa informacao nos anexos processados."
    EXHAUSTIVE_PATTERN = re.compile(
        r"\b(todas?|todos?|quais|poss[ií]ve(?:is|l)|complet[ao]s?|cat[aá]logo|rela[cç][aã]o|lista|liste|enumere)\b",
        re.IGNORECASE,
    )
    EXTRATO_SCOPE_PATTERN = re.compile(r"\b(meu|minha|neste|nesse|no\s+extrato|do\s+extrato|extrato)\b", re.IGNORECASE)
    INLINE_SOURCE_PATTERN = re.compile(r"\s*\[(?:Fonte:[^\]]+|Fonte\s+\d+)\]", re.IGNORECASE)
    MULTI_SOURCE_HINTS = (
        "separadamente",
        "compare",
        "comparar",
        "comparacao",
        "complementar",
        "fundamento",
        "base legal",
        "bases legais",
        "todos os anexos",
        "anexos processados",
        "arquivos anexados",
        "em conjunto",
        "alem de",
        "tambem",
        "cada arquivo",
        "cada anexo",
    )

    def __init__(
        self,
        *,
        settings: Settings,
        retriever: HybridRetriever,
        reranker: CohereReranker,
        claude: ClaudeClient,
    ) -> None:
        self.settings = settings
        self.retriever = retriever
        self.reranker = reranker
        self.claude = claude

    def ask(
        self,
        *,
        collection: CollectionRecord,
        question: str,
        agent_instructions: str | None = None,
        top_k: int | None = None,
        fast_mode: bool = True,
    ) -> QueryResult:
        if not self.claude.is_configured:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

        exhaustive = self._is_exhaustive_query(question)
        answer_limit = self._answer_limit(question, top_k, exhaustive=exhaustive)
        current_query = question.strip()

        if not current_query:
            return QueryResult(
                answer=self.FALLBACK_NOT_FOUND,
                citations=[],
                verified=True,
                iterations=1,
                unsupported_claims=[],
                token_usage=TokenUsage(),
            )

        last_chunks: list[RetrievedChunk] = []
        last_answer = self.FALLBACK_NOT_FOUND
        last_verification = VerificationResult(supported=False, unsupported_claims=[], suggested_query=None)
        total_usage = TokenUsage()
        iteration = 0

        max_iters = 1 if fast_mode else self.settings.max_verify_iterations

        for iteration in range(1, max_iters + 1):
            variants = [current_query]
            if not fast_mode and not exhaustive and self.claude.is_configured:
                expanded_queries, usage = self.claude.expand_query(current_query)
                total_usage.accumulate(usage)
                variants.extend(expanded_queries[:3])
            variants.extend(self._deterministic_query_variants(current_query))

            reranked = self._retrieve_and_rerank(
                collection=collection,
                query=current_query,
                query_variants=variants,
                answer_limit=answer_limit,
                exhaustive=exhaustive,
            )

            if not reranked:
                return QueryResult(
                    answer=self.FALLBACK_NOT_FOUND,
                    citations=[],
                    verified=True,
                    iterations=iteration,
                    unsupported_claims=[],
                    token_usage=total_usage,
                )

            last_chunks = reranked

            answer, answer_usage = self.claude.generate_answer(
                current_query,
                reranked,
                agent_instructions=agent_instructions,
            )
            answer = self._finalize_answer_style(answer)
            total_usage.accumulate(answer_usage)

            if fast_mode:
                last_answer = answer
                last_verification = VerificationResult(supported=True, unsupported_claims=[], suggested_query=None)
                break

            verification, verification_usage = self.claude.verify_answer(current_query, answer, reranked)
            total_usage.accumulate(verification_usage)

            last_answer = answer
            last_verification = verification

            if verification.supported:
                break

            repaired_answer, repaired_usage = self.claude.repair_answer(
                current_query,
                answer,
                reranked,
                verification.unsupported_claims,
                agent_instructions=agent_instructions,
            )
            repaired_answer = self._finalize_answer_style(repaired_answer)
            total_usage.accumulate(repaired_usage)

            repaired_verification, repaired_verification_usage = self.claude.verify_answer(
                current_query,
                repaired_answer,
                reranked,
            )
            total_usage.accumulate(repaired_verification_usage)

            last_answer = repaired_answer
            last_verification = repaired_verification

            if repaired_verification.supported:
                break

            next_query = repaired_verification.suggested_query or verification.suggested_query
            if not next_query:
                break
            current_query = next_query

        return QueryResult(
            answer=self._finalize_answer_style(last_answer),
            citations=self._build_citations(last_chunks),
            verified=last_verification.supported,
            iterations=iteration,
            unsupported_claims=last_verification.unsupported_claims,
            token_usage=total_usage,
        )

    @staticmethod
    def _build_citations(chunks: list[RetrievedChunk]) -> list[Citation]:
        citations: list[Citation] = []
        for chunk in chunks:
            citations.append(
                Citation(
                    source_file=chunk.source_file,
                    source_uri=chunk.source_uri,
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                    point_id=chunk.point_id,
                    score=chunk.score,
                )
            )
        return citations

    def ask_stream(
        self,
        *,
        collection: CollectionRecord,
        question: str,
        agent_instructions: str | None = None,
        top_k: int | None = None,
        fast_mode: bool = False,
    ) -> Generator[dict, None, None]:
        """Streaming path. In precision mode, stream the first draft early, then verify/repair before done."""
        if not self.claude.is_configured:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

        if not fast_mode:
            exhaustive = self._is_exhaustive_query(question)
            answer_limit = self._answer_limit(question, top_k, exhaustive=exhaustive)
            current_query = question.strip()

            if not current_query:
                yield {
                    "type": "done",
                    "answer": self.FALLBACK_NOT_FOUND,
                    "citations": [],
                    "verified": True,
                    "iterations": 0,
                    "unsupported_claims": [],
                    "token_usage": {},
                }
                return

            last_chunks: list[RetrievedChunk] = []
            last_answer = self.FALLBACK_NOT_FOUND
            last_verification = VerificationResult(supported=False, unsupported_claims=[], suggested_query=None)
            total_usage = TokenUsage()
            iteration = 0

            max_iters = max(self.settings.max_verify_iterations, 1)

            for iteration in range(1, max_iters + 1):
                variants = [current_query]
                yield {"type": "status", "message": "Buscando evidencias na base..."}
                if not exhaustive:
                    expanded_queries, usage = self.claude.expand_query(current_query)
                    total_usage.accumulate(usage)
                    variants.extend(expanded_queries[:3])
                variants.extend(self._deterministic_query_variants(current_query))

                reranked = self._retrieve_and_rerank(
                    collection=collection,
                    query=current_query,
                    query_variants=variants,
                    answer_limit=answer_limit,
                    exhaustive=exhaustive,
                )

                if not reranked:
                    if iteration == 1:
                        yield {
                            "type": "done",
                            "answer": self.FALLBACK_NOT_FOUND,
                            "citations": [],
                            "verified": True,
                            "iterations": iteration,
                            "unsupported_claims": [],
                            "token_usage": {
                                "input_tokens": total_usage.input_tokens,
                                "output_tokens": total_usage.output_tokens,
                                "cache_creation_input_tokens": total_usage.cache_creation_input_tokens,
                                "cache_read_input_tokens": total_usage.cache_read_input_tokens,
                                "total_input_tokens": total_usage.total_input_tokens,
                                "total_tokens": total_usage.total_tokens,
                            },
                        }
                        return
                    break

                last_chunks = reranked

                if iteration == 1:
                    yield {"type": "status", "message": "Gerando resposta inicial..."}
                    answer = ""
                    answer_usage: TokenUsage | None = None

                    for text_chunk, usage in self.claude.generate_answer_stream(
                        current_query,
                        reranked,
                        agent_instructions=agent_instructions,
                    ):
                        if usage is not None:
                            answer_usage = usage
                        if text_chunk:
                            answer += text_chunk
                            yield {"type": "token", "text": text_chunk}

                    if answer_usage is not None:
                        total_usage.accumulate(answer_usage)
                    answer = self._finalize_answer_style(answer)
                else:
                    yield {"type": "status", "message": "Refinando a resposta com nova busca..."}
                    answer, answer_usage = self.claude.generate_answer(current_query, reranked)
                    answer = self._finalize_answer_style(answer)
                    total_usage.accumulate(answer_usage)

                yield {"type": "status", "message": "Verificando completude e consistencia..."}
                verification, verification_usage = self.claude.verify_answer(current_query, answer, reranked)
                total_usage.accumulate(verification_usage)

                last_answer = answer
                last_verification = verification

                if verification.supported:
                    break

                yield {"type": "status", "message": "Corrigindo resposta com base nas fontes..."}
                repaired_answer, repaired_usage = self.claude.repair_answer(
                    current_query,
                    answer,
                    reranked,
                    verification.unsupported_claims,
                    agent_instructions=agent_instructions,
                )
                repaired_answer = self._finalize_answer_style(repaired_answer)
                total_usage.accumulate(repaired_usage)

                repaired_verification, repaired_verification_usage = self.claude.verify_answer(
                    current_query,
                    repaired_answer,
                    reranked,
                )
                total_usage.accumulate(repaired_verification_usage)

                last_answer = repaired_answer
                last_verification = repaired_verification

                if repaired_verification.supported:
                    break

                next_query = repaired_verification.suggested_query or verification.suggested_query
                if not next_query:
                    break
                yield {"type": "status", "message": "Buscando evidencias adicionais para fechar a resposta..."}
                current_query = next_query

            yield {
                "type": "done",
                "answer": last_answer,
                "citations": [
                    {
                        "source_file": c.source_file,
                        "source_uri": c.source_uri,
                        "page_number": c.page_number,
                        "section_title": c.section_title,
                        "point_id": c.point_id,
                        "score": c.score,
                    }
                    for c in self._build_citations(last_chunks)
                ],
                "verified": last_verification.supported,
                "iterations": iteration,
                "unsupported_claims": last_verification.unsupported_claims,
                "token_usage": {
                    "input_tokens": total_usage.input_tokens,
                    "output_tokens": total_usage.output_tokens,
                    "cache_creation_input_tokens": total_usage.cache_creation_input_tokens,
                    "cache_read_input_tokens": total_usage.cache_read_input_tokens,
                    "total_input_tokens": total_usage.total_input_tokens,
                    "total_tokens": total_usage.total_tokens,
                },
            }
            return

        exhaustive = self._is_exhaustive_query(question)
        answer_limit = self._answer_limit(question, top_k, exhaustive=exhaustive)
        question = question.strip()

        if not question:
            yield {
                "type": "done",
                "answer": self.FALLBACK_NOT_FOUND,
                "citations": [],
                "verified": True,
                "iterations": 0,
                "unsupported_claims": [],
                "token_usage": {},
            }
            return

        reranked = self._retrieve_and_rerank(
            collection=collection,
            query=question,
            query_variants=self._deterministic_query_variants(question),
            answer_limit=answer_limit,
            exhaustive=exhaustive,
        )

        if not reranked:
            yield {
                "type": "done",
                "answer": self.FALLBACK_NOT_FOUND,
                "citations": [],
                "verified": True,
                "iterations": 1,
                "unsupported_claims": [],
                "token_usage": {},
            }
            return

        full_text = ""
        final_usage: TokenUsage | None = None

        for text_chunk, usage in self.claude.generate_answer_stream(question, reranked):
            if usage is not None:
                final_usage = usage
            if text_chunk:
                full_text += text_chunk
                yield {"type": "token", "text": text_chunk}

        token_usage_dict: dict = {}
        if final_usage is not None:
            token_usage_dict = {
                "input_tokens": final_usage.input_tokens,
                "output_tokens": final_usage.output_tokens,
                "cache_creation_input_tokens": final_usage.cache_creation_input_tokens,
                "cache_read_input_tokens": final_usage.cache_read_input_tokens,
                "total_input_tokens": final_usage.total_input_tokens,
                "total_tokens": final_usage.total_tokens,
            }

        citations = [
            {
                "source_file": c.source_file,
                "source_uri": c.source_uri,
                "page_number": c.page_number,
                "section_title": c.section_title,
                "point_id": c.point_id,
                "score": c.score,
            }
            for c in self._build_citations(reranked)
        ]

        yield {
            "type": "done",
            "answer": full_text,
            "citations": citations,
            "verified": True,
            "iterations": 1,
            "unsupported_claims": [],
            "token_usage": token_usage_dict,
        }

    @staticmethod
    def _chunk_text_for_stream(text: str, chunk_size: int = 80) -> Generator[str, None, None]:
        if not text:
            return

        for offset in range(0, len(text), chunk_size):
            yield text[offset : offset + chunk_size]

    def _retrieve_and_rerank(
        self,
        *,
        collection: CollectionRecord,
        query: str,
        query_variants: list[str],
        answer_limit: int,
        exhaustive: bool,
    ) -> list[RetrievedChunk]:
        document_count = self._collection_document_count(collection)
        multi_document_collection = document_count > 1
        diverse_context = self._needs_diverse_context(query)
        final_limit = max(answer_limit, 12) if exhaustive else answer_limit
        if multi_document_collection:
            final_limit = max(final_limit, 8)
        candidate_limit = max(
            self.settings.retrieval_candidates,
            50 if exhaustive else 32 if (diverse_context or multi_document_collection) else self.settings.retrieval_candidates,
            final_limit * (4 if diverse_context else 3 if multi_document_collection else 2),
        )
        variants = self._dedupe_strings([query, *query_variants])

        retrieved = self.retriever.search(
            collection=collection,
            query=query,
            query_variants=variants,
            limit=candidate_limit,
            dense_query_limit=2 if exhaustive else 3 if diverse_context else None,
        )
        forced = self.retriever.search_exact_terms(
            collection_id=collection.id,
            terms=self._forced_exact_terms(query),
            limit_per_term=8 if exhaustive else 3,
        )

        combined = self._dedupe_chunks([*forced, *retrieved])
        combined = self._filter_chunks_for_scope(query, combined)
        if not combined:
            return []

        rerank_limit = min(
            max(
                final_limit * (3 if diverse_context else 2 if multi_document_collection else 1),
                12 if (exhaustive or diverse_context or multi_document_collection) else final_limit,
            ),
            len(combined),
        )
        reranked = self.reranker.rerank(query, combined, top_n=rerank_limit)
        forced = self._filter_chunks_for_scope(query, forced)
        prioritized = self._merge_priority_chunks(forced, reranked)
        if diverse_context:
            return self._select_diverse_chunks(
                prioritized,
                limit=final_limit,
                max_docs_to_cover=min(final_limit, 8 if exhaustive else 4),
            )
        if multi_document_collection:
            return self._select_diverse_chunks(
                prioritized,
                limit=final_limit,
                max_docs_to_cover=min(final_limit, 4),
                min_score_ratio=0.45,
            )
        return prioritized[:final_limit]

    @staticmethod
    def _collection_document_count(collection: CollectionRecord) -> int:
        try:
            return len([document for document in collection.documents if document.status == "completed"])
        except Exception:
            return 0

    def _answer_limit(self, question: str, top_k: int | None, *, exhaustive: bool) -> int:
        requested = top_k or self.settings.retrieval_top_k
        if exhaustive:
            return max(requested, 12)
        if self._needs_diverse_context(question):
            return max(requested, 8)
        return requested

    def _is_exhaustive_query(self, question: str) -> bool:
        return bool(self.EXHAUSTIVE_PATTERN.search(question or ""))

    def _is_general_catalog_query(self, question: str) -> bool:
        text = question or ""
        return self._is_exhaustive_query(text) and not self.EXTRATO_SCOPE_PATTERN.search(text)

    def _needs_diverse_context(self, question: str) -> bool:
        if self._is_exhaustive_query(question):
            return True

        normalized = self._normalize_text(question)
        if "(1)" in normalized and "(2)" in normalized:
            return True

        return any(hint in normalized for hint in self.MULTI_SOURCE_HINTS)

    def _deterministic_query_variants(self, question: str) -> list[str]:
        normalized = self._normalize_text(question)
        variants: list[str] = []

        if "cspendencia" in normalized or "pendencia" in normalized or "pendencias" in normalized:
            variants.extend(
                [
                    "CsPendencia Indicador de Pendencia CNIS",
                    "Indicador de Pendencia Portal CNIS",
                    "tipo Pendencia grupo indicador CNIS",
                    "Anexo V relacao indicadores CNIS tipo Pendencia grupo sigla descricao esclarecimentos",
                ]
            )

        if self._is_exhaustive_query(question):
            variants.extend(
                [
                    "relacao completa indicadores CNIS",
                    "catalogo indicadores CNIS sigla descricao grupo tipo",
                    "Anexo V indicadores atualmente disponibilizados no CNIS",
                ]
            )

        return variants

    def _forced_exact_terms(self, question: str) -> list[str]:
        normalized = self._normalize_text(question)
        terms: list[str] = []
        has_cspendencia = "cspendencia" in normalized

        if has_cspendencia:
            terms.append("CsPendencia")
        if not has_cspendencia and ("pendencia" in normalized or "pendencias" in normalized):
            terms.extend(["pendência", "pendencia", "indicadores de pendências", "indicadores de pendencias"])
        if self._is_exhaustive_query(question):
            terms.extend(["Anexo V apresenta", "indicadores atualmente disponibilizados"])

        return self._dedupe_strings(terms)

    def _filter_chunks_for_scope(self, question: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        if not self._is_general_catalog_query(question):
            return chunks

        return [chunk for chunk in chunks if not self._looks_like_individual_extract(chunk)]

    @staticmethod
    def _looks_like_individual_extract(chunk: RetrievedChunk) -> bool:
        source = (chunk.source_file or chunk.source_uri or "").lower()
        text = chunk.text.lower()
        return "extrato.pdf" in source or (
            "relações previdenciárias" in text and "nit:" in text and "cpf:" in text
        )

    @staticmethod
    def _dedupe_chunks(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        by_id: dict[str, RetrievedChunk] = {}
        for chunk in chunks:
            existing = by_id.get(chunk.point_id)
            if existing is None or chunk.score > existing.score:
                by_id[chunk.point_id] = chunk
        return list(by_id.values())

    @staticmethod
    def _merge_priority_chunks(forced: list[RetrievedChunk], reranked: list[RetrievedChunk]) -> list[RetrievedChunk]:
        result: list[RetrievedChunk] = []
        seen: set[str] = set()
        for chunk in [*forced, *reranked]:
            if chunk.point_id in seen:
                continue
            result.append(chunk)
            seen.add(chunk.point_id)
        return result

    def _select_diverse_chunks(
        self,
        chunks: list[RetrievedChunk],
        *,
        limit: int,
        max_docs_to_cover: int,
        min_score_ratio: float = 0.0,
    ) -> list[RetrievedChunk]:
        if len(chunks) <= 1:
            return chunks[:limit]

        best_score = max((chunk.score for chunk in chunks), default=0.0)
        min_score = best_score * min_score_ratio if best_score > 0 else 0.0

        doc_order: list[str] = []
        best_by_doc: dict[str, RetrievedChunk] = {}
        for chunk in chunks:
            doc_key = self._chunk_doc_key(chunk)
            if doc_key not in best_by_doc:
                best_by_doc[doc_key] = chunk
                doc_order.append(doc_key)

        if len(doc_order) <= 1:
            return chunks[:limit]

        selected: list[RetrievedChunk] = []
        seen: set[str] = set()
        for doc_key in doc_order[:max_docs_to_cover]:
            chunk = best_by_doc[doc_key]
            if chunk.score < min_score:
                continue
            selected.append(chunk)
            seen.add(chunk.point_id)
            if len(selected) >= limit:
                return selected[:limit]

        for chunk in chunks:
            if chunk.point_id in seen:
                continue
            selected.append(chunk)
            seen.add(chunk.point_id)
            if len(selected) >= limit:
                break

        return selected[:limit]

    @staticmethod
    def _chunk_doc_key(chunk: RetrievedChunk) -> str:
        return (
            chunk.document_id
            or chunk.source_file
            or chunk.source_uri
            or chunk.section_title
            or chunk.point_id
        )

    @staticmethod
    def _dedupe_strings(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            normalized = value.strip()
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(normalized)
        return result

    @staticmethod
    def _normalize_text(text: str) -> str:
        replacements = str.maketrans("áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ", "aaaaeeioooucAAAAEEIOOOUC")
        return (text or "").translate(replacements).lower()

    def _finalize_answer_style(self, answer: str) -> str:
        text = str(answer or "").replace("\r\n", "\n").strip()
        if not text:
            return text

        text = self.INLINE_SOURCE_PATTERN.sub("", text)

        cleaned_lines: list[str] = []
        skip_question_quote = False
        for raw_line in text.split("\n"):
            line = raw_line.strip()
            normalized = self._normalize_text(line)

            if not line:
                if skip_question_quote:
                    skip_question_quote = False
                if cleaned_lines and cleaned_lines[-1] != "":
                    cleaned_lines.append("")
                continue

            if normalized in {"resposta final", "informacao ausente no contexto documental"}:
                continue

            if normalized.startswith("pergunta identificada"):
                skip_question_quote = True
                continue

            if skip_question_quote and (line.startswith(">") or line.startswith('"') or line.startswith("'")):
                continue

            skip_question_quote = False
            cleaned_lines.append(raw_line)

        text = "\n".join(cleaned_lines)
        text = re.sub(r"(?i)\bapos analise(?: integral)? de todos os trechos recuperados,?\s*", "", text)
        text = re.sub(r"(?i)\bcom base(?: apenas)? nos anexos processados,?\s*", "", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if text:
            text = text[0].upper() + text[1:]
        return text or self.FALLBACK_NOT_FOUND
