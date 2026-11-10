// O pdf-parse entrega o texto em pedacos e o extrator junta os pedacos com espaco.
// Quando o PDF quebra uma palavra no meio ("atualizaç" + "ão"), o trecho fica
// "atualizaç ão" e a busca por palavra-chave nao acha "atualização".
// Em portugues nenhuma palavra termina em "ç": "ç ão" / "ç ões" e sempre uma palavra
// partida. So junta esses sufixos; "exposiç ao agente" (PDF que perdeu o "ão") fica como esta.
const SPLIT_CEDILLA = /([A-Za-zÀ-ÖØ-öø-ÿ][çÇ]) (ão|ões|ÃO|ÕES)(?![A-Za-zÀ-ÖØ-öø-ÿ])/g;

export function repairSplitPortugueseWords(value = '') {
  return String(value || '').replace(SPLIT_CEDILLA, '$1$2');
}
