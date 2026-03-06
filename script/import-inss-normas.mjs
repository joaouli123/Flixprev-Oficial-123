import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const ROOT = process.cwd();
const ATTACHMENTS_DIR = path.join(ROOT, 'public', 'agent-attachments', 'inss-normas');
const MANIFEST_PATH = path.join(ROOT, 'public', 'agent-attachments', 'inss-normas-manifest.json');

const NORMAS_PAGE = 'https://www.gov.br/inss/pt-br/centrais-de-conteudo/legislacao/normas-interativas-2/normas-interativas';
const PORTALIN_MAIN_JS = 'https://portalin.inss.gov.br/main.0ed01dbd79118b050c9d.js';
const DEFAULT_CATEGORY_NAME = 'Normas Interativas INSS';

const ICON_NAME = 'FileText';
const BG_ICON_NAME = 'ShieldCheck';

const INCLUDED_HOSTS = [
  'www.gov.br',
  'gov.br',
  'www.planalto.gov.br',
  'planalto.gov.br',
  'normas.receita.fazenda.gov.br',
  'sa.previdencia.gov.br',
  'acesso.mte.gov.br',
  'consultaesic.cgu.gov.br'
];

const EXCLUDED_HOSTS = [
  'youtube.com',
  'instagram.com',
  'facebook.com',
  'twitter.com',
  'threads.net',
  'tiktok.com',
  'flickr.com',
  'whatsapp.com',
  'g.co'
];

const args = process.argv.slice(2);
const options = {
  maxLinks: Number(getArgValue('--max-links') || '0') || 0,
  createAgents: hasArg('--create-agents'),
  enrichWithGemini: !hasArg('--no-gemini'),
  reprocessUrl: getArgValue('--reprocess-url') || '',
  userEmail: getArgValue('--email') || process.env.IMPORT_USER_EMAIL || '',
  userPassword: getArgValue('--password') || process.env.IMPORT_USER_PASSWORD || '',
  userId: getArgValue('--user-id') || process.env.IMPORT_USER_ID || '',
};

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function hasArg(name) {
  return args.includes(name);
}

function getArgValue(name) {
  const idx = args.indexOf(name);
  if (idx < 0) return '';
  return args[idx + 1] || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isCandidateNormUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const href = parsed.toString().toLowerCase();

    if (EXCLUDED_HOSTS.some((h) => host.includes(h))) return false;
    if (!INCLUDED_HOSTS.some((h) => host.endsWith(h) || host === h)) return false;
    if (href.endsWith('.jpg') || href.endsWith('.jpeg') || href.endsWith('.png') || href.endsWith('.gif') || href.endsWith('.svg')) return false;
    if (href.endsWith('.css') || href.endsWith('.js') || href.endsWith('.xml') || href.endsWith('.json')) return false;
    if (href.includes('/search?') || href.includes('/noticias') || href.includes('/redes-sociais')) return false;

    return (
      href.includes('/ccivil_03/') ||
      href.includes('/legislacao/') ||
      href.includes('/normas') ||
      href.includes('/decreto') ||
      href.includes('/lei/') ||
      href.includes('/mpv/') ||
      href.endsWith('.pdf')
    );
  } catch {
    return false;
  }
}

function extractUrlsFromText(text) {
  const regex = /https?:\/\/[^\s"'<>]+/g;
  const matches = text.match(regex) || [];
  const out = [];
  for (const raw of matches) {
    const clean = raw.replace(/[),.;]+$/, '');
    const normalized = normalizeUrl(clean);
    if (normalized) out.push(normalized);
  }
  return out;
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pieces = parsed.pathname.split('/').filter(Boolean);
    const last = decodeURIComponent(pieces[pieces.length - 1] || parsed.hostname);
    const cleaned = last
      .replace(/\.htm[l]?$/i, '')
      .replace(/\.pdf$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return cleaned.length > 4 ? cleaned : parsed.hostname;
  } catch {
    return 'Norma INSS';
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTextFromNormUrl(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (INSS-Normas-Importer)',
      'Accept': 'text/html,application/pdf;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Falha HTTP ${response.status} em ${url}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const ab = await response.arrayBuffer();
    const data = await pdfParse(Buffer.from(ab));
    return data.text?.replace(/\s+/g, ' ').trim() || '';
  }

  const html = await response.text();
  return stripHtml(html);
}

async function callGeminiForMetadata(sourceUrl, textSample) {
  if (!options.enrichWithGemini || !geminiApiKey) {
    return {
      title: `Norma INSS - ${titleFromUrl(sourceUrl)}`,
      role: 'Especialista em Norma Interativa INSS',
      description: 'Agente focado na interpretação desta norma interativa do INSS.',
      instructions: `Você é especialista nesta norma interativa. Responda apenas com base no conteúdo anexado desta fonte: ${sourceUrl}`,
      shortcuts: ['Resumo', 'Artigos principais', 'Direitos', 'Requisitos']
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
  const prompt = `Você vai organizar metadados para um agente de consulta jurídica/previdenciária.
Retorne APENAS JSON válido com as chaves:
title, role, description, instructions, shortcuts (array com até 4 itens curtos).

Regras:
- Português-BR.
- title no formato: "Norma INSS - ..." (máx 90 chars)
- description até 140 chars.
- instructions com 2-4 frases objetivas.
- Sem markdown.

URL da norma: ${sourceUrl}
Texto-base (amostra): ${textSample.slice(0, 7000)}`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Gemini falhou: ${res.status}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(text);

  return {
    title: String(parsed.title || `Norma INSS - ${titleFromUrl(sourceUrl)}`).slice(0, 90),
    role: String(parsed.role || 'Especialista em Norma Interativa INSS').slice(0, 90),
    description: String(parsed.description || 'Agente focado nesta norma interativa do INSS.').slice(0, 180),
    instructions: String(parsed.instructions || `Responda apenas com base na norma: ${sourceUrl}`),
    shortcuts: Array.isArray(parsed.shortcuts) ? parsed.shortcuts.slice(0, 4).map((s) => String(s).slice(0, 32)) : ['Resumo', 'Artigos principais']
  };
}

async function collectNormLinks() {
  console.log('[1/5] Coletando links de normas...');
  const [pageHtml, mainBundle] = await Promise.all([
    fetch(NORMAS_PAGE).then((r) => r.text()),
    fetch(PORTALIN_MAIN_JS).then((r) => r.text())
  ]);

  const rawUrls = [
    ...extractUrlsFromText(pageHtml),
    ...extractUrlsFromText(mainBundle)
  ];

  const unique = [...new Set(rawUrls.map(normalizeUrl).filter(Boolean))];
  const filtered = unique.filter(isCandidateNormUrl);

  const finalLinks = options.maxLinks > 0 ? filtered.slice(0, options.maxLinks) : filtered;
  console.log(`[1/5] ${finalLinks.length} links de normas selecionados.`);
  return finalLinks;
}

async function buildKnowledgeFiles(links) {
  console.log('[2/5] Extraindo conteúdo das normas...');
  await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });

  const manifest = [];
  for (let index = 0; index < links.length; index++) {
    const link = links[index];
    try {
      const text = await fetchTextFromNormUrl(link);
      if (!text || text.length < 200) {
        console.log(`  - [${index + 1}/${links.length}] conteúdo insuficiente: ${link}`);
        continue;
      }

      const suggestedTitle = titleFromUrl(link);
      const filename = `${String(index + 1).padStart(4, '0')}-${slugify(suggestedTitle)}.txt`;
      const absolute = path.join(ATTACHMENTS_DIR, filename);
      const relativeAttachment = `/agent-attachments/inss-normas/${filename}`;

      const body = `FONTE: ${link}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`;
      await fs.writeFile(absolute, body, 'utf8');

      manifest.push({
        index: index + 1,
        sourceUrl: link,
        filename,
        attachmentPath: relativeAttachment,
        textLength: text.length
      });

      console.log(`  - [${index + 1}/${links.length}] OK (${Math.round(text.length / 1000)}k chars)`);
      await sleep(250);
    } catch (error) {
      console.log(`  - [${index + 1}/${links.length}] ERRO: ${link} -> ${error.message}`);
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), total: manifest.length, items: manifest }, null, 2), 'utf8');
  console.log(`[2/5] Manifest salvo em: ${path.relative(ROOT, MANIFEST_PATH)}`);
  return manifest;
}

async function ensureCategory(supabase, userId) {
  const existing = await supabase
    .from('categories')
    .select('id,name')
    .eq('user_id', userId)
    .eq('name', DEFAULT_CATEGORY_NAME)
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data?.id) {
    return existing.data.id;
  }

  const created = await supabase
    .from('categories')
    .insert({
      id: crypto.randomUUID(),
      name: DEFAULT_CATEGORY_NAME,
      user_id: userId
    })
    .select('id')
    .single();

  if (created.error) throw new Error(`Falha ao criar categoria: ${created.error.message}`);
  return created.data.id;
}

async function createAgentsFromManifest(manifest) {
  if (!options.createAgents) {
    console.log('[3/5] Criação de agentes desabilitada (use --create-agents).');
    return { created: 0, userId: null };
  }

  if (!supabaseUrl || !supabaseAnon) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY são obrigatórios.');
  }
  console.log('[3/5] Autenticando e criando agentes no Supabase...');
  let supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let userId = options.userId;
  if (!userId && options.userEmail && options.userPassword) {
    const login = await supabase.auth.signInWithPassword({
      email: options.userEmail,
      password: options.userPassword
    });

    if (!login.error && login.data?.user?.id) {
      userId = login.data.user.id;
    } else if (supabaseServiceRole && options.userId) {
      supabase = createClient(supabaseUrl, supabaseServiceRole, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      userId = options.userId;
      console.log('[3/5] Login não disponível, seguindo com service role e user_id informado.');
    } else {
      throw new Error(`Falha no login Supabase: ${login.error?.message || 'sem usuário'}. Use --user-id com SUPABASE_SERVICE_ROLE_KEY.`);
    }
  } else if (userId && supabaseServiceRole) {
    supabase = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    console.log('[3/5] Usando service role para criação em lote.');
  } else if (!userId) {
    throw new Error('Informe --email/--password ou --user-id com SUPABASE_SERVICE_ROLE_KEY.');
  }

  const categoryId = await ensureCategory(supabase, userId);

  const existingAgents = await supabase
    .from('agents')
    .select('id,instructions')
    .eq('user_id', userId)
    .limit(10000);

  const existingBySource = new Set(
    (existingAgents.data || [])
      .map((row) => {
        const match = String(row.instructions || '').match(/Fonte oficial:\s*(https?:\/\/\S+)/i);
        return match?.[1] ? normalizeUrl(match[1]) : null;
      })
      .filter(Boolean)
  );

  let created = 0;
  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    try {
      if (existingBySource.has(normalizeUrl(item.sourceUrl))) {
        console.log(`  - [${i + 1}/${manifest.length}] já existe agente desta fonte, pulando.`);
        continue;
      }

      const fileBody = await fs.readFile(path.join(ATTACHMENTS_DIR, item.filename), 'utf8');
      const aiMeta = await callGeminiForMetadata(item.sourceUrl, fileBody);

      const payload = {
        id: crypto.randomUUID(),
        user_id: userId,
        title: aiMeta.title,
        role: aiMeta.role,
        description: aiMeta.description,
        instructions: `${aiMeta.instructions}\n\nFonte oficial: ${item.sourceUrl}`,
        icon: ICON_NAME,
        background_icon: BG_ICON_NAME,
        category_ids: [categoryId],
        shortcuts: aiMeta.shortcuts,
        attachments: [item.attachmentPath]
      };

      let result = await supabase.from('agents').insert(payload);
      if (result.error && /background_icon/i.test(result.error.message || '')) {
        const fallback = { ...payload };
        delete fallback.background_icon;
        result = await supabase.from('agents').insert(fallback);
      }

      if (result.error) {
        console.log(`  - [${i + 1}/${manifest.length}] erro ao criar agente: ${result.error.message}`);
        continue;
      }

      created++;
      console.log(`  - [${i + 1}/${manifest.length}] agente criado: ${payload.title}`);
      await sleep(200);
    } catch (error) {
      console.log(`  - [${i + 1}/${manifest.length}] falha: ${error.message}`);
    }
  }

  return { created, userId };
}

async function triggerReprocess() {
  if (!options.reprocessUrl) {
    console.log('[4/5] Reprocessamento RAG não acionado (sem --reprocess-url).');
    return false;
  }

  const url = options.reprocessUrl.replace(/\/$/, '') + '/api/admin/reprocess-attachments';
  console.log(`[4/5] Acionando reprocessamento: ${url}`);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Falha ao reprocessar: HTTP ${res.status}`);
  const data = await res.json();
  console.log(`[4/5] Reprocessamento concluído: ${JSON.stringify(data)}`);
  return true;
}

async function main() {
  console.log('=== Importador de Normas Interativas INSS ===');
  console.log(`Gemini ativo: ${options.enrichWithGemini && !!geminiApiKey ? 'sim' : 'não'}`);

  const links = await collectNormLinks();
  if (!links.length) throw new Error('Nenhum link de norma encontrado.');

  const manifest = await buildKnowledgeFiles(links);
  if (!manifest.length) throw new Error('Nenhum conteúdo válido foi extraído das normas.');

  const { created } = await createAgentsFromManifest(manifest);
  await triggerReprocess();

  console.log('[5/5] Finalizado.');
  console.log(`Arquivos gerados: ${manifest.length}`);
  console.log(`Agentes criados: ${created}`);
}

main().catch((error) => {
  console.error('[ERRO FATAL]', error.message);
  process.exit(1);
});
