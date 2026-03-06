const ABBREVIATION_MAP: Record<string, string> = {
  INSS: "Instituto Nacional do Seguro Social",
  CNIS: "Cadastro Nacional de Informações Sociais",
  STJ: "Superior Tribunal de Justiça",
  LGPD: "Lei Geral de Proteção de Dados",
  RGPS: "Regime Geral de Previdência Social",
  BPC: "Benefício de Prestação Continuada",
  LOAS: "Lei Orgânica da Assistência Social",
  TST: "Tribunal Superior do Trabalho",
  TRF: "Tribunal Regional Federal",
};

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "no", "na"]);

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferTitleFromContent(rawTitle: string, rawDescription?: string | null) {
  const base = normalizeText(`${rawTitle || ""} ${rawDescription || ""}`);

  if (/stj|jurisprud|sumula/.test(base)) {
    return "Pesquisa de Jurisprudência do Superior Tribunal de Justiça";
  }

  if (/tribut|imposto|fiscal|federais/.test(base)) {
    return "Consultoria em Direito Tributário";
  }

  if (/trabalh|clt|rescis|verbas|empreg/.test(base)) {
    return "Consultoria em Direito do Trabalho";
  }

  if (/previd|inss|benefic|aposent|bpc|loas|cnis|acnis/.test(base)) {
    return "Consultoria em Direito Previdenciário";
  }

  if (/prompt/.test(base)) {
    return "Biblioteca de Prompts Jurídicos";
  }

  return "Consultoria Jurídica Especializada";
}

function toProfessionalCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      const upperToken = word.toUpperCase();
      const mapped = ABBREVIATION_MAP[upperToken];
      if (mapped) return mapped;

      const lower = word.toLowerCase();
      if (index > 0 && LOWER_WORDS.has(lower)) return lower;

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function normalizeAgentTitle(rawTitle: string, rawDescription?: string | null) {
  const source = String(rawTitle || "").trim();
  const description = String(rawDescription || "").trim();

  let normalized = source
    .replace(/\bacnis\b/gi, "CNIS")
    .replace(/\bamb\b/gi, "Manutenção de Benefícios")
    .replace(/\([^)]*gerad[oa][^)]*\)/gi, "")
    .replace(/\b(gerad[oa]\s+a\s+partir\s+do\s+pdf\s+mestre\s+de\s+agentes?)\b/gi, "")
    .replace(/\b[a-z0-9_-]+\.(pdf|docx?)\b/gi, "")
    .replace(/\b(agente|assistente)\b/gi, " ")
    .replace(/^[A-Z]{2,8}\s*[-–]\s*/g, "")
    .replace(/[–—_]/g, "-")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized.replace(/\b([A-Z]{2,8})\b/g, (match) => {
    return ABBREVIATION_MAP[match] ? ABBREVIATION_MAP[match] : match;
  });

  const looksLikeFileName = /^\d{1,2}[a-z]{3}\d{4}-\d+\.(pdf|docx?)$/i.test(source);
  const isNoisy = /(pdf|docx?|gerad[oa]\s+a\s+partir|mestre\s+de\s+agentes?)/i.test(source);

  if (looksLikeFileName || !normalized || normalized.length < 6 || isNoisy) {
    return inferTitleFromContent(source, description);
  }

  return toProfessionalCase(normalized);
}

export function normalizeAgentDescription(rawDescription?: string | null) {
  const source = String(rawDescription || "").trim();

  const normalized = source
    .replace(/\([^)]*gerad[oa][^)]*\)/gi, "")
    .replace(/^\s*(agente|assistente)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Especialista jurídico com foco em produtividade, análise técnica e apoio estratégico.";
  }

  return toProfessionalCase(normalized);
}
