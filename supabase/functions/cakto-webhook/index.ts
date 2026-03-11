// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, handleCorsPreFlight } from "../_shared/cors.ts";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

type AnyRecord = Record<string, unknown>;

const textEncoder = new TextEncoder();

function safeGet(obj: AnyRecord | null | undefined, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as AnyRecord)[key];
  }
  return current;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(/\.(?=.*\.)/g, "").replace(",", ".").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeIsoDate(value: unknown): string | null {
  const candidate = asString(value);
  if (!candidate) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEmail(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: number | null | undefined): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Nao informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function buildWelcomeEmailHtml(params: {
  customerName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  documento: string | null;
  plan: string | null;
  amount: number;
  setPasswordUrl: string;
  appBaseUrl: string;
}) {
  const name = escapeHtml(params.customerName || "Cliente");
  const email = escapeHtml(params.customerEmail);
  const phone = escapeHtml(params.customerPhone || "Nao informado");
  const documento = escapeHtml(params.documento || "Nao informado");
  const plan = escapeHtml(params.plan || "Plano FlixPrev");
  const amount = escapeHtml(formatCurrency(params.amount));
  const setPasswordUrl = escapeHtml(params.setPasswordUrl);
  const appBaseUrl = escapeHtml(params.appBaseUrl);

  return `
  <div style="margin:0;padding:0;background:#f6f8fc;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="background:linear-gradient(135deg,#434dce 0%,#6674ff 100%);padding:28px 24px;color:#ffffff;">
          <div style="font-size:28px;line-height:1.2;font-weight:700;">🎉 Compra confirmada na FlixPrev</div>
          <div style="margin-top:8px;font-size:15px;line-height:1.6;opacity:0.95;">✅ Seu pagamento foi aprovado. Agora falta apenas definir sua senha para liberar o acesso ao sistema.</div>
        </div>

        <div style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Olá, <strong>${name}</strong>! 👋</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">Seja bem-vindo(a) à <strong>FlixPrev</strong>. Sua conta já foi preparada com base na compra realizada. Para entrar no sistema, clique no botão abaixo e defina sua senha de acesso.</p>

          <div style="margin:24px 0;text-align:center;">
            <a href="${setPasswordUrl}" style="display:inline-block;background:#434dce;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:12px;">🔐 Definir senha e acessar</a>
          </div>

          <div style="margin:0 0 20px;padding:18px;background:#f8faff;border:1px solid #dbe3ff;border-radius:14px;">
            <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px;">🧾 Dados da compra</div>
            <div style="font-size:14px;line-height:1.8;color:#334155;">
              <div><strong>Nome:</strong> ${name}</div>
              <div><strong>E-mail:</strong> ${email}</div>
              <div><strong>Telefone:</strong> ${phone}</div>
              <div><strong>Documento:</strong> ${documento}</div>
              <div><strong>Plano:</strong> ${plan}</div>
              <div><strong>Valor:</strong> ${amount}</div>
            </div>
          </div>

          <div style="margin:0 0 20px;padding:18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;font-size:14px;line-height:1.7;color:#9a3412;">
            ✨ Importante: sua conta foi criada, mas o acesso ao sistema só é liberado após a definição da senha.
          </div>

          <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#475569;">Depois de criar sua senha, acesse:</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;"><a href="${appBaseUrl}" style="color:#434dce;text-decoration:none;word-break:break-all;">${appBaseUrl}</a></p>

          <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">Se o botão não abrir, copie e cole este link no navegador:</p>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.7;word-break:break-all;"><a href="${setPasswordUrl}" style="color:#434dce;text-decoration:none;">${setPasswordUrl}</a></p>
        </div>
      </div>
    </div>
  </div>`;
}

async function sendWelcomeEmail(params: {
  resendApiKey: string | null;
  fromEmail: string;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  documento: string | null;
  plan: string | null;
  amount: number;
  setPasswordUrl: string;
  appBaseUrl: string;
}) {
  if (!params.resendApiKey) {
    throw new Error("Segredo RESEND_API_KEY não configurado");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: [params.customerEmail],
      subject: "🎉 Compra aprovada! Defina sua senha para acessar a FlixPrev",
      html: buildWelcomeEmailHtml({
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        documento: params.documento,
        plan: params.plan,
        amount: params.amount,
        setPasswordUrl: params.setPasswordUrl,
        appBaseUrl: params.appBaseUrl,
      }),
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Erro ao enviar email pelo Resend: ${payload || response.status}`);
  }

  return response.json().catch(() => null);
}

function splitName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeEventType(value: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function deriveStatus(payload: AnyRecord, eventType: string): string {
  const normalizedEvent = normalizeEventType(eventType);

  const subscriptionStatus =
    asString(safeGet(payload, ["subscription", "status"])) ??
    asString(safeGet(payload, ["data", "subscription", "status"]));

  const nestedStatus =
    asString(safeGet(payload, ["data", "status"])) ??
    asString(safeGet(payload, ["order", "status"]));

  const topLevelStatus = asString(safeGet(payload, ["status"]));

  if (normalizedEvent.startsWith("subscription_")) {
    const byEvent = {
      subscription_canceled: "canceled",
      subscription_cancelled: "canceled",
      subscription_renewed: "active",
    } as Record<string, string>;

    return (
      subscriptionStatus ??
      nestedStatus ??
      topLevelStatus ??
      byEvent[normalizedEvent] ??
      "inactive"
    );
  }

  const byEvent = {
    purchase_approved: "paid",
    purchase_refused: "refused",
    refund: "refunded",
    refunded: "refunded",
    chargeback: "chargeback",
    checkout_abandonment: "abandoned",
    boleto_gerado: "waiting_payment",
    pix_gerado: "waiting_payment",
    picpay_gerado: "waiting_payment",
  } as Record<string, string>;

  return (
    topLevelStatus ??
    nestedStatus ??
    subscriptionStatus ??
    byEvent[normalizedEvent] ??
    "inactive"
  );
}

function shouldProvisionUser(eventType: string, status: string): boolean {
  const normalizedEvent = (eventType || "").trim().toLowerCase();
  const normalizedStatus = (status || "").trim().toLowerCase();

  if (
    normalizedEvent === "checkout_abandonment" ||
    normalizedEvent === "purchase_refused" ||
    normalizedEvent === "subscription_canceled" ||
    normalizedEvent === "subscription_cancelled" ||
    normalizedEvent === "refund" ||
    normalizedEvent === "refunded" ||
    normalizedEvent === "chargeback" ||
    normalizedEvent === "boleto_gerado" ||
    normalizedEvent === "pix_gerado" ||
    normalizedEvent === "picpay_gerado"
  ) {
    return false;
  }

  // Regra de negócio: criar conta apenas na primeira compra aprovada.
  if (normalizedEvent === "subscription_renewed") {
    return false;
  }

  if (normalizedEvent === "purchase_approved") {
    return true;
  }

  return !normalizedEvent.startsWith("subscription_") && ["paid", "approved", "authorized", "completed", "success"].includes(normalizedStatus);
}

function normalizeReferralCode(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function extractReferralCode(payload: AnyRecord): string | null {
  const candidates = [
    asString(safeGet(payload, ["ref"])),
    asString(safeGet(payload, ["referral_code"])),
    asString(safeGet(payload, ["metadata", "ref"])),
    asString(safeGet(payload, ["metadata", "referral_code"])),
    asString(safeGet(payload, ["metadata", "codigo_indicacao"])),
    asString(safeGet(payload, ["customer", "metadata", "ref"])),
    asString(safeGet(payload, ["customer", "metadata", "referral_code"])),
    asString(safeGet(payload, ["order", "ref"])),
    asString(safeGet(payload, ["order", "referral_code"])),
    asString(safeGet(payload, ["tracking", "ref"])),
    asString(safeGet(payload, ["tracking", "utm_content"])),
    asString(safeGet(payload, ["utm_content"])),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReferralCode(candidate);
    if (normalized) return normalized;
  }

  return null;
}

function extractPurchaseAmount(payload: AnyRecord): number {
  const amountCandidates = [
    asNumber(safeGet(payload, ["amount"])),
    asNumber(safeGet(payload, ["order", "amount"])),
    asNumber(safeGet(payload, ["order", "total"])),
    asNumber(safeGet(payload, ["data", "amount"])),
    asNumber(safeGet(payload, ["subscription", "price"])),
  ];

  const firstValid = amountCandidates.find((n) => typeof n === "number" && Number.isFinite(n));
  if (!firstValid || firstValid <= 0) return 0;

  // gateways normalmente enviam centavos em inteiros altos
  if (firstValid > 10000) {
    return Number((firstValid / 100).toFixed(2));
  }

  return Number(firstValid.toFixed(2));
}

async function findAuthUserByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(`Erro ao listar usuários: ${error.message}`);
    }

    const users = data?.users ?? [];
    const found = users.find((candidate: { email?: string; id?: string }) => normalizeEmail(candidate.email ?? null) === normalizeEmail(email));
    if (found?.id) {
      return found.id;
    }

    if (users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function ensureProvisionedUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  fullName: string | null,
  documento: string | null,
  phone: string | null,
  activationRedirectTo: string,
  resendApiKey: string | null,
  resendFromEmail: string,
  plan: string | null,
  amount: number,
  appBaseUrl: string,
): Promise<{ userId: string | null; activationEmailSent: boolean }> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { userId: null, activationEmailSent: false };
  }

  const { firstName, lastName } = splitName(fullName);

  let userId = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
  let activationEmailSent = false;

  if (!userId) {
    const invitePayload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      documento,
      source: "cakto-webhook",
    };

    const { data: inviteLinkData, error: inviteLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: normalizedEmail,
      options: {
        redirectTo: activationRedirectTo,
        data: invitePayload,
      },
    });

    if (inviteLinkError) {
      throw new Error(`Erro ao gerar link de ativação: ${inviteLinkError.message}`);
    }

    userId = inviteLinkData?.user?.id ?? await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    const actionLink = asString((inviteLinkData as unknown as AnyRecord | null)?.properties?.action_link) ??
      asString((inviteLinkData as unknown as AnyRecord | null)?.action_link);

    if (!actionLink) {
      throw new Error("Link de ativação não retornado pelo Supabase");
    }

    await sendWelcomeEmail({
      resendApiKey,
      fromEmail: resendFromEmail,
      customerEmail: normalizedEmail,
      customerName: fullName,
      customerPhone: phone,
      documento,
      plan,
      amount,
      setPasswordUrl: actionLink,
      appBaseUrl,
    });

    activationEmailSent = true;
  }

  if (!userId) {
    return { userId: null, activationEmailSent };
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        role: "user",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (profileError) {
    throw new Error(`Erro ao garantir profile: ${profileError.message}`);
  }

  const { error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .upsert(
      {
        user_id: userId,
        email: normalizedEmail,
        nome_completo: fullName,
        documento,
        telefone: phone,
        status_da_assinatura: "inativo",
      },
      { onConflict: "user_id" },
    );

  if (usuariosError) {
    throw new Error(`Erro ao garantir usuarios: ${usuariosError.message}`);
  }

  return { userId, activationEmailSent };
}

async function isSignatureValid(rawBody: string, signatureHeader: string | null, secret: string | null): Promise<boolean> {
  if (!secret || secret.trim().length === 0) {
    return true;
  }

  const provided = signatureHeader?.trim();
  if (!provided) {
    try {
      const parsed = JSON.parse(rawBody) as AnyRecord;
      const payloadSecret = asString(safeGet(parsed, ["secret"]));
      return payloadSecret === secret;
    } catch {
      return false;
    }
  }

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, textEncoder.encode(rawBody));
  const signatureBytes = Array.from(new Uint8Array(signatureBuffer));
  const expectedHex = signatureBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  const expectedBase64 = btoa(String.fromCharCode(...signatureBytes));

  const normalized = provided.startsWith("sha256=") ? provided.slice(7) : provided;
  return normalized === expectedHex || normalized === expectedBase64;
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return handleCorsPreFlight(req);
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const webhookSecret = Deno.env.get("CAKTO_WEBHOOK_SECRET") ?? null;
  const signature = req.headers.get("x-cakto-signature") ?? req.headers.get("cakto-signature");

  const validSignature = await isSignatureValid(rawBody, signature, webhookSecret);
  if (!validSignature) {
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: AnyRecord;
  try {
    payload = JSON.parse(rawBody) as AnyRecord;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventId =
    asString(safeGet(payload, ["event_id"])) ??
    asString(safeGet(payload, ["id"])) ??
    asString(safeGet(payload, ["data", "id"])) ??
    crypto.randomUUID();

  const eventType =
    asString(safeGet(payload, ["event"])) ??
    asString(safeGet(payload, ["type"])) ??
    asString(safeGet(payload, ["event_type"])) ??
    "unknown";

  const status = deriveStatus(payload, eventType);

  const userId =
    asString(safeGet(payload, ["metadata", "user_id"])) ??
    asString(safeGet(payload, ["customer", "metadata", "user_id"])) ??
    asString(safeGet(payload, ["buyer", "metadata", "user_id"])) ??
    asString(safeGet(payload, ["data", "metadata", "user_id"]));

  const email =
    asString(safeGet(payload, ["customer", "email"])) ??
    asString(safeGet(payload, ["buyer", "email"])) ??
    asString(safeGet(payload, ["data", "customer", "email"])) ??
    asString(safeGet(payload, ["data", "buyer", "email"])) ??
    asString(safeGet(payload, ["contact", "email"]));

  const documento =
    asString(safeGet(payload, ["customer", "document"])) ??
    asString(safeGet(payload, ["customer", "cpf"])) ??
    asString(safeGet(payload, ["customer", "docNumber"])) ??
    asString(safeGet(payload, ["buyer", "document"])) ??
    asString(safeGet(payload, ["buyer", "cpf"])) ??
    asString(safeGet(payload, ["buyer", "docNumber"])) ??
    asString(safeGet(payload, ["subscription", "customer", "document"])) ??
    asString(safeGet(payload, ["subscription", "customer", "cpf"])) ??
    asString(safeGet(payload, ["subscription", "customer", "docNumber"])) ??
    asString(safeGet(payload, ["data", "customer", "docNumber"])) ??
    asString(safeGet(payload, ["data", "customer", "document"])) ??
    asString(safeGet(payload, ["data", "customer", "cpf"])) ??
    asString(safeGet(payload, ["data", "buyer", "document"])) ??
    asString(safeGet(payload, ["data", "buyer", "cpf"]));

  const customerName =
    asString(safeGet(payload, ["customer", "name"])) ??
    asString(safeGet(payload, ["customer", "full_name"])) ??
    asString(safeGet(payload, ["buyer", "name"])) ??
    asString(safeGet(payload, ["buyer", "full_name"])) ??
    asString(safeGet(payload, ["subscription", "customer", "name"])) ??
    asString(safeGet(payload, ["subscription", "customer", "full_name"])) ??
    asString(safeGet(payload, ["data", "customer", "name"])) ??
    asString(safeGet(payload, ["data", "customer", "full_name"])) ??
    asString(safeGet(payload, ["data", "buyer", "name"])) ??
    asString(safeGet(payload, ["data", "buyer", "full_name"]));

  const customerPhone =
    asString(safeGet(payload, ["customer", "phone"])) ??
    asString(safeGet(payload, ["customer", "phone_number"])) ??
    asString(safeGet(payload, ["customer", "mobile_phone"])) ??
    asString(safeGet(payload, ["buyer", "phone"])) ??
    asString(safeGet(payload, ["buyer", "phone_number"])) ??
    asString(safeGet(payload, ["buyer", "mobile_phone"])) ??
    asString(safeGet(payload, ["subscription", "customer", "phone"])) ??
    asString(safeGet(payload, ["subscription", "customer", "phone_number"])) ??
    asString(safeGet(payload, ["subscription", "customer", "mobile_phone"])) ??
    asString(safeGet(payload, ["data", "customer", "phone"])) ??
    asString(safeGet(payload, ["data", "customer", "phone_number"])) ??
    asString(safeGet(payload, ["data", "customer", "mobile_phone"])) ??
    asString(safeGet(payload, ["data", "buyer", "phone"])) ??
    asString(safeGet(payload, ["data", "buyer", "phone_number"])) ??
    asString(safeGet(payload, ["contact", "phone"]));

  const plan =
    asString(safeGet(payload, ["plan", "slug"])) ??
    asString(safeGet(payload, ["plan", "name"])) ??
    asString(safeGet(payload, ["subscription", "plan", "slug"])) ??
    asString(safeGet(payload, ["subscription", "plan", "name"])) ??
    asString(safeGet(payload, ["data", "subscription", "plan", "slug"])) ??
    asString(safeGet(payload, ["data", "subscription", "plan", "name"])) ??
    asString(safeGet(payload, ["offer", "slug"])) ??
    asString(safeGet(payload, ["offer", "name"]));

  const externalCustomerId =
    asString(safeGet(payload, ["customer", "id"])) ??
    asString(safeGet(payload, ["buyer", "id"])) ??
    asString(safeGet(payload, ["data", "customer", "id"])) ??
    asString(safeGet(payload, ["data", "buyer", "id"])) ??
    asString(safeGet(payload, ["customer", "customer_id"])) ??
    asString(safeGet(payload, ["buyer", "customer_id"]));

  const externalSubscriptionId =
    asString(safeGet(payload, ["subscription", "id"])) ??
    asString(safeGet(payload, ["data", "subscription", "id"])) ??
    asString(safeGet(payload, ["order", "id"])) ??
    asString(safeGet(payload, ["data", "order", "id"])) ??
    asString(safeGet(payload, ["subscription", "subscription_id"]));

  const expiresAt =
    normalizeIsoDate(safeGet(payload, ["subscription", "expires_at"])) ??
    normalizeIsoDate(safeGet(payload, ["subscription", "next_charge_at"])) ??
    normalizeIsoDate(safeGet(payload, ["data", "subscription", "expires_at"])) ??
    normalizeIsoDate(safeGet(payload, ["data", "subscription", "next_charge_at"]));

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const activationRedirectTo = Deno.env.get("APP_RESET_PASSWORD_URL") ?? "https://flixprev.uxcodedev.com.br/reset-password";
  const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "https://flixprev.uxcodedev.com.br";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? null;
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "FlixPrev <onboarding@flixprev.uxcodedev.com.br>";
  const purchaseAmount = extractPurchaseAmount(payload);

  let { data, error } = await supabaseAdmin.rpc("upsert_subscription_from_cakto", {
    p_user_id: userId,
    p_email: email,
    p_documento: documento,
    p_nome_completo: customerName,
    p_telefone: customerPhone,
    p_status: status,
    p_plan: plan,
    p_expires_at: expiresAt,
    p_external_customer_id: externalCustomerId,
    p_external_subscription_id: externalSubscriptionId,
    p_event_id: eventId,
    p_payload: payload,
    p_event_type: eventType,
  });

  let onboarding: AnyRecord | null = null;

  if (!error && data?.ok === false && data?.error === "user_not_found" && email && shouldProvisionUser(eventType, status)) {
    try {
      const provisioned = await ensureProvisionedUser(
        supabaseAdmin,
        email,
        customerName,
        documento,
        customerPhone,
        activationRedirectTo,
        resendApiKey,
        resendFromEmail,
        plan,
        purchaseAmount,
        appBaseUrl,
      );

      if (provisioned.userId) {
        const retry = await supabaseAdmin.rpc("upsert_subscription_from_cakto", {
          p_user_id: provisioned.userId,
          p_email: email,
          p_documento: documento,
          p_nome_completo: customerName,
          p_telefone: customerPhone,
          p_status: status,
          p_plan: plan,
          p_expires_at: expiresAt,
          p_external_customer_id: externalCustomerId,
          p_external_subscription_id: externalSubscriptionId,
          p_event_id: eventId,
          p_payload: payload,
          p_event_type: eventType,
        });

        data = retry.data;
        error = retry.error;
        onboarding = {
          user_auto_created: true,
          activation_email_sent: provisioned.activationEmailSent,
          activation_redirect_to: activationRedirectTo,
        };
      }
    } catch (provisionError) {
      return new Response(JSON.stringify({
        error: provisionError instanceof Error ? provisionError.message : "Falha ao provisionar usuário",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const referralCode = extractReferralCode(payload);
  const processedUserId = asString((data as AnyRecord | null)?.user_id) ?? userId;
  const normalizedEmail = normalizeEmail(email);
  const normalizedEventType = normalizeEventType(eventType);
  const shouldApplyReferral = normalizedEventType === "purchase_approved" || normalizedEventType === "subscription_renewed";
  let referralResult: AnyRecord | null = null;

  if (referralCode && shouldApplyReferral) {
    const referralRpc = await supabaseAdmin.rpc("apply_referral_credit", {
      p_referral_code: referralCode,
      p_referred_user_id: processedUserId,
      p_referred_email: normalizedEmail,
      p_event_id: eventId,
      p_external_subscription_id: externalSubscriptionId,
      p_plan: plan,
      p_valor_compra: extractPurchaseAmount(payload),
      p_comissao_percent: 10,
      p_credit_units: 1,
      p_payload: payload,
      p_provider: "cakto",
    });

    if (!referralRpc.error) {
      referralResult = referralRpc.data as AnyRecord;
    }
  }

  return new Response(JSON.stringify({ success: true, result: data, onboarding, referral: referralResult }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
