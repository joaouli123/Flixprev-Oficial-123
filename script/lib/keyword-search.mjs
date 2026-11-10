// Ajudantes da busca por palavra-chave (searchKeywordChunks no server.mjs).

// Os termos de busca chegam sem acento ("transicao"), mas o ILIKE do Postgres
// diferencia acento ("transição"). Dobra o texto do banco do mesmo jeito.
// O banco nao tem a extensao unaccent, por isso translate().
export const SQL_ACCENT_FROM = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
export const SQL_ACCENT_TO = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';

export function sqlAccentFold(expression) {
  return `translate(${expression}, '${SQL_ACCENT_FROM}', '${SQL_ACCENT_TO}')`;
}

function foldText(value = '') {
  return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// "Súmula 75", "Tema 1102", "OJ 342": o número sozinho é curto ou genérico demais
// e era descartado dos termos, então busca a expressão inteira.
// "n_" e "n._" sao curingas do ILIKE para "nº" e "n.º".
export function extractNumberedPrecedentPhrases(queryText = '') {
  const normalized = foldText(queryText);
  const phrases = [];
  for (const match of normalized.matchAll(/\b(sumula|tema|oj|orientacao jurisprudencial|enunciado|precedente|irdr|irr)\s*(?:vinculante\s*)?(?:n[º°o.]*\s*)?(\d{1,4})\b/g)) {
    phrases.push(`${match[1]} ${match[2]}`, `${match[1]} n_ ${match[2]}`, `${match[1]} n._ ${match[2]}`);
  }
  return [...new Set(phrases)].slice(0, 6);
}
