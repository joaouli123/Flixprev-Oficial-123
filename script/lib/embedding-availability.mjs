// Decide por onde gerar embeddings (busca semantica).
//
// Historico: em 22/09/2026 a GEMINI_API_KEY antiga parou de responder (400/402)
// e a busca semantica morreu. Em 15/10 o chat foi para o Gemini Agent Platform
// (Express) e a busca semantica foi desligada de vez, achando que a chave
// Express nao gerava embeddings. Ela gera: o endpoint
// aiplatform.googleapis.com/v1/publishers/google/models/gemini-embedding-001:predict
// devolve os mesmos vetores de 3072 dimensoes ja salvos no banco.
//
// Ordem: chave dedicada de embeddings (EMBEDDING_API_KEY, AI_EMBEDDING_API_KEY,
// OPENAI_API_KEY) > chave Express do chat (modelo gemini-*) > padrao antigo.
function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

export function resolveEmbeddingRoute({ chatProvider = '', chatApiKey = '', embeddingModel = '', env = process.env } = {}) {
  if (firstNonEmpty(env.EMBEDDING_API_KEY, env.AI_EMBEDDING_API_KEY, env.OPENAI_API_KEY)) return 'dedicated';
  if (chatProvider === 'gemini-express') {
    return String(chatApiKey || '').trim() && String(embeddingModel || '').startsWith('gemini-') ? 'express' : 'none';
  }
  return 'default';
}
