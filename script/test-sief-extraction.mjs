import dotenv from 'dotenv';
import { readFile } from 'fs/promises';

dotenv.config();

async function fetchWithRetry(url, tries = 3) {
  let lastError = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev Tributario Ingestion/1.0)',
          Accept: 'application/json,text/html,application/pdf;q=0.9,*/*;q=0.8',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, i * 500));
    }
  }
  throw lastError;
}

async function fetchSiefReceitasAsText() {
  const apiUrl = 'https://siefreceitas.receita.economia.gov.br/api/receitas';
  const response = await fetchWithRetry(apiUrl, 4);
  const data = await response.json();

  const lines = [];
  lines.push('FONTE: SIEF Receita Federal - Códigos de Receita');
  lines.push(`TOTAL_REGISTROS: ${data.length}`);
  lines.push('CAMPOS: codigo | denominacao | inicio_vigencia | fim_vigencia | fundamentos');
  lines.push('');

  for (const item of data) {
    const codigo = item?.recCd ?? '';
    const nome = String(item?.recNm || '').replace(/\s+/g, ' ').trim();
    const inicio = item?.dtInicioVigencia || '';
    const fim = item?.dtFimVigencia || '';
    const fundamentos = Array.isArray(item?.fundamentos)
      ? item.fundamentos.map((f) => {
          const tipo = f?.tpAto?.descricao || '';
          const numero = f?.numero != null ? String(f.numero) : '';
          const dataAto = f?.data || '';
          return [tipo, numero ? `nº ${numero}` : '', dataAto].filter(Boolean).join(' ');
        }).filter(Boolean)
      : [];

    lines.push(`${codigo} | ${nome} | ${inicio} | ${fim} | ${fundamentos.join(' || ')}`);
  }

  return lines.join('\n');
}

const text = await fetchSiefReceitasAsText();
const rows = text.split('\n').filter((l) => /^\d+\s\|/.test(l));
console.log(JSON.stringify({ chars: text.length, linhasRegistros: rows.length, first: rows[0]?.slice(0, 160) }, null, 2));
