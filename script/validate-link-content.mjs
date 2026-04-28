import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import { extractKnowledgeBody, fetchLinkKnowledgeSource } from './lib/link-content-utils.mjs';

dotenv.config();

const ROOT = process.cwd();
const ATTACHMENTS_ROOT = path.join(ROOT, 'public', 'agent-attachments');
const OUTPUT_PATH = path.join(ROOT, 'attached_assets', 'link_content_validation_report.json');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

const requestedTopic = getArgValue('--topic');
const explicitLimit = Number.parseInt(getArgValue('--limit') || '', 10);
const limit = Number.isFinite(explicitLimit) && explicitLimit > 0 ? explicitLimit : 24;

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRelevantBody(raw = '') {
  return extractKnowledgeBody(raw);
}

function extractPrimaryHtmlContent(html = '') {
  const source = String(html || '');
  const mainCandidates = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<section[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  ];

  for (const pattern of mainCandidates) {
    const match = source.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length > 800) {
      return candidate;
    }
  }

  return source;
}

function htmlToPlainText(html = '') {
  return normalizeText(
    extractPrimaryHtmlContent(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
      .replace(/<form[\s\S]*?<\/form>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, ' $2 ($1) ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  )
    .replace(/portalvisitorscounterweb/gi, ' ')
    .replace(/voltar ao topo da pagina/gi, ' ')
    .replace(/reportar erro/gi, ' ')
    .replace(/redes sociais[\s\S]*$/i, ' ')
    .replace(/facebook|instagram|youtube|twitter|linkedin/gi, ' ')
    .replace(/termo de uso e politica de privacidade/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokenSet(value = '') {
  const matches = normalizeText(value).match(/[a-z0-9_-]{4,}/g) || [];
  return new Set(matches);
}

function computeTokenMetrics(savedText = '', liveText = '') {
  const savedTokens = getTokenSet(savedText);
  const liveTokens = getTokenSet(liveText);
  const intersection = new Set([...savedTokens].filter((token) => liveTokens.has(token)));
  const unionSize = new Set([...savedTokens, ...liveTokens]).size || 1;

  return {
    savedTokenCount: savedTokens.size,
    liveTokenCount: liveTokens.size,
    sharedTokenCount: intersection.size,
    savedCoverage: Number((intersection.size / Math.max(savedTokens.size, 1)).toFixed(4)),
    liveCoverage: Number((intersection.size / Math.max(liveTokens.size, 1)).toFixed(4)),
    jaccard: Number((intersection.size / unionSize).toFixed(4)),
  };
}

function detectNoiseFlags(rawText = '', normalizedText = '') {
  const entityMatches = String(rawText || '').match(/&[a-z0-9#]+;/gi) || [];
  const boilerplatePatterns = [
    /javascript is disabled/i,
    /entrar alternar navegacao/i,
    /mostrar filtros avancados/i,
    /pesquisa pesquisa pesquisar/i,
    /toda a juslaboris/i,
    /minha conta entrar/i,
  ];

  return {
    htmlEntityCount: entityMatches.length,
    hasBoilerplate: boilerplatePatterns.some((pattern) => pattern.test(normalizedText)),
  };
}

function classifyResult({
  fetchOk,
  savedLength,
  liveLength,
  metrics,
  noise,
}) {
  if (!fetchOk) return 'fetch_error';
  if (savedLength < 120 || liveLength < 120) return 'low_content';
  if (metrics.savedCoverage >= 0.8 && metrics.jaccard >= 0.55 && !noise.hasBoilerplate) return 'ok';
  if (metrics.savedCoverage >= 0.55 || metrics.jaccard >= 0.35) return 'review';
  return 'mismatch';
}

async function walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walk(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
      results.push(fullPath);
    }
  }

  return results;
}

function parseSourceUrl(raw = '') {
  const firstLine = String(raw || '').split(/\r?\n/, 1)[0] || '';
  if (!firstLine.startsWith('FONTE: ')) {
    return '';
  }

  return firstLine.slice('FONTE: '.length).trim();
}

async function fetchLiveText(url) {
  const source = await fetchLinkKnowledgeSource(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (FlixPrev Content Validator/2.0)' },
  });

  return normalizeText(extractKnowledgeBody(source.savedText || source.text || ''));
}

function sortCandidates(filePaths = []) {
  return [...filePaths].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function main() {
  const filePaths = sortCandidates(await walk(ATTACHMENTS_ROOT));
  const candidates = [];

  for (const filePath of filePaths) {
    const relPath = path.relative(ATTACHMENTS_ROOT, filePath);
    const topic = relPath.split(path.sep)[0] || '(root)';
    if (requestedTopic && topic !== requestedTopic) {
      continue;
    }

    const raw = await fs.readFile(filePath, 'utf8');
    const sourceUrl = parseSourceUrl(raw);
    if (!sourceUrl) {
      continue;
    }

    candidates.push({ filePath, relPath, topic, raw, sourceUrl });
  }

  const selected = candidates.slice(0, limit);
  const results = [];

  for (const item of selected) {
    const savedBody = extractRelevantBody(item.raw);
    const savedNormalized = normalizeText(savedBody);
    let liveNormalized = '';
    let fetchError = '';

    try {
      liveNormalized = await fetchLiveText(item.sourceUrl);
    } catch (error) {
      fetchError = error?.message || String(error);
    }

    const metrics = fetchError
      ? {
          savedTokenCount: 0,
          liveTokenCount: 0,
          sharedTokenCount: 0,
          savedCoverage: 0,
          liveCoverage: 0,
          jaccard: 0,
        }
      : computeTokenMetrics(savedNormalized, liveNormalized);

    const noise = detectNoiseFlags(item.raw, savedNormalized);
    const status = classifyResult({
      fetchOk: !fetchError,
      savedLength: savedNormalized.length,
      liveLength: liveNormalized.length,
      metrics,
      noise,
    });

    results.push({
      topic: item.topic,
      relPath: item.relPath.replace(/\\/g, '/'),
      sourceUrl: item.sourceUrl,
      status,
      fetchError,
      savedLength: savedNormalized.length,
      liveLength: liveNormalized.length,
      lengthRatio: liveNormalized.length > 0 ? Number((savedNormalized.length / liveNormalized.length).toFixed(4)) : null,
      noise,
      metrics,
    });
  }

  const summary = results.reduce((acc, item) => {
    acc.total += 1;
    acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
    acc.byTopic[item.topic] = (acc.byTopic[item.topic] || 0) + 1;
    return acc;
  }, { total: 0, byStatus: {}, byTopic: {} });

  const report = {
    generatedAt: new Date().toISOString(),
    limit,
    requestedTopic: requestedTopic || null,
    note: 'Este validador compara o TXT salvo com uma nova coleta do link atual. Diferencas podem indicar ruido de extracao, pagina dinamica, mudanca do site ou mudanca do conteudo ao longo do tempo.',
    summary,
    results,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, '/'),
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error('[VALIDATE-LINK-CONTENT] Falha:', error?.message || error);
  process.exit(1);
});
