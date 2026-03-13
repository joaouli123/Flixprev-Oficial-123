import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const baseUrl = String(
  process.env.APP_BASE_URL
  || process.env.VITE_API_BASE_URL
  || 'https://flixprev-oficial-123-production.up.railway.app'
).replace(/\/$/, '');

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const testUserId = String(process.env.RAG_TEST_USER_ID || '4a2e1967-12ce-4850-9e93-c2a761f2b779').trim();
const runId = `rag-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
const reportDir = path.join(process.cwd(), 'attached_assets');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para o teste e2e.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const cases = [
  {
    slug: 'gemini-31-preview',
    title: 'Teste E2E Gemini 3.1',
    instruction: 'Responder somente com o conteúdo do agente. Se a informação não estiver na base lida, diga claramente que ela não foi encontrada.',
    url: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview?hl=pt-br',
    fileText: 'ARQUIVO DE APOIO 1. Chave local: aurora-31. Este agente deve citar a chave aurora-31 quando a pergunta mencionar a palavra apoio.',
    question: 'Qual é o código do modelo mostrado na documentação da URL?',
    expectedIncludes: ['gemini-3.1-pro-preview'],
    mode: 'in-context',
  },
  {
    slug: 'railway-cli',
    title: 'Teste E2E Railway CLI',
    instruction: 'Use só o conteúdo indexado do agente. Nunca complemente com conhecimento externo.',
    url: 'https://docs.railway.com/cli',
    fileText: 'ARQUIVO DE APOIO 2. Palavra de verificação: trilho-vapor. Ela existe apenas neste arquivo de teste.',
    question: 'Quais comandos a documentação mostra para login e para linkar um diretório?',
    expectedIncludes: ['login', 'link'],
    mode: 'in-context',
  },
  {
    slug: 'vite-env-mode',
    title: 'Teste E2E Vite Env',
    instruction: 'Responda apenas com base no que estiver nos links e anexos treinados.',
    url: 'https://vite.dev/guide/env-and-mode',
    fileText: 'ARQUIVO DE APOIO 3. Senha textual de teste: cometa-vite-77.',
    question: 'Qual prefixo uma variável precisa ter para ser exposta ao código do cliente no Vite?',
    expectedIncludes: ['VITE_'],
    mode: 'in-context',
  },
  {
    slug: 'react-deferred-value',
    title: 'Teste E2E React Deferred',
    instruction: 'Sua resposta deve sair exclusivamente do conteúdo processado pelo RAG deste agente.',
    url: 'https://react.dev/reference/react/useDeferredValue',
    fileText: 'ARQUIVO DE APOIO 4. Identificador exclusivo: orquidea-reativa-44.',
    question: 'Qual identificador exclusivo aparece no arquivo complementar deste agente?',
    expectedIncludes: ['orquidea-reativa-44'],
    mode: 'in-context',
  },
  {
    slug: 'supabase-rls',
    title: 'Teste E2E Supabase RLS',
    instruction: 'Fale só com base no conteúdo que foi lido. Se a resposta não estiver nele, recuse com transparência.',
    url: 'https://supabase.com/docs/guides/database/postgres/row-level-security',
    fileText: 'ARQUIVO DE APOIO 5. Marcador reservado: prisma-rls-55.',
    question: 'Qual marcador reservado foi gravado no arquivo complementar deste agente?',
    expectedIncludes: ['prisma-rls-55'],
    mode: 'in-context',
  },
  {
    slug: 'mdn-http',
    title: 'Teste E2E MDN HTTP',
    instruction: 'Responda somente usando o conteúdo da base do agente. Fora disso, diga que não encontrou essa informação na base.',
    url: 'https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Overview',
    fileText: 'ARQUIVO DE APOIO 6. Código local: neblina-http-66.',
    question: 'Quem venceu a Copa do Mundo de 2002?',
    expectedIncludes: ['não encontrei', 'base do agente'],
    mode: 'out-of-context',
  },
  {
    slug: 'node-fetch',
    title: 'Teste E2E Node Fetch',
    instruction: 'Use apenas o contexto lido pelo agente. Não use memória do modelo nem responda por fora do material.',
    url: 'https://nodejs.org/api/globals.html#fetch',
    fileText: 'ARQUIVO DE APOIO 7. Código local: marujo-fetch-77.',
    question: 'Qual é a capital da Austrália?',
    expectedIncludes: ['não encontrei', 'conteúdo'],
    mode: 'out-of-context',
  },
  {
    slug: 'openai-embeddings',
    title: 'Teste E2E OpenAI Embeddings',
    instruction: 'A sua única fonte é o conteúdo treinado. Se faltar contexto, admita isso sem tentar completar.',
    url: 'https://docs.github.com/en/get-started/start-your-journey/about-github-and-git',
    fileText: 'ARQUIVO DE APOIO 8. Código local: vetorial-88.',
    question: 'Quantos lados tem um hexágono regular?',
    expectedIncludes: ['não encontrei', 'informação'],
    mode: 'out-of-context',
  },
  {
    slug: 'python-datetime',
    title: 'Teste E2E Python Datetime',
    instruction: 'Só responda o que estiver na base lida por URL e arquivos. Nada de completar com conhecimento geral.',
    url: 'https://docs.python.org/3/library/datetime.html',
    fileText: 'ARQUIVO DE APOIO 9. Código local: cronos-99.',
    question: 'Quem descobriu o Brasil?',
    expectedIncludes: ['não encontrei', 'base'],
    mode: 'out-of-context',
  },
  {
    slug: 'w3c-html',
    title: 'Teste E2E W3C HTML',
    instruction: 'Responda apenas com base no RAG deste agente. Se a pergunta não estiver nos materiais, informe isso explicitamente.',
    url: 'https://html.spec.whatwg.org/multipage/',
    fileText: 'ARQUIVO DE APOIO 10. Código local: hipertexto-1010.',
    question: 'Qual é o maior planeta do sistema solar?',
    expectedIncludes: ['não encontrei', 'materiais'],
    mode: 'out-of-context',
  },
];

async function apiJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.error || payload?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload;
}

async function apiSseText(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `${response.status} ${response.statusText}`);
  }

  let content = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) {
      continue;
    }
    const json = line.slice(6).trim();
    if (!json) {
      continue;
    }
    const payload = JSON.parse(json);
    if (payload.content) {
      content += payload.content;
    }
  }
  return content.trim();
}

async function createAgent(caseData, attachmentPaths = []) {
  const agentId = crypto.randomUUID();
  const payload = {
    id: agentId,
    title: `[${runId}] ${caseData.title}`,
    role: 'assistant',
    description: `Agente temporário de teste ${caseData.slug}`,
    icon: 'Bot',
    user_id: testUserId,
    category_ids: [],
    instructions: caseData.instruction,
    attachments: Array.isArray(attachmentPaths) ? attachmentPaths : [],
    extra_links: [{ label: caseData.title, url: caseData.url }],
  };

  const { error } = await supabase.from('agents').insert([payload]);
  if (error) {
    throw new Error(`Falha ao criar agente ${caseData.slug}: ${error.message}`);
  }
  return agentId;
}

async function uploadAttachment(caseData) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${runId}-`));
  const filePath = path.join(tempDir, `${caseData.slug}.txt`);
  await fs.writeFile(filePath, caseData.fileText, 'utf8');

  const form = new FormData();
  form.set('file', new Blob([caseData.fileText], { type: 'text/plain' }), `${caseData.slug}.txt`);

  const response = await fetch(`${baseUrl}/api/agents/upload`, {
    method: 'POST',
    body: form,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Falha no upload do arquivo ${caseData.slug}`);
  }
  return payload;
}

async function syncLinks(agentId, caseData) {
  return apiJson(`${baseUrl}/api/agents/${agentId}/sync-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
    body: JSON.stringify({ links: [{ label: caseData.title, url: caseData.url }] }),
  });
}

async function createConversation(agentId, caseData) {
  return apiJson(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
    body: JSON.stringify({ title: `Conversa ${caseData.slug}`, agentId }),
  });
}

async function askConversation(conversationId, agentId, question) {
  return apiSseText(`${baseUrl}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
    body: JSON.stringify({ content: question, agentId }),
  });
}

async function readChunkCount(agentId) {
  const { count, error } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId);

  if (error) {
    throw new Error(`Falha ao contar chunks para ${agentId}: ${error.message}`);
  }

  return Number(count || 0);
}

async function cleanupAgent(agentId) {
  const conversationRows = await supabase
    .from('conversations')
    .select('id')
    .eq('agent_id', agentId);

  const conversationIds = (conversationRows.data || []).map((row) => row.id).filter(Boolean);
  if (conversationIds.length > 0) {
    await supabase.from('messages').delete().in('conversation_id', conversationIds);
    await supabase.from('conversations').delete().in('id', conversationIds);
  }

  await supabase.from('document_chunks').delete().eq('agent_id', agentId);
  await supabase.from('documents').delete().eq('agent_id', agentId);
  await supabase.from('agents').delete().eq('id', agentId);
}

function evaluateResponse(caseData, answer) {
  const normalizedAnswer = String(answer || '').toLowerCase();
  if (caseData.mode === 'out-of-context') {
    const refusalPatterns = [
      'não encontrei',
      'não tenho essa informação',
      'não está presente no contexto',
      'não foi encontrada na base do agente',
      'não está presente no conteúdo',
    ];
    const leakedFacts = ['canberra', 'seis lados', 'pedro álvares', 'pedro alvares', 'júpiter', 'jupiter'];
    const hasRefusal = refusalPatterns.some((pattern) => normalizedAnswer.includes(pattern));
    const hasLeak = leakedFacts.some((fact) => normalizedAnswer.includes(fact));

    return {
      passed: hasRefusal && !hasLeak,
      missing: hasRefusal ? [] : ['Recusa estrita não detectada'],
    };
  }

  const missing = caseData.expectedIncludes.filter((item) => !normalizedAnswer.includes(String(item).toLowerCase()));
  return {
    passed: missing.length === 0,
    missing,
  };
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });
  const results = [];

  for (const caseData of cases) {
    const startedAt = new Date().toISOString();
    const result = {
      slug: caseData.slug,
      title: caseData.title,
      mode: caseData.mode,
      instruction: caseData.instruction,
      url: caseData.url,
      question: caseData.question,
      started_at: startedAt,
      passed: false,
    };

    let agentId = null;
    try {
      const uploadResult = await uploadAttachment(caseData);
      result.upload = uploadResult;

      agentId = await createAgent(caseData, uploadResult?.path ? [uploadResult.path] : []);
      result.agent_id = agentId;

      const syncResult = await syncLinks(agentId, caseData);
      result.sync = syncResult;

      const chunkCount = await readChunkCount(agentId);
      result.chunk_count = chunkCount;

      const conversation = await createConversation(agentId, caseData);
      result.conversation_id = conversation.id;

      const answer = await askConversation(conversation.id, agentId, caseData.question);
      result.answer = answer;

      const evaluation = evaluateResponse(caseData, answer);
      result.passed = evaluation.passed && chunkCount > 0;
      result.missing = evaluation.missing;

      if (chunkCount <= 0) {
        result.passed = false;
        result.missing = [...(result.missing || []), 'Nenhum chunk foi gerado'];
      }
    } catch (error) {
      result.error = error?.message || String(error);
      result.passed = false;
    } finally {
      result.finished_at = new Date().toISOString();
      results.push(result);
      if (agentId) {
        await cleanupAgent(agentId).catch(() => undefined);
      }
    }
  }

  const summary = {
    run_id: runId,
    base_url: baseUrl,
    user_id: testUserId,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    results,
  };

  const jsonPath = path.join(reportDir, `${runId}.json`);
  const mdPath = path.join(reportDir, `${runId}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

  const md = [
    `# Relatório ${runId}`,
    '',
    `- Base URL: ${baseUrl}`,
    `- Usuário de teste: ${testUserId}`,
    `- Total: ${summary.total}`,
    `- Aprovados: ${summary.passed}`,
    `- Falhos: ${summary.failed}`,
    '',
    ...results.map((item) => [
      `## ${item.title}`,
      '',
      `- Modo: ${item.mode}`,
      `- Status: ${item.passed ? 'PASSOU' : 'FALHOU'}`,
      `- URL: ${item.url}`,
      `- Pergunta: ${item.question}`,
      `- Chunks: ${item.chunk_count ?? 'n/d'}`,
      item.error ? `- Erro: ${item.error}` : `- Resposta: ${item.answer || ''}`,
      item.missing?.length ? `- Faltou: ${item.missing.join(', ')}` : '- Faltou: nada',
      '',
    ].join('\n')),
  ].join('\n');

  await fs.writeFile(mdPath, md, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

await main();