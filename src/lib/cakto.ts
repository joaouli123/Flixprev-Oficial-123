export const DEFAULT_CAKTO_PRODUCT_NAME = "Flix Prev I.A";
export const DEFAULT_CAKTO_PRICE_LABEL = "R$ 137/mês";
const DEFAULT_CAKTO_CHECKOUT_URL = "https://pay.cakto.com.br/kxwfr7m";
const LEGACY_CAKTO_CHECKOUT_URL = "https://pay.cakto.com.br/vhmancx";
const LEGACY_CAKTO_CHECKOUT_URL_2 = "https://pay.cakto.com.br/vhmancx_628125";

function getConfiguredCheckoutUrl() {
  const configuredUrl = String(import.meta.env.VITE_CAKTO_CHECKOUT_URL || "").trim();

  if (!configuredUrl) {
    return DEFAULT_CAKTO_CHECKOUT_URL;
  }

  const normalized = configuredUrl.replace(/\/+$/, "");
  if (normalized === LEGACY_CAKTO_CHECKOUT_URL || normalized === LEGACY_CAKTO_CHECKOUT_URL_2) {
    return DEFAULT_CAKTO_CHECKOUT_URL;
  }

  return configuredUrl;
}

export function normalizeReferralCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const cleaned = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function readReferralCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return normalizeReferralCode(
    params.get("ref") ||
      params.get("referral_code") ||
      params.get("codigo_indicacao") ||
      params.get("sck")
  );
}

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeReferralCode(localStorage.getItem("referral_code"));
}

export function buildCaktoCheckoutUrl(options?: { referralCode?: string | null }) {
  const url = new URL(getConfiguredCheckoutUrl());
  const referralCode = normalizeReferralCode(options?.referralCode);

  if (referralCode) {
    url.searchParams.set("ref", referralCode);
    url.searchParams.set("referral_code", referralCode);
    url.searchParams.set("codigo_indicacao", referralCode);
    url.searchParams.set("utm_content", referralCode);
    url.searchParams.set("sck", referralCode);
  }

  return url.toString();
}