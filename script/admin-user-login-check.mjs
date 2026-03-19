import { createClient } from '@supabase/supabase-js';

const baseUrl = String(process.env.BASE_URL || 'https://flixprev-oficial-123-production.up.railway.app').replace(/\/$/, '');
const adminUserId = String(process.env.ADMIN_USER_ID || '07d16581-fca5-4709-b0d3-e09859dbb286').trim();
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': adminUserId,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const email = `copilot.logincheck.${suffix}@example.com`;
const password = 'TesteAdmin123';
let createdUserId = null;

try {
  const createResponse = await request('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      full_name: `Copilot Login ${suffix}`,
      role: 'user',
      password,
      documento: '123.456.789-00',
      telefone: '(11) 98888-7777',
      practice_areas: ['previdenciario'],
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      complemento: 'Sala 1',
      bairro: 'Bela Vista',
      cidade: 'Sao Paulo',
      estado: 'SP',
      regiao: 'Sudeste',
      plan_type: 'premium',
      lifetime_access: true,
      expires_at: '',
      sexo: 'prefiro_nao_informar',
      data_nascimento: '1990-05-20',
      idade: 34,
    }),
  });

  createdUserId = createResponse.body?.user?.id || null;

  const loginResponse = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginText = await loginResponse.text();
  let loginBody = null;
  try { loginBody = loginText ? JSON.parse(loginText) : null; } catch { loginBody = loginText; }

  const usuariosRows = await client.from('usuarios').select('*').eq('user_id', createdUserId);
  const subscriptionsRows = await client.from('subscriptions').select('*').eq('user_id', createdUserId);

  console.log(JSON.stringify({
    email,
    createdUserId,
    createResponse,
    login: { status: loginResponse.status, body: loginBody },
    usuarios: usuariosRows,
    subscriptions: subscriptionsRows,
  }, null, 2));
} finally {
  if (createdUserId) {
    await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
