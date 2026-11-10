// Os modelos Gemini 3.x (exceto os "-lite") "pensam" por padrao, e os tokens de
// raciocinio contam dentro de maxOutputTokens. Com o default, o gemini-3.8-flash
// gastou 381 de 400 tokens pensando e cortou a resposta (finishReason MAX_TOKENS),
// alem de ficar lento e estourar o timeout de 15s do chat. Por isso o chat foi
// rebaixado para o flash-lite. Aqui definimos o nivel de raciocinio e damos folga
// ao limite de saida, proporcional ao nivel, para a resposta nunca ser cortada.
//
// GEMINI_THINKING_LEVEL: nivel dos modelos flash. low (padrao) | medium | high | off.
// GEMINI_PRO_THINKING_LEVEL: nivel dos modelos pro. high (padrao) | medium | low | off.
// O gemini-3.8-flash recusa "minimal" (HTTP 400).
const THINKING_HEADROOM_TOKENS = { low: 1024, medium: 4096, high: 8192 };

export function isGeminiThinkingModel(model = '') {
  const name = String(model || '').toLowerCase();
  return /^gemini-3(\.\d+)?-(flash|pro)/.test(name) && !name.includes('lite');
}

export function isGeminiProModel(model = '') {
  return /^gemini-3(\.\d+)?-pro/.test(String(model || '').toLowerCase());
}

export function getGeminiThinkingOptions(model = '', env = process.env) {
  const raw = isGeminiProModel(model)
    ? (env.GEMINI_PRO_THINKING_LEVEL || 'high')
    : (env.GEMINI_THINKING_LEVEL || 'low');
  const level = String(raw).trim().toLowerCase();
  if (!isGeminiThinkingModel(model) || level === 'off' || !THINKING_HEADROOM_TOKENS[level]) {
    return { thinkingConfig: null, extraOutputTokens: 0 };
  }
  return { thinkingConfig: { thinkingLevel: level }, extraOutputTokens: THINKING_HEADROOM_TOKENS[level] };
}
