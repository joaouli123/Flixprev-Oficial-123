# Como Rodar em Desenvolvimento

Para rodar o servidor de desenvolvimento com API integrada, use:

```bash
npx tsx start.ts
```

Isso vai iniciar:
- ✅ API em http://localhost:5000/api
- ✅ Frontend em http://localhost:5000

## Credenciais de teste
- Email: `admin@admin.com`
- Senha: `admin`

## Configuracao recomendada de IA

Para priorizar respostas fieis ao conteudo salvo no RAG:

```bash
ANTHROPIC_API_KEY=...
CHAT_MODEL=claude-sonnet-4-6
FAST_CHAT_MODEL=claude-sonnet-4-6

OPENAI_API_KEY=...
EMBEDDING_MODEL=text-embedding-3-large

ENABLE_DIRECT_PDF_ANALYSIS=false
RAG_VECTOR_LIMIT=64
RAG_RETURN_LIMIT=24
RAG_MIN_SIMILARITY=0.12
RAG_KEYWORD_LIMIT=12
CHAT_MAX_TOKENS=3200
FAST_CHAT_MAX_TOKENS=2200
```

Notas:
- Chat e embeddings agora devem ficar separados. Nao aponte embeddings para a API da Anthropic.
- Se trocar chunking, embeddings ou provedor de embeddings, reprocese os anexos para reconstruir o indice vetorial.
- `claude-sonnet-4-6` e o melhor ponto de equilibrio para esse projeto. So vale subir para `opus-4-7` se ainda houver erro em perguntas realmente dificeis apos o reindex.

## Importação automática de Normas Interativas (INSS)

O projeto possui um importador em lote que:
- coleta links de normas a partir da página de Normas Interativas,
- extrai conteúdo (HTML/PDF),
- gera arquivos em `public/agent-attachments/inss-normas`,
- usa Gemini 2.5 Flash para organizar metadados dos agentes,
- cria os agentes no Supabase (opcional),
- aciona reprocessamento RAG (opcional).

### Variáveis necessárias

```bash
GEMINI_API_KEY=...
IMPORT_USER_EMAIL=...
IMPORT_USER_PASSWORD=...
```

### Coletar e gerar base (sem criar agentes)

```bash
npm run import:inss-normas -- --max-links 50 --no-gemini
```

### Coletar e criar agentes automaticamente

```bash
npm run import:inss-normas:create -- --max-links 50 --reprocess-url http://localhost:5000
```

> Remova `--max-links` para tentar processar toda a lista encontrada.
