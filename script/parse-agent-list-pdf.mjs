import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const INPUT_PATH = process.argv[2] || path.join(process.cwd(), 'LISTA AGENTES.docx');
const OUT_DIR = path.join(process.cwd(), 'attached_assets');

function normalizeUrl(raw) {
  try {
    const parsed = new URL(String(raw).trim());
    if (parsed.protocol === 'file:') return parsed.toString();

    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((p) => parsed.searchParams.delete(p));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function inferCategory(line) {
  const l = line.toLowerCase();
  if (l.includes('previdenci')) return 'Previdenciário';
  if (l.includes('tribut')) return 'Dir. Tributários';
  if (l.includes('trabalh')) return 'Dir. Trabalhista';
  return null;
}

function inferAgentName(line) {
  const cleaned = line.trim();
  if (!cleaned) return null;

  if (/agente/i.test(cleaned) || /^[A-Z0-9][A-Za-zÀ-ÿ0-9\-\s]{2,40}\s*[-–]/.test(cleaned)) {
    const name = cleaned
      .replace(/\s{2,}/g, ' ')
      .split(':')[0]
      .split(' - ')[0]
      .trim();

    if (name.length >= 3 && name.length <= 80) return name;
  }

  return null;
}

const buf = await fs.readFile(INPUT_PATH);

let text = '';
const lowerInput = INPUT_PATH.toLowerCase();

if (lowerInput.endsWith('.docx')) {
  const parsed = await mammoth.extractRawText({ buffer: buf });
  text = String(parsed.value || '').replace(/\r/g, '');
} else {
  const parsed = await pdfParse(buf);
  text = String(parsed.text || '').replace(/\r/g, '');
}

const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

let currentCategory = null;
let currentAgent = null;

const agentsMap = new Map();
const allUrls = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  const maybeCategory = inferCategory(line);
  if (maybeCategory) currentCategory = maybeCategory;

  const maybeAgent = inferAgentName(line);
  if (maybeAgent) {
    currentAgent = maybeAgent;
    if (!agentsMap.has(currentAgent)) {
      agentsMap.set(currentAgent, {
        agent: currentAgent,
        category: currentCategory,
        urls: [],
      });
    }
    if (currentCategory && !agentsMap.get(currentAgent).category) {
      agentsMap.get(currentAgent).category = currentCategory;
    }
  }

  const urlMatches = line.match(/(https?:\/\/[^\s)\]\>"']+|file:\/\/[^\s)\]\>"']+)/gi) || [];
  for (const raw of urlMatches) {
    const normalized = normalizeUrl(raw);
    if (!normalized) continue;

    allUrls.push(normalized);

    if (!currentAgent) {
      currentAgent = 'Sem agente identificado';
      if (!agentsMap.has(currentAgent)) {
        agentsMap.set(currentAgent, { agent: currentAgent, category: currentCategory, urls: [] });
      }
    }

    agentsMap.get(currentAgent).urls.push(normalized);
  }
}

const agents = [...agentsMap.values()].map((row) => ({
  ...row,
  urls: [...new Set(row.urls)],
}));

const uniqUrls = [...new Set(allUrls)];

const result = {
  source: INPUT_PATH,
  extractedAt: new Date().toISOString(),
  textLength: text.length,
  totalLines: lines.length,
  totalUrls: allUrls.length,
  uniqueUrls: uniqUrls.length,
  agentsCount: agents.length,
  agents,
  urls: uniqUrls,
};

await fs.mkdir(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'agent-list-extracted.json');
await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');

console.log(JSON.stringify({
  outPath,
  agentsCount: result.agentsCount,
  uniqueUrls: result.uniqueUrls,
  sampleAgents: agents.slice(0, 8).map((a) => ({ agent: a.agent, category: a.category, urls: a.urls.length })),
}, null, 2));
