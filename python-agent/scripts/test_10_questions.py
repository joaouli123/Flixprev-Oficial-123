"""
10-question smoke test against the running RAG agent.
Usage: python scripts/test_10_questions.py
"""
import json
import time
import sys
import urllib.request
import urllib.parse

BASE_URL   = "http://127.0.0.1:8000"
COLLECTION = "9505b4fa-f0fd-4f75-a2eb-911e78496c4e"   # CNIS Battery v2

QUESTIONS = [
    "O que é o CNIS e para que ele serve?",
    "Como um trabalhador pode solicitar o extrato do CNIS?",
    "Quais tipos de vínculos empregatícios aparecem no CNIS?",
    "O CNIS é utilizado para cálculo de benefícios do INSS? Como?",
    "Quais informações de remuneração constam no CNIS?",
    "O que acontece quando há divergência de dados no CNIS?",
    "Como é feita a atualização dos dados no CNIS?",
    "O CNIS registra períodos de desemprego ou afastamento? Como?",
    "Qual é a diferença entre competência e data de pagamento no CNIS?",
    "Um trabalhador autônomo (contribuinte individual) aparece no CNIS?",
]

SEP = "─" * 72


def query(question: str) -> dict:
    payload = json.dumps({
        "collection_id": COLLECTION,
        "question": question,
        "fast_mode": True,
    }).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/query",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def run():
    print(f"\n{'='*72}")
    print(f"  RAG AGENT — 10-QUESTION TEST  |  Collection: CNIS Battery v2")
    print(f"{'='*72}\n")

    passed = 0
    for i, q in enumerate(QUESTIONS, 1):
        print(f"[Q{i:02d}] {q}")
        t0 = time.time()
        try:
            result = query(q)
            elapsed = time.time() - t0
            answer  = result.get("answer", "(sem resposta)")
            citations = result.get("citations", [])
            usage = result.get("token_usage", {})

            # Trim long answers for display
            display = answer if len(answer) <= 600 else answer[:600] + "…"
            print(f"[A{i:02d}] {display}")
            print(
                f"      ⏱ {elapsed:.1f}s  |  "
                f"🔖 {len(citations)} fontes  |  "
                f"🪙 {usage.get('input_tokens', '?')} in / {usage.get('output_tokens', '?')} out tokens"
            )
            if citations:
                first = citations[0]
                src = first.get("source_file") or first.get("source_uri") or "—"
                print(f"      📄 Fonte principal: {src[:60]}")
            passed += 1
        except Exception as exc:
            elapsed = time.time() - t0
            print(f"[ERRO] {exc}  ({elapsed:.1f}s)")
        print(SEP)

    print(f"\n✅ {passed}/{len(QUESTIONS)} perguntas respondidas com sucesso.\n")
    return 0 if passed == len(QUESTIONS) else 1


if __name__ == "__main__":
    sys.exit(run())
