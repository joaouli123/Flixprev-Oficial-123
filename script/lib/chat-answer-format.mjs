// Keep source markers in the model output until grounding has been validated.
// Only the final, user-visible answer is passed through this formatter.
export function formatChatAnswerForUser(answer = '') {
  return String(answer || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{0,2}Fontes consultadas:\s*\n(?:\s*[-*]?\s*Fonte\s+\d+:[^\n]*(?:\n|$))+/gi, '\n')
    .replace(/\s*\[(?:Fonte|Fontes)\s+\d+(?:\s*(?:,|e|&)\s*(?:Fonte\s*)?\d+)*\]/gi, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
