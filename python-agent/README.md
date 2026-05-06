# Python Agent Core

Este diretorio traz o backend Python do agente antigo para dentro deste repositorio. Ele roda como um servico FastAPI separado e pode assumir o nucleo RAG do chat atual por meio da ponte em `server.mjs`.

## Rodar localmente

1. Instale as dependencias:

```bash
npm run python-agent:install
```

2. Garanta que o `.env` da raiz tenha as variaveis do agente Python (`QDRANT_URL`, `QDRANT_API_KEY`, `VOYAGE_API_KEY`, `COHERE_API_KEY`, `ANTHROPIC_API_KEY`, etc.).

3. Suba o servico Python:

```bash
npm run python-agent:dev
```

4. Crie ou sincronize uma collection no servico Python e configure na raiz:

```bash
npm run python-agent:sync -- --agent-id <agent_uuid> --write-env --enable
```

Ou preencha manualmente:

```env
ENABLE_PYTHON_AGENT_CORE=true
PYTHON_AGENT_BASE_URL=http://localhost:8000
PYTHON_AGENT_DATABASE_URL=sqlite:///./agent.db
PYTHON_AGENT_COLLECTION_ID=<collection_id>
```

Tambem e possivel mapear agentes especificos:

```env
PYTHON_AGENT_COLLECTION_MAP={"agent_uuid":"collection_uuid"}
```

Quando a ponte estiver ligada e houver `collection_id`, o endpoint atual `/api/conversations/:id/messages` chama o core Python. Se o servico Python falhar ou nao houver collection mapeada, o RAG Node atual continua respondendo automaticamente.