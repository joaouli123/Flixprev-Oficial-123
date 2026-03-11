import React from "react";
import AgentCard from "@/components/AgentCard";
import { Agent, Category } from "@/types/app";
import { useOutletContext } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Shield, Scale, Coins, Landmark, Brain, ChevronRight, type LucideIcon } from "lucide-react";
import { getAgentDisplayOrder } from "@/lib/agentText";

/* ─── Tema de cores por categoria ─── */
const CATEGORY_COLORS: Record<string, { bg: string; bgLight: string; border: string; text: string; gradient: string; icon: LucideIcon }> = {
  "previdenciário": { bg: "bg-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700", gradient: "from-[#434dce] to-indigo-600", icon: Shield },
  "previdenciario": { bg: "bg-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700", gradient: "from-[#434dce] to-indigo-600", icon: Shield },
  "trabalhista": { bg: "bg-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700", gradient: "from-[#434dce] to-indigo-600", icon: Scale },
  "tributário": { bg: "bg-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700", gradient: "from-[#434dce] to-indigo-600", icon: Coins },
  "tributario": { bg: "bg-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700", gradient: "from-[#434dce] to-indigo-600", icon: Coins },
  "stj": { bg: "bg-indigo-700", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-800", gradient: "from-[#434dce] to-indigo-700", icon: Landmark },
};

function getCategoryTheme(name: string) {
  const key = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/direito\s*/i, "");
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bg: "bg-[#434dce]", bgLight: "bg-indigo-50", border: "border-indigo-100", text: "text-[#434dce]", gradient: "from-[#434dce] to-indigo-600", icon: Brain };
}

function isVisibleCategory(rawName: string) {
  const normalized = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Remove apenas a categoria técnica de prompts.
  if (normalized === "prompt" || normalized === "prompts ia") return false;

  return true;
}

function normalizeCategoryName(rawName: string) {
  return rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/direito\s*/gi, "")
    .trim();
}

function sortCategoriesWithPrevidenciarioFirst(categoryList: Category[]) {
  return [...categoryList].sort((a, b) => {
    const aName = normalizeCategoryName(a.name);
    const bName = normalizeCategoryName(b.name);
    const aIsPrevidenciario = aName.includes("previdenciario");
    const bIsPrevidenciario = bName.includes("previdenciario");

    if (aIsPrevidenciario && !bIsPrevidenciario) return -1;
    if (!aIsPrevidenciario && bIsPrevidenciario) return 1;

    return 0;
  });
}

interface OutletContextType {
  filteredAgents: Agent[];
  onStartAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onEditAgent: (agent: Agent) => void;
  categories: Category[];
  agents: Agent[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

const AgentsView: React.FC = () => {
  const {
    filteredAgents,
    onStartAgent,
    onDeleteAgent,
    onEditAgent,
    categories,
    agents,
    searchTerm,
    onSearchChange,
    selectedCategory,
    onSelectCategory,
  } = useOutletContext<OutletContextType>();
  const isCategoryPage = selectedCategory !== "all";
  
  const { profile } = useSession();
  const firstName = profile?.first_name || "Usuário";

  const visibleCategories = React.useMemo(() => {
    return sortCategoriesWithPrevidenciarioFirst(
      categories.filter((category) => isVisibleCategory(category.name))
    );
  }, [categories]);

  const filteredCategories = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return visibleCategories;
    return visibleCategories.filter((category) => category.name.toLowerCase().includes(term));
  }, [visibleCategories, searchTerm]);

  const agentsCountByCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      counts.set(category.id, 0);
    }
    for (const agent of agents) {
      const uniqueCategoryIds = [...new Set((agent.category_ids || []).map((categoryId) => String(categoryId)))];
      for (const categoryId of uniqueCategoryIds) {
        counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
      }
    }
    return counts;
  }, [agents, categories]);

  // Encontra a categoria atual quando estiver na página de categoria
  const currentCategory = React.useMemo(() => {
    if (!isCategoryPage) return null;
    return visibleCategories.find((category) => String(category.id) === String(selectedCategory)) || null;
  }, [visibleCategories, selectedCategory, isCategoryPage]);

  const responsiveCategoryTabs = React.useMemo(() => {
    return visibleCategories;
  }, [visibleCategories]);

  const displayedAgents = React.useMemo(() => {
    return [...filteredAgents].sort((a, b) => {
      const orderDiff = getAgentDisplayOrder(a.title, a.description, a.role) - getAgentDisplayOrder(b.title, b.description, b.role);
      if (orderDiff !== 0) return orderDiff;
      return a.title.localeCompare(b.title, "pt-BR");
    });
  }, [filteredAgents]);

  return (
    <div className="animate-in fade-in duration-500 flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Bem-vindo, {firstName}</h1>
        <p className="text-sm sm:text-base text-slate-500">
          {isCategoryPage
            ? "Selecione o especialista para iniciar o atendimento."
            : "Selecione a categoria para ver os especialistas disponíveis."}
        </p>
      </div>

      <div className="relative w-full max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder={isCategoryPage ? "Pesquisar especialistas..." : "Pesquisar categorias..."}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#434dce] focus:border-[#434dce] sm:text-sm transition-colors"
        />
      </div>

      {/* Atalhos rápidos para outras categorias (visível quando está dentro de uma categoria) */}
      {isCategoryPage && responsiveCategoryTabs.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {responsiveCategoryTabs.map((cat) => {
            const theme = getCategoryTheme(cat.name);
            const CatIcon = theme.icon;
            const count = agentsCountByCategory.get(cat.id) || 0;
            const isActiveCategory = currentCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${
                  isActiveCategory
                    ? "bg-[#434dce] border-[#434dce] text-white shadow-sm"
                    : `${theme.bgLight} ${theme.text} ${theme.border} hover:bg-white hover:shadow-sm`
                }`}
              >
                <CatIcon className={`w-3 h-3 ${isActiveCategory ? "text-white" : "text-[#434dce]"}`} />
                {cat.name}
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {!isCategoryPage ? (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => {
              const theme = getCategoryTheme(category.name);
              const CatIcon = theme.icon;
              const count = agentsCountByCategory.get(category.id) || 0;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className={`group flex h-full min-h-[160px] flex-col justify-between rounded-2xl border-2 ${theme.border} ${theme.bgLight} p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative overflow-hidden`}
                >
                  {/* Background icon decorativo */}
                  <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-[0.06] transition-transform duration-500 group-hover:scale-110">
                    <CatIcon className="h-32 w-32" />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#434dce] to-indigo-600 rounded-xl flex items-center justify-center mb-4 text-white shadow-sm shadow-indigo-500/25 transition-transform duration-300 group-hover:scale-110">
                      <CatIcon className="h-6 w-6" />
                    </div>
                    <h2 className={`line-clamp-2 text-lg font-bold ${theme.text} transition-colors`}>
                      {category.name}
                    </h2>
                  </div>
                  <div className="relative z-10 mt-3 flex items-center justify-between">
                    <span className="text-sm text-slate-500 font-medium">
                      {count} especialista{count !== 1 ? "s" : ""}
                    </span>
                    <ChevronRight className={`w-5 h-5 ${theme.text} opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0`} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center shadow-sm">
              <h3 className="mb-1 text-lg font-medium text-slate-900">Nenhuma categoria encontrada</h3>
              <p className="max-w-sm text-slate-600">Não encontramos categorias para essa busca.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start">
          {displayedAgents.length > 0 ? (
            displayedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onStartAgent={onStartAgent}
                onDeleteAgent={onDeleteAgent}
                onEditAgent={onEditAgent}
              />
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center shadow-sm">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-50">
                <svg className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="mb-1 text-lg font-medium text-slate-900">Nenhum especialista encontrado</h3>
              <p className="max-w-sm text-slate-600">
                Não encontramos especialistas correspondentes à sua busca nesta categoria.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default React.memo(AgentsView);
