const BRAZIL_REGION_BY_STATE: Record<string, string> = {
  AC: "Norte",
  AL: "Nordeste",
  AP: "Norte",
  AM: "Norte",
  BA: "Nordeste",
  CE: "Nordeste",
  DF: "Centro-Oeste",
  ES: "Sudeste",
  GO: "Centro-Oeste",
  MA: "Nordeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  MG: "Sudeste",
  PA: "Norte",
  PB: "Nordeste",
  PR: "Sul",
  PE: "Nordeste",
  PI: "Nordeste",
  RJ: "Sudeste",
  RN: "Nordeste",
  RS: "Sul",
  RO: "Norte",
  RR: "Norte",
  SC: "Sul",
  SP: "Sudeste",
  SE: "Nordeste",
  TO: "Norte",
};

export type CepLookupResult = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  regiao: string;
};

export function normalizeCep(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

export function formatCep(value: string) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function deriveRegionFromState(value: string | null | undefined) {
  const state = String(value || "").trim().toUpperCase();
  return BRAZIL_REGION_BY_STATE[state] || "";
}

export function calculateAgeFromBirthDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const birthDate = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function parsePracticeAreas(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatPracticeAreas(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : "";
}

export function splitFullName(value: string | null | undefined) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function lookupBrazilianCep(rawCep: string): Promise<CepLookupResult> {
  const cep = normalizeCep(rawCep);
  if (cep.length !== 8) {
    throw new Error("Informe um CEP com 8 dígitos.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok) {
    throw new Error("Não foi possível consultar o CEP.");
  }

  const payload = await response.json();
  if (payload?.erro) {
    throw new Error("CEP não encontrado.");
  }

  const estado = String(payload.uf || "").trim().toUpperCase();

  return {
    cep: formatCep(cep),
    logradouro: String(payload.logradouro || "").trim(),
    bairro: String(payload.bairro || "").trim(),
    cidade: String(payload.localidade || "").trim(),
    estado,
    regiao: deriveRegionFromState(estado),
  };
}