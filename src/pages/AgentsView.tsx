import React from "react";
import AgentCard from "@/components/AgentCard";
import { Agent, Category } from "@/types/app";
import { useOutletContext } from "react-router-dom";
import TopCategoryBar from "@/components/TopCategoryBar"; // Restaurado

interface OutletContextType {
  filteredAgents: Agent[];
  onStartAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onEditAgent: (agent: Agent) => void;
  categories: Category[]; // Agora esta lista não incluirá "Todos" para o TopCategoryBar
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
    selectedCategory,
    onSelectCategory,
  } = useOutletContext<OutletContextType>();

  return (
    <div className="flex flex-col gap-4">
      <TopCategoryBar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={onSelectCategory}
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
          <p className="col-span-full text-center text-muted-foreground py-8">
            Nenhum agente encontrado.
          </p>
        )}
      </section>
    </div>
  );
};

export default React.memo(AgentsView);
