import 'dotenv/config';
import crypto from 'node:crypto';

const apiBaseUrl = String(process.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const agentId = process.argv[2];

if (!apiBaseUrl) {
  console.error('VITE_API_BASE_URL não configurada.');
  process.exit(1);
}

if (!agentId) {
  console.error('Uso: node script/test-agent-questions.mjs <agentId>');
  process.exit(1);
}

const userId = crypto.randomUUID();

const tests = [
  {
    audience: 'Leigo total',
    question: 'O que é um prompt? Explica como se eu tivesse 10 anos.',
  },
  {
    audience: 'Iniciante',
    question: 'Me dá um exemplo simples de prompt bom e um ruim para pedir um resumo de texto.',
  },
  {
    audience: 'Empreendedor',
    question: 'Quero usar IA na minha empresa, mas não sei escrever instruções. Qual estrutura básica devo seguir?',
  },
  {
    audience: 'Professor',
    question: 'Crie um prompt para eu pedir uma aula de 15 minutos sobre Revolução Francesa para alunos do ensino médio.',
  },
  {
    audience: 'Advogado',
    question: 'Monte um prompt para analisar uma petição e identificar tese, pedidos e riscos processuais.',
  },
  {
    audience: 'Marketing',
    question: 'Como eu peço para a IA criar uma legenda de Instagram sem ficar genérica?',
  },
  {
    audience: 'Pessoa objetiva',
    question: 'Quais são os 5 erros mais comuns na hora de escrever prompts?',
  },
  {
    audience: 'Teste de refinamento',
    question: 'Pegue este pedido ruim: “faz um texto pra mim” e transforme em um prompt excelente.',
  },
  {
    audience: 'Teste crítico',
    question: 'Se a resposta da IA vier vaga, o que eu devo acrescentar no prompt para melhorar?',
  },
  {
    audience: 'Teste avançado',
    question: 'Quero um prompt profissional para gerar um relatório executivo com contexto, objetivo, formato final e critérios de qualidade. Estruture isso para eu reaproveitar depois.',
  },
];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createConversation(title) {
  const response = await fetch(`${apiBaseUrl}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      title,
      agentId,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Falha ao criar conversa (${response.status})`);
  }

  return payload;
}

async function askQuestion(conversationId, question) {
  const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      content: question,
      agentId,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Falha ao perguntar (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Stream de resposta não disponível.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.startsWith('data: ')) {
        continue;
      }

      const jsonStr = part.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') {
        continue;
      }

      const data = JSON.parse(jsonStr);
      if (data.content) {
        answer += data.content;
      }
    }
  }

  return answer.trim();
}

async function askQuestionWithRetry(question, index) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const conversation = await createConversation(`Teste ${index} - tentativa ${attempt}`);
      const answer = await askQuestion(conversation.id, question);
      return { conversationId: conversation.id, answer, attempt };
    } catch (error) {
      lastError = error;
      await delay(1500 * attempt);
    }
  }

  throw lastError;
}

async function main() {
  const results = [];

  for (let index = 0; index < tests.length; index += 1) {
    const test = tests[index];
    const outcome = await askQuestionWithRetry(test.question, index + 1);

    results.push({
      index: index + 1,
      audience: test.audience,
      question: test.question,
      conversationId: outcome.conversationId,
      attempt: outcome.attempt,
      answer: outcome.answer,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});