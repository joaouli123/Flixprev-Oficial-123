const BASE_URL = String(process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const ADMIN_USER_ID = String(process.env.ADMIN_USER_ID || '07d16581-fca5-4709-b0d3-e09859dbb286').trim();

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-user-id': ADMIN_USER_ID,
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  const rawText = await response.text();
  let body = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = rawText;
  }

  if (!response.ok) {
    const error = new Error(typeof body === 'object' && body?.error ? body.error : `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const createPayload = {
    email: `copilot.admin.e2e.${suffix}@example.com`,
    full_name: `Copilot Admin E2E ${suffix}`,
    role: 'user',
    password: 'TesteAdmin123',
    documento: '123.456.789-00',
    telefone: '(11) 98888-7777',
    practice_areas: ['previdenciario', 'trabalhista'],
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    numero: '1578',
    complemento: 'Conjunto 202',
    bairro: 'Bela Vista',
    cidade: 'Sao Paulo',
    estado: 'SP',
    regiao: 'Sudeste',
    plan_type: 'premium',
    lifetime_access: false,
    expires_at: '2030-12-31',
    sexo: 'prefiro_nao_informar',
    data_nascimento: '1990-05-20',
    idade: 34,
  };

  let createdUserId = null;

  try {
    const listBefore = await requestJson('/api/admin/users', { method: 'GET' });
    assert(Array.isArray(listBefore), 'Listagem inicial nao retornou um array');

    const created = await requestJson('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(createPayload),
    });

    createdUserId = created?.user?.id || null;
    assert(createdUserId, 'Criacao nao retornou user.id');

    const updatePayload = {
      ...createPayload,
      email: createPayload.email,
      full_name: `${createPayload.full_name} Atualizado`,
      role: 'admin',
      password: undefined,
      telefone: '(11) 97777-6666',
      practice_areas: ['previdenciario', 'civil'],
      numero: '2000',
      complemento: 'Sala 09',
      bairro: 'Paraiso',
      cidade: 'Sao Paulo',
      lifetime_access: true,
      expires_at: '',
    };

    const updated = await requestJson(`/api/admin/users/${createdUserId}`, {
      method: 'PUT',
      body: JSON.stringify(updatePayload),
    });

    assert(updated?.user?.id === createdUserId, 'Atualizacao nao retornou o usuario correto');

    const listAfter = await requestJson('/api/admin/users', { method: 'GET' });
    const persistedUser = Array.isArray(listAfter)
      ? listAfter.find((user) => String(user?.id || '') === createdUserId)
      : null;

    assert(persistedUser, 'Usuario criado nao apareceu na listagem final');
    assert(persistedUser.nome_completo === updatePayload.full_name, 'Nome completo nao persistiu apos edicao');
    assert(persistedUser.role === 'admin', 'Role nao persistiu apos edicao');
    assert(persistedUser.telefone === updatePayload.telefone, 'Telefone nao persistiu apos edicao');
    assert(String(persistedUser.numero || '') === updatePayload.numero, 'Numero nao foi recomposto para o modal');
    assert(String(persistedUser.complemento || '') === updatePayload.complemento, 'Complemento nao foi recomposto para o modal');
    assert(persistedUser.subscription_expires_at === null, 'Acesso vitalicio nao limpou a expiracao');

    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      createdUserId,
      createdEmail: createPayload.email,
      verified: {
        nome_completo: persistedUser.nome_completo,
        role: persistedUser.role,
        telefone: persistedUser.telefone,
        numero: persistedUser.numero,
        complemento: persistedUser.complemento,
        subscription_expires_at: persistedUser.subscription_expires_at,
      },
    }, null, 2));
  } finally {
    if (createdUserId) {
      try {
        await requestJson(`/api/admin/users/${createdUserId}`, { method: 'DELETE' });
      } catch (error) {
        console.error('[cleanup] Falha ao remover usuario de teste:', error?.message || error);
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL,
    statusCode: error?.statusCode || null,
    message: error?.message || String(error),
    body: error?.body || null,
  }, null, 2));
  process.exit(1);
});