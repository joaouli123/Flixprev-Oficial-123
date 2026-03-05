import React from "react";
import AgentCard from "@/components/AgentCard";
import { Agent, Category } from "@/types/app";
import { useOutletContext, useParams } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";

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

  return (
    <div className="animate-in fade-in duration-500 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bem vindo, {firstName}</h1>
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

      {!isCategoryPage ? (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category.id)}
                className="group flex h-full min-h-[148px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/10"
              >
                <div>
                  <h2 className="line-clamp-2 text-lg font-semibold text-slate-900 transition-colors group-hover:text-purple-700">
                    {category.name}
                  </h2>
                </div>
                <div className="mt-4 text-sm text-slate-500">
                  {(agentsCountByCategory.get(category.id) || 0)} especialista(s)
                </div>
              </button>
            ))
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
