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
  TNU: "Turma Nacional de Uniformização",
  CRPS: "Conselho de Recursos da Previdência Social",
};

type AgentPresentationPreset = {
  badge: string | null;
  title: string;
  order: number;
  featured?: boolean;
  description?: string;
  match: string[];
};

export type AgentPresentation = {
  badge: string | null;
  title: string;
  description: string;
  order: number;
  featured: boolean;
};

const AGENT_PRESENTATION_PRESETS: AgentPresentationPreset[] = [
  { badge: "Dirtrab", title: "Direito Trabalhista Macro", order: 101, match: ["agente dirtrab", "dirtrab", "macro direito trabalhista"] },
  { badge: "Atostr", title: "Atos Institucionais Trabalhistas", order: 102, match: ["agente atostr", "atostr", "atos trabalhistas"] },
  { badge: "Nr.spro", title: "NR.s - Normas Regulamentadoras", order: 103, match: ["agente nr.spro", "nr.spro", "normas regulamentadoras"] },
  { badge: "Súmulascore", title: "Súmulas", order: 104, match: ["sumulascore", "sumulas core", "súmulas"] },
  { badge: "Precedentx", title: "Precedentes", order: 105, match: ["precedentx", "precedentex", "precedentes trabalhistas"] },
  { badge: "Jurisprud", title: "Jurisprudências", order: 106, match: ["jurisprud", "jurisprd", "jurisprudencia trabalhista"] },

  { badge: "CNIS", title: "Cadastro Nacional de Informações Sociais", order: 201, match: ["acnis", "cnis", "agente cnis"] },
  { badge: "ProcAdm.", title: "Processo Adm. Previdenciário", order: 202, featured: true, match: ["procadm", "processo administrativo previdenciario"] },
  { badge: "A.pré103", title: "Aposentadoria Pré EC103", order: 203, match: ["a.pre103", "a.pre 103", "apre103", "aposentadoria pre ec103"] },
  { badge: "Apiurb", title: "Aposentadoria por Idade Urbana", order: 204, match: ["apiurb", "aposentadoria idade urbana"] },
  { badge: "AIP", title: "Aposentadoria por Incapacidade Permanente", order: 205, match: ["aip", "aposentadoria incapacidade permanente"] },
  { badge: "PCD", title: "Aposentadoria da Pessoa com Deficiência", order: 206, match: ["apcd", "pcd", "aposentadoria pcd", "pessoa com deficiencia"] },
  { badge: "AEsp", title: "Aposentadoria Especial", order: 207, match: ["aesp", "aposentadoria especial"] },
  { badge: "ARur", title: "Aposentadoria Rural", order: 208, match: ["arur", "aposentadoria rural"] },
  { badge: "AIT", title: "Auxílio por Incapacidade Temporária", order: 209, match: ["ait", "incapacidade temporaria"] },
  { badge: "AA", title: "Auxílio-Acidente", order: 210, match: ["aa", "auxilio-acidente", "auxilio acidente"] },
  { badge: "25%", title: "25% na Incapacidade Permanente", order: 211, match: ["25aip", "25%", "acrescimo na aposentadoria por incapacidade"] },
  { badge: "AVJud", title: "Viabilidade Judicial - Aux. Doença", order: 212, match: ["avjud", "viabilidade judicial", "aux. doenca", "aux doenca"] },
  { badge: "PMor", title: "Pensão por Morte", order: 213, match: ["pmor", "pensao por morte"] },
  { badge: "Rec", title: "Auxílio-Reclusão", order: 214, match: ["rec", "auxilio-reclusao", "auxilio reclusao"] },
  { badge: "SMar", title: "Salário-Maternidade", order: 215, match: ["smar", "salario-maternidade", "salario maternidade"] },
  { badge: "SFam", title: "Salário-Família", order: 216, match: ["sfam", "salario-familia", "salario familia"] },
  { badge: "RTransiç", title: "Regras de Transição", order: 217, match: ["rtransic", "regras de transicao"] },
  { badge: "AMB", title: "Manutenção de Benefícios", order: 218, match: ["amb", "manutencao de beneficios"] },
  { badge: "CQS", title: "Carência & Qualidade de Segurado", order: 219, match: ["cqs", "carencia", "qualidade de segurado"] },
  { badge: "RMI", title: "Cálculo de RMI", order: 220, match: ["rmi", "calculo de rmi"] },
  { badge: "ASoc", title: "Assistência Social", order: 221, match: ["asoc", "assistencia social"] },
  { badge: "BPC", title: "Benefício de Prestação Continuada", order: 222, match: ["bpc", "beneficio de prestacao continuada"] },
  { badge: "CRPS", title: "Conselho de Recursos da Previdência Social", order: 223, match: ["crps", "conselho de recursos da previdencia social"] },
  { badge: "ReVB", title: "Revisão de Benefícios", order: 224, match: ["revb", "revisao de beneficios"] },
  { badge: "RPPS", title: "Regime Próprio de Previdência Social", order: 225, match: ["rpps", "regime proprio de previdencia social"] },
  { badge: "ACPIN", title: "Ações Civis Públicas INSS", order: 226, match: ["acpin", "acoes civis publicas inss"] },
  { badge: "SumFed", title: "Súmulas Federais", order: 227, match: ["sumfed", "sumulas federais"] },
  { badge: "RTNU", title: "Turma Nacional de Uniformização", order: 228, match: ["rtnu", "tnu", "turma nacional de uniformizacao"] },

  { badge: "DTrib", title: "Direito Tributário", order: 301, description: "Base de apoio para interpretação tributária, conceitos fiscais e estrutura normativa do sistema tributário.", match: ["dtrib", "direito tributario"] },
  { badge: "CTN Expert", title: "Agente de Interpretação Tributária", order: 302, description: "Ajuda a explicar conceitos como lançamento, tributos, obrigações acessórias, garantias e penalidades.", match: ["ctn expert", "interpretacao tributaria"] },
  { badge: "REFIS-IA", title: "Agente Reforma Tributária Atual", order: 303, description: "Monitora e interpreta as mudanças da Reforma Tributária, incluindo transição de tributos e impactos setoriais.", match: ["refis-ia", "reforma tributaria atual"] },
  { badge: "TAX-Rend", title: "Simulador inteligente de cálculos, deduções, retenções e alíquotas aplicáveis", order: 304, description: "Calcula tributos de renda de pessoa física e jurídica segundo a legislação vigente e mudanças recentes.", match: ["tax-rend", "simulador inteligente de calculos", "tributos de renda"] },
  { badge: "FedTax", title: "Guia de obrigações, prazos de pagamento e retenção na fonte", order: 305, description: "Agrupa e explica tributos federais administrados pela RFB, como IRRF, IOF, CSLL e Cofins.", match: ["fedtax", "tributos federais", "retencao na fonte"] },
];

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "no", "na", "por"]);

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HIDDEN_TITLE_TOKENS = new Set([
  "agentes",
  "file",
  "normas comuns para todos estes agentes",
  "os agentes abaixo serao alimentados com os links ao lado",
  "agentes da categoria direito previdenciario",
  "link 1 https",
]);

function hasGeneratedDescription(rawDescription?: string | null) {
  return /gerado a partir do pdf mestre de agentes/i.test(String(rawDescription || ""));
}

function isFileLikeTitle(rawTitle: string) {
  return /^\d{1,2}[a-z]{3}\d{4}-\d+\.(pdf|docx?)$/i.test(String(rawTitle || "")) || /\.(pdf|docx?)$/i.test(String(rawTitle || ""));
}

function isGenericRole(rawRole?: string | null) {
  const normalizedRole = normalizeText(String(rawRole || ""));
  return ["previdenciario", "trabalhista", "tributario", "stj", "prompt", "prompts ia"].includes(normalizedRole);
}

function isNoisyCatalogTitle(rawTitle: string) {
  const normalizedTitle = normalizeText(cleanRawTitle(rawTitle));
  return !normalizedTitle || HIDDEN_TITLE_TOKENS.has(normalizedTitle) || isFileLikeTitle(rawTitle);
}

function cleanRawTitle(rawTitle: string) {
  return String(rawTitle || "")
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
}

function findPresentationPreset(rawTitle: string, rawDescription?: string | null, rawRole?: string | null) {
  const base = ` ${normalizeText(`${rawTitle || ""} ${rawDescription || ""} ${rawRole || ""}`)} `;

  return AGENT_PRESENTATION_PRESETS.find((preset) =>
    preset.match.some((token) => base.includes(` ${normalizeText(token)} `) || base.includes(normalizeText(token)))
  );
}

function toProfessionalCase(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const upperToken = word.toUpperCase();
      if (ABBREVIATION_MAP[upperToken]) {
        return ABBREVIATION_MAP[upperToken];
      }

      const lower = word.toLowerCase();
      if (index > 0 && LOWER_WORDS.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultDescription() {
  return "Especialista jurídico com foco em produtividade, análise técnica e apoio estratégico.";
}

export function normalizeAgentDescription(rawDescription?: string | null, fallback?: string) {
  const source = String(rawDescription || "").trim();

  const normalized = source
    .replace(/\([^)]*gerad[oa][^)]*\)/gi, "")
    .replace(/^\s*(agente|assistente)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback || defaultDescription();
  }

  return toProfessionalCase(normalized);
}

export function getAgentPresentation(rawTitle: string, rawDescription?: string | null, rawRole?: string | null): AgentPresentation {
  const preset = findPresentationPreset(rawTitle, rawDescription, rawRole);

  if (preset) {
    return {
      badge: preset.badge,
      title: preset.title,
      description: normalizeAgentDescription(rawDescription, preset.description || `Especialista em ${preset.title}.`),
      order: preset.order,
      featured: Boolean(preset.featured),
    };
  }

  const cleanedTitle = cleanRawTitle(rawTitle);
  const looksLikeFileName = /^\d{1,2}[a-z]{3}\d{4}-\d+\.(pdf|docx?)$/i.test(rawTitle || "");
  const isNoisy = /(pdf|docx?|gerad[oa]\s+a\s+partir|mestre\s+de\s+agentes?)/i.test(rawTitle || "");
  const roleSource = !isGenericRole(rawRole) ? String(rawRole || "").trim() : "";
  const fallbackSource = String(rawDescription || roleSource || "Especialista Jurídico");
  const fallbackTitle = cleanedTitle && cleanedTitle.length >= 3
    ? toProfessionalCase(cleanedTitle)
    : toProfessionalCase(fallbackSource);

  return {
    badge: null,
    title: (!looksLikeFileName && !isNoisy ? fallbackTitle : toProfessionalCase(fallbackSource)).trim(),
    description: normalizeAgentDescription(rawDescription, "Especialista jurídico com foco em apoio técnico e produtividade."),
    order: 999,
    featured: false,
  };
}

export function getAgentDisplayOrder(rawTitle: string, rawDescription?: string | null, rawRole?: string | null) {
  return getAgentPresentation(rawTitle, rawDescription, rawRole).order;
}

export function getAgentBadge(rawTitle: string, rawDescription?: string | null, rawRole?: string | null) {
  return getAgentPresentation(rawTitle, rawDescription, rawRole).badge;
}

export function normalizeAgentTitle(rawTitle: string, rawDescription?: string | null, rawRole?: string | null) {
  return getAgentPresentation(rawTitle, rawDescription, rawRole).title;
}

export function shouldHideAgentFromCatalog(rawTitle: string, rawDescription?: string | null, rawRole?: string | null) {
  if (hasGeneratedDescription(rawDescription)) {
    return true;
  }

  if (isNoisyCatalogTitle(rawTitle) && isGenericRole(rawRole)) {
    return true;
  }

  return false;
}

export function dedupeAgentsByPresentation<T extends { id: string; title: string; description?: string | null; role?: string | null }>(agents: T[]) {
  const unique = new Map<string, T>();

  for (const agent of agents) {
    const presentation = getAgentPresentation(agent.title, agent.description, agent.role);
    const key = normalizeText(presentation.title);
    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, agent);
      continue;
    }

    const existingPresentation = getAgentPresentation(existing.title, existing.description, existing.role);
    const currentScore = (presentation.order !== 999 ? 10 : 0) + (hasGeneratedDescription(agent.description) ? -10 : 0) + (isNoisyCatalogTitle(agent.title) ? -5 : 0);
    const existingScore = (existingPresentation.order !== 999 ? 10 : 0) + (hasGeneratedDescription(existing.description) ? -10 : 0) + (isNoisyCatalogTitle(existing.title) ? -5 : 0);

    if (currentScore > existingScore) {
      unique.set(key, agent);
    }
  }

  return Array.from(unique.values());
}
