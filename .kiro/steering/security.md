# Regras de Segurança

## Variáveis de Ambiente

- **NUNCA** exponha chaves API, tokens ou credenciais diretamente no código
- Sempre use variáveis de ambiente através de `import.meta.env.VITE_*` no frontend
- Para scripts Node.js, use `process.env.*` com dotenv
- O arquivo `.env` já está no `.gitignore` e não deve ser commitado

## Supabase

- Use `import.meta.env.VITE_SUPABASE_URL` para a URL do Supabase
- Use `import.meta.env.VITE_SUPABASE_ANON_KEY` para a chave anônima
- Nunca hardcode URLs ou IDs de projeto do Supabase no código
- A chave anônima (anon key) é segura para uso no frontend, mas deve estar em variável de ambiente
- Service role keys devem estar APENAS no backend/Edge Functions

## Validação de Input

- Sempre use schemas Zod para validar dados de formulários
- Schemas estão em `src/lib/validations.ts`
- Validar no frontend E no backend
- Nunca confie em dados do usuário

## Rate Limiting

- Use `checkRateLimit()` de `src/lib/rate-limit.ts` para operações sensíveis
- Limite tentativas de login (5 por minuto)
- Limite criação de recursos
- Para rate limiting real no servidor, considere Upstash Redis

## CORS

- Edge Functions devem usar CORS restrito
- Lista de origens permitidas em `supabase/functions/_shared/cors.ts`
- Adicionar domínios de produção antes do deploy
- Nunca usar `'Access-Control-Allow-Origin': '*'` em produção

## Content Security Policy

- CSP configurado no `index.html`
- Restringe fontes de scripts, estilos e conexões
- Atualizar CSP ao adicionar novos domínios externos

## Verificação

Antes de fazer commit, sempre verifique:
1. Nenhuma URL completa do Supabase está hardcoded
2. Nenhuma chave API está exposta
3. Todas as credenciais estão em variáveis de ambiente
4. O arquivo `.env` não está sendo commitado
5. Validação Zod implementada em novos formulários
6. CORS configurado corretamente nas Edge Functions
7. Rate limiting aplicado em operações sensíveis
