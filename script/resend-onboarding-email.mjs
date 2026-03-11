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
  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;margin-bottom:16px;">FlixPrev</div>
        <h1 style="margin:0 0 12px;font-size:30px;line-height:1.2;font-weight:700;color:#0f172a;">Sua compra foi aprovada</h1>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#334155;">Seu acesso ja foi criado. Para entrar no sistema, defina sua senha pelo botao abaixo.</p>
        <div style="margin:28px 0;">
          <a href="${actionLink}" style="display:inline-block;background:#434DCE;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:10px;">Definir senha e acessar</a>
        </div>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569;">Depois de criar sua senha, voce entrara na area interna da plataforma.</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">Acesse: <a href="${appBaseUrl}" style="color:#434DCE;text-decoration:none;">${appBaseUrl}</a></p>
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

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'recovery',
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

const actionLink = buildAppRecoveryUrl(appBaseUrl, hashedToken, 'recovery');

const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${resendApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: fromEmail,
    to: [targetEmail],
    subject: 'Compra aprovada! Defina sua senha para acessar a FlixPrev',
    html: buildHtml(actionLink),
  }),
});

const payload = await response.text();
if (!response.ok) {
  throw new Error(`Erro ao enviar email pelo Resend: ${payload || response.status}`);
}

console.log(payload || 'Email enviado com sucesso');
