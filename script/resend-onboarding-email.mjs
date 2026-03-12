import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const targetEmail = process.argv[2];
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL;
const redirectTo = process.env.APP_RESET_PASSWORD_URL || 'https://flixprev.uxcodedev.com.br/reset-password';
const appBaseUrl = process.env.APP_BASE_URL || 'https://flixprev.uxcodedev.com.br';

if (!targetEmail) {
  throw new Error('Uso: node script/resend-onboarding-email.mjs <email>');
}

if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY e RESEND_FROM_EMAIL sao obrigatorios');
}

function buildHtml(actionLink) {
  return buildHtmlWithData({ actionLink });
}

function safeGet(obj, path) {
  let current = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function asString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.').trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Nao informado';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

function formatDateTime(value) {
  if (!value) {
    return 'Nao informado';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Nao informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function normalizeAmount(value) {
  const parsed = asNumber(value);
  if (!parsed || parsed <= 0) {
    return 0;
  }

  if (parsed > 10000) {
    return Number((parsed / 100).toFixed(2));
  }

  return Number(parsed.toFixed(2));
}

function buildHtmlWithData({ actionLink, customerName, customerEmail, customerPhone, documento, plan, productName, amount, purchaseDate }) {
  const name = escapeHtml(customerName || 'Cliente');
  const firstName = escapeHtml((customerName || 'Cliente').trim().split(/\s+/)[0] || 'Cliente');
  const email = escapeHtml(customerEmail || targetEmail);
  const phone = escapeHtml(customerPhone || 'Nao informado');
  const document = escapeHtml(documento || 'Nao informado');
  const planName = escapeHtml(plan || 'Plano FlixPrev');
  const product = escapeHtml(productName || plan || 'Acesso FlixPrev');
  const formattedAmount = escapeHtml(formatCurrency(amount));
  const formattedPurchaseDate = escapeHtml(formatDateTime(purchaseDate));
  const safeLink = escapeHtml(actionLink);
  const safeBaseUrl = escapeHtml(appBaseUrl);

  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;margin-bottom:16px;">FlixPrev</div>
        <h1 style="margin:0 0 12px;font-size:30px;line-height:1.2;font-weight:700;color:#0f172a;">Bem-vindo, ${firstName}</h1>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.7;color:#334155;">Sua compra foi aprovada e o seu acesso a FlixPrev ja esta liberado.</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">Para entrar na plataforma, basta definir sua senha no botao abaixo e usar o e-mail <strong>${email}</strong> como acesso.</p>
        <div style="margin:0 0 24px;padding:18px 20px;background:linear-gradient(135deg,#eef1ff 0%,#f8fafc 100%);border:1px solid #dbe3ff;border-radius:12px;">
          <div style="font-size:14px;font-weight:700;color:#434DCE;margin-bottom:10px;">Detalhes da compra</div>
          <div style="font-size:14px;line-height:1.8;color:#334155;">
            <div><strong>Produto:</strong> ${product}</div>
            <div><strong>Plano:</strong> ${planName}</div>
            <div><strong>Data da aprovacao:</strong> ${formattedPurchaseDate}</div>
            <div><strong>Valor:</strong> ${formattedAmount}</div>
          </div>
        </div>
        <div style="margin:28px 0;">
          <a href="${safeLink}" style="display:inline-block;background:#434DCE;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:10px;">Definir senha e acessar</a>
        </div>
        <div style="margin:0 0 24px;padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px;">Dados de acesso</div>
          <div style="font-size:14px;line-height:1.8;color:#475569;">
            <div><strong>Nome:</strong> ${name}</div>
            <div><strong>E-mail:</strong> ${email}</div>
            <div><strong>Telefone:</strong> ${phone}</div>
            <div><strong>Documento:</strong> ${document}</div>
          </div>
        </div>
        <div style="margin:0 0 22px;padding:0 2px;">
          <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;">Como acessar agora</div>
          <div style="font-size:14px;line-height:1.8;color:#475569;">
            <div>1. Clique em <strong>Definir senha e acessar</strong>.</div>
            <div>2. Crie sua senha de acesso.</div>
            <div>3. Entre na area interna da plataforma com o seu e-mail.</div>
          </div>
        </div>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569;">Se o botao nao abrir imediatamente, tente novamente pelo mesmo link em outro navegador ou dispositivo.</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">Acesse: <a href="${safeBaseUrl}" style="color:#434DCE;text-decoration:none;">${safeBaseUrl}</a></p>
      </div>
    </div>`;
}

function buildAppRecoveryUrl(baseUrl, tokenHash, type = 'recovery') {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '');
  return `${normalizedBaseUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`;
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data: userData, error: userLookupError } = await supabase
  .from('usuarios')
  .select('user_id, nome_completo, email, documento, telefone')
  .eq('email', targetEmail)
  .order('updated_at', { ascending: false, nullsFirst: false })
  .order('created_at', { ascending: false, nullsFirst: false })
  .limit(1)
  .maybeSingle();

if (userLookupError) {
  throw new Error(`Erro ao buscar usuario para reenvio: ${userLookupError.message}`);
}

let subscriptionData = null;
if (userData?.user_id) {
  const subscriptionLookup = await supabase
    .from('subscriptions')
    .select('plan_type, starts_at, updated_at, created_at, metadata')
    .eq('user_id', userData.user_id)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionLookup.error) {
    throw new Error(`Erro ao buscar assinatura para reenvio: ${subscriptionLookup.error.message}`);
  }

  subscriptionData = subscriptionLookup.data;
}

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'invite',
  email: targetEmail,
  options: {
    redirectTo,
  },
});

if (error) {
  throw new Error(`Erro ao gerar link de recuperacao: ${error.message}`);
}

const hashedToken = data?.properties?.hashed_token;
if (!hashedToken) {
  throw new Error('Supabase nao retornou hashed_token');
}

const actionLink = buildAppRecoveryUrl(appBaseUrl, hashedToken, 'invite');
const subscriptionMetadata = safeGet(subscriptionData, ['metadata', 'data']) || safeGet(subscriptionData, ['metadata']) || {};
const customerName = userData?.nome_completo || null;
const customerPhone = userData?.telefone || null;
const documento = userData?.documento || null;
const plan = asString(subscriptionData?.plan_type);
const productName =
  asString(safeGet(subscriptionMetadata, ['product', 'name'])) ||
  asString(safeGet(subscriptionMetadata, ['offer', 'name'])) ||
  asString(safeGet(subscriptionMetadata, ['plan', 'name'])) ||
  plan;
const purchaseDate =
  asString(safeGet(subscriptionMetadata, ['paidAt'])) ||
  asString(safeGet(subscriptionMetadata, ['createdAt'])) ||
  subscriptionData?.updated_at ||
  subscriptionData?.created_at ||
  subscriptionData?.starts_at ||
  null;
const amount = normalizeAmount(
  safeGet(subscriptionMetadata, ['amount']) ||
  safeGet(subscriptionMetadata, ['subscription', 'amount']) ||
  safeGet(subscriptionMetadata, ['offer', 'price'])
);

const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${resendApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: fromEmail,
    to: [targetEmail],
    subject: 'Sua compra foi aprovada | FlixPrev',
    html: buildHtmlWithData({
      actionLink,
      customerName,
      customerEmail: targetEmail,
      customerPhone,
      documento,
      plan,
      productName,
      amount,
      purchaseDate,
    }),
  }),
});

const payload = await response.text();
if (!response.ok) {
  throw new Error(`Erro ao enviar email pelo Resend: ${payload || response.status}`);
}

console.log(payload || 'Email enviado com sucesso');
