import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';

dotenv.config();

const rootDir = process.cwd();

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      continue;
    }

    const key = value.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = nextValue;
      index += 1;
    }
  }
  return args;
}

function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim();
  return normalized.replace(/\/+$/, '');
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

function resolveAttachmentPath(attachmentPath) {
  const normalized = String(attachmentPath || '').trim();
  if (!normalized) {
    return null;
  }

  const withoutLeadingSlash = normalized.replace(/^\/+/, '');
  return path.join(rootDir, 'public', withoutLeadingSlash);
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const rawText = await response.text();
  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      payload = { raw: rawText };
    }
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.error || rawText || response.statusText;
    const error = new Error(`HTTP ${response.status}: ${detail}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function getAgentFromDatabase(agentId) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const result = await pool.query(
      'SELECT id, title, description, attachments, extra_links FROM "agents" WHERE id = $1 LIMIT 1',
      [agentId]
    );
    return result.rows?.[0] || null;
  } finally {
    await pool.end();
  }
}

async function createOrFindCollection(baseUrl, agent, requestedCollectionId) {
  if (requestedCollectionId) {
    return { id: requestedCollectionId, reused: true };
  }

  const collectionName = String(agent.title || agent.id).trim();
  try {
    const created = await requestJson(baseUrl, '/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: collectionName,
        description: agent.description || `Collection sincronizada do agente ${agent.id}`,
      }),
    });
    return { ...created, reused: false };
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }

    const collections = await requestJson(baseUrl, '/collections');
    const existing = Array.isArray(collections)
      ? collections.find((collection) => collection.name === collectionName)
      : null;
    if (!existing) {
      throw error;
    }
    return { ...existing, reused: true };
  }
}

async function ingestDocument(baseUrl, collectionId, filePath) {
  const fileName = path.basename(filePath);
  const buffer = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('collection_id', collectionId);
  formData.append('file', new Blob([buffer]), fileName);

  return requestJson(baseUrl, '/ingest/document', {
    method: 'POST',
    body: formData,
  });
}

async function ingestUrl(baseUrl, collectionId, url) {
  return requestJson(baseUrl, '/ingest/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection_id: collectionId, url }),
  });
}

async function waitForJob(baseUrl, jobId, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await requestJson(baseUrl, `/ingest/status/${jobId}`);
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return { id: jobId, status: 'timeout', message: 'Tempo esgotado aguardando ingestao.' };
}

async function upsertEnvLine(envText, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(envText)) {
    return envText.replace(pattern, line);
  }
  return `${envText.trimEnd()}\n${line}\n`;
}

async function updateEnvMapping(agentId, collectionId, baseUrl, enableBridge) {
  const envPath = path.join(rootDir, '.env');
  let envText = '';
  try {
    envText = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    envText = '';
  }

  const mapMatch = envText.match(/^PYTHON_AGENT_COLLECTION_MAP=(.*)$/m);
  let currentMap = {};
  if (mapMatch?.[1]) {
    try {
      currentMap = JSON.parse(mapMatch[1]);
    } catch (error) {
      currentMap = {};
    }
  }

  currentMap[agentId] = collectionId;
  const nextMapLine = `PYTHON_AGENT_COLLECTION_MAP=${JSON.stringify(currentMap)}`;

  if (mapMatch) {
    envText = envText.replace(/^PYTHON_AGENT_COLLECTION_MAP=.*$/m, nextMapLine);
  } else {
    envText = `${envText.trimEnd()}\n${nextMapLine}\n`;
  }

  if (baseUrl) {
    envText = await upsertEnvLine(envText, 'PYTHON_AGENT_BASE_URL', baseUrl);
  }

  if (enableBridge) {
    envText = await upsertEnvLine(envText, 'ENABLE_PYTHON_AGENT_CORE', 'true');
  }

  await fs.writeFile(envPath, envText, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agentId = String(args['agent-id'] || process.env.AGENT_ID || '').trim();
  if (!agentId) {
    throw new Error('Informe --agent-id <uuid> ou AGENT_ID.');
  }

  const baseUrl = normalizeBaseUrl(args['base-url'] || process.env.PYTHON_AGENT_BASE_URL || process.env.API_BASE_URL || 'http://localhost:8000');
  if (!baseUrl) {
    throw new Error('PYTHON_AGENT_BASE_URL/API_BASE_URL nao configurada.');
  }

  const agent = await getAgentFromDatabase(agentId);
  if (!agent) {
    throw new Error(`Agente ${agentId} nao encontrado no banco atual.`);
  }

  const collection = await createOrFindCollection(baseUrl, agent, args['collection-id'] || process.env.PYTHON_AGENT_COLLECTION_ID || '');
  const attachments = normalizeArray(agent.attachments);
  const extraLinks = normalizeArray(agent.extra_links)
    .map((item) => typeof item === 'string' ? item : item?.url)
    .filter(Boolean);

  const jobs = [];
  for (const attachment of attachments) {
    const filePath = resolveAttachmentPath(attachment);
    if (!filePath) {
      continue;
    }

    try {
      await fs.access(filePath);
      const job = await ingestDocument(baseUrl, collection.id, filePath);
      jobs.push({ type: 'document', source: attachment, id: job.id });
      console.log(`[PYTHON_SYNC] Documento enfileirado: ${attachment} -> job ${job.id}`);
    } catch (error) {
      console.warn(`[PYTHON_SYNC] Documento ignorado (${attachment}): ${error.message}`);
    }
  }

  for (const url of extraLinks) {
    try {
      const job = await ingestUrl(baseUrl, collection.id, url);
      jobs.push({ type: 'url', source: url, id: job.id });
      console.log(`[PYTHON_SYNC] URL enfileirada: ${url} -> job ${job.id}`);
    } catch (error) {
      console.warn(`[PYTHON_SYNC] URL ignorada (${url}): ${error.message}`);
    }
  }

  if (!args['no-wait']) {
    for (const job of jobs) {
      const status = await waitForJob(baseUrl, job.id);
      console.log(`[PYTHON_SYNC] Job ${job.id}: ${status.status} - ${status.message || ''}`.trim());
    }
  }

  if (args['write-env'] || args.enable) {
    await updateEnvMapping(agent.id, collection.id, baseUrl, Boolean(args.enable));
    console.log('[PYTHON_SYNC] .env atualizado com PYTHON_AGENT_COLLECTION_MAP.');
  }

  console.log(JSON.stringify({
    agentId: agent.id,
    collectionId: collection.id,
    collectionName: collection.name || agent.title,
    reusedCollection: Boolean(collection.reused),
    queuedJobs: jobs.length,
    env: {
      ENABLE_PYTHON_AGENT_CORE: args.enable ? 'true' : process.env.ENABLE_PYTHON_AGENT_CORE || 'false',
      PYTHON_AGENT_BASE_URL: baseUrl,
      PYTHON_AGENT_COLLECTION_MAP: JSON.stringify({ [agent.id]: collection.id }),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(`[PYTHON_SYNC] ${error.message}`);
  process.exitCode = 1;
});