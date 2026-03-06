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
