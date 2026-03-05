import React from "react";
import AgentCard from "@/components/AgentCard";
import { Agent, Category } from "@/types/app";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Shield, Scale, Coins, Cpu, Landmark, Brain, ChevronRight, type LucideIcon } from "lucide-react";

/* ─── Tema de cores por categoria ─── */
const CATEGORY_COLORS: Record<string, { bg: string; bgLight: string; border: string; text: string; gradient: string; icon: LucideIcon }> = {
  "previdenciário": { bg: "bg-blue-600", bgLight: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", gradient: "from-blue-500 to-indigo-600", icon: Shield },
  "previdenciario": { bg: "bg-blue-600", bgLight: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", gradient: "from-blue-500 to-indigo-600", icon: Shield },
  "trabalhista": { bg: "bg-emerald-600", bgLight: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", gradient: "from-emerald-500 to-green-600", icon: Scale },
  "tributário": { bg: "bg-amber-600", bgLight: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", gradient: "from-amber-500 to-orange-600", icon: Coins },
  "tributario": { bg: "bg-amber-600", bgLight: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", gradient: "from-amber-500 to-orange-600", icon: Coins },
  "prompts ia": { bg: "bg-purple-600", bgLight: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", gradient: "from-purple-500 to-violet-600", icon: Cpu },
  "stj": { bg: "bg-rose-600", bgLight: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", gradient: "from-rose-500 to-pink-600", icon: Landmark },
};

function getCategoryTheme(name: string) {
  const key = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/direito\s*/i, "");
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bg: "bg-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", gradient: "from-indigo-500 to-blue-600", icon: Brain };
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
    onSelectCategory,
  } = useOutletContext<OutletContextType>();
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const isCategoryPage = Boolean(categorySlug);
  
  const { profile } = useSession();
  const firstName = profile?.first_name || "Usuário";

  const filteredCategories = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  const agentsCountByCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      counts.set(category.id, 0);
    }
    for (const agent of agents) {
      for (const categoryId of agent.category_ids || []) {
        counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
      }
    }
    return counts;
  }, [agents, categories]);

  // Encontra a categoria atual quando estiver na página de categoria
  const currentCategory = React.useMemo(() => {
    if (!isCategoryPage || !categorySlug) return null;
    return categories.find((c) => {
      const slug = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
      return slug === categorySlug;
    });
  }, [categories, categorySlug, isCategoryPage]);

  // Outras categorias (para atalhos rápidos quando está dentro de uma categoria)
  const otherCategories = React.useMemo(() => {
    if (!currentCategory) return categories;
    return categories.filter((c) => c.id !== currentCategory.id);
  }, [categories, currentCategory]);

  return (
    <div className="animate-in fade-in duration-500 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bem-vindo, {firstName}</h1>
        <p className="text-slate-500">
          {isCategoryPage
            ? "Selecione o especialista para iniciar o atendimento."
            : "Selecione a categoria para ver os especialistas disponíveis."}
        </p>
      </div>

      <div className="relative max-w-md">
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
      {isCategoryPage && otherCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onSelectCategory("all")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all border border-slate-200"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
            Todas
          </button>
          {otherCategories.map((cat) => {
            const theme = getCategoryTheme(cat.name);
            const CatIcon = theme.icon;
            const count = agentsCountByCategory.get(cat.id) || 0;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.bgLight} ${theme.text} ${theme.border} border hover:shadow-sm transition-all`}
              >
                <CatIcon className="w-3 h-3" />
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
                    <div className={`w-12 h-12 ${theme.bg} rounded-xl flex items-center justify-center mb-4 text-white shadow-sm transition-transform duration-300 group-hover:scale-110`}>
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
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAgents.length > 0 ? (
            filteredAgents.map((agent) => (
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
