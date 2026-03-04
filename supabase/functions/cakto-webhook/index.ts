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

  if (normalizedEvent === "purchase_approved" || normalizedEvent === "subscription_renewed") {
    return true;
  }

  return ["paid", "approved", "active", "authorized", "completed", "success", "premium"].includes(normalizedStatus);
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

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: activationRedirectTo,
      data: invitePayload,
    });

    if (!inviteError && invited?.user?.id) {
      userId = invited.user.id;
      activationEmailSent = true;
    }

    if (!userId) {
      userId = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
    }
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
    asString(safeGet(payload, ["customer", "metadata", "user_id"]));

  const email =
    asString(safeGet(payload, ["customer", "email"])) ??
    asString(safeGet(payload, ["buyer", "email"])) ??
    asString(safeGet(payload, ["data", "customer", "email"]));

  const documento =
    asString(safeGet(payload, ["customer", "document"])) ??
    asString(safeGet(payload, ["customer", "cpf"])) ??
    asString(safeGet(payload, ["customer", "docNumber"])) ??
    asString(safeGet(payload, ["buyer", "document"])) ??
    asString(safeGet(payload, ["buyer", "cpf"])) ??
    asString(safeGet(payload, ["subscription", "customer", "document"])) ??
    asString(safeGet(payload, ["subscription", "customer", "cpf"])) ??
    asString(safeGet(payload, ["subscription", "customer", "docNumber"])) ??
    asString(safeGet(payload, ["data", "customer", "docNumber"]));

  const customerName =
    asString(safeGet(payload, ["customer", "name"])) ??
    asString(safeGet(payload, ["buyer", "name"])) ??
    asString(safeGet(payload, ["subscription", "customer", "name"])) ??
    asString(safeGet(payload, ["data", "customer", "name"]));

  const customerPhone =
    asString(safeGet(payload, ["customer", "phone"])) ??
    asString(safeGet(payload, ["customer", "phone_number"])) ??
    asString(safeGet(payload, ["buyer", "phone"])) ??
    asString(safeGet(payload, ["buyer", "phone_number"])) ??
    asString(safeGet(payload, ["subscription", "customer", "phone"])) ??
    asString(safeGet(payload, ["subscription", "customer", "phone_number"])) ??
    asString(safeGet(payload, ["data", "customer", "phone"])) ??
    asString(safeGet(payload, ["data", "customer", "phone_number"]));

  const plan =
    asString(safeGet(payload, ["plan", "slug"])) ??
    asString(safeGet(payload, ["plan", "name"])) ??
    asString(safeGet(payload, ["subscription", "plan", "slug"])) ??
    asString(safeGet(payload, ["subscription", "plan", "name"]));

  const externalCustomerId =
    asString(safeGet(payload, ["customer", "id"])) ??
    asString(safeGet(payload, ["buyer", "id"])) ??
    asString(safeGet(payload, ["data", "customer", "id"]));

  const externalSubscriptionId =
    asString(safeGet(payload, ["subscription", "id"])) ??
    asString(safeGet(payload, ["data", "subscription", "id"])) ??
    asString(safeGet(payload, ["order", "id"]));

  const expiresAt =
    normalizeIsoDate(safeGet(payload, ["subscription", "expires_at"])) ??
    normalizeIsoDate(safeGet(payload, ["subscription", "next_charge_at"])) ??
    normalizeIsoDate(safeGet(payload, ["data", "subscription", "expires_at"])) ??
    normalizeIsoDate(safeGet(payload, ["data", "subscription", "next_charge_at"]));

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const activationRedirectTo = Deno.env.get("APP_RESET_PASSWORD_URL") ?? "https://flixprev.com.br/reset-password";

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
