import { useState, useMemo, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import MobileSidebar from "@/components/layout/MobileSidebar";
import CreateCategoryDialog from "@/components/CreateCategoryDialog";
import EditCategoryDialog from "@/components/EditCategoryDialog"; // Reintroduzido
import CreateAgentDialog from "@/components/CreateAgentDialog";
import CreateNewAIAgentDialog from "@/components/CreateNewAIAgentDialog";
import CreateCustomLinkDialog from "@/components/CreateCustomLinkDialog"; // Importar novo diálogo
import EditCustomLinkDialog from "@/components/EditCustomLinkDialog"; // Importar novo diálogo
import { Category, Agent, CustomLink } from "@/types/app"; // Adicionar CustomLink
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { neon } from "@/lib/neon";
import { useSession } from "@/components/SessionContextProvider";
import { useIsMobile } from "@/hooks/use-mobile";

const AppLayout = () => {
  const { session, isAdmin, profile } = useSession();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [categories, setCategories] = useState<Category[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isCreateCategoryDialogOpen, setIsCreateCategoryDialogOpen] = useState(false);
  const [isEditCategoryDialogOpen, setIsEditCategoryDialogOpen] = useState(false); // Reintroduzido
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null); // Reintroduzido
  const [isDeleteCategoryDialogOpen, setIsDeleteCategoryDialogOpen] = useState(false); // Reintroduzido
  const [categoryToDeleteId, setCategoryToDeleteId] = useState<string | null>(null); // Reintroduzido
  const [isCreateAgentDialogOpen, setIsCreateAgentDialogOpen] = useState(false);
  const [isCreateNewAIAgentDialogOpen, setIsCreateNewAIAgentDialogOpen] = useState(false);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);
  const [isDeleteAgentDialogOpen, setIsDeleteAgentDialogOpen] = useState(false);
  const [agentToDeleteId, setAgentToDeleteId] = useState<string | null>(null);
  const [isCreateCustomLinkDialogOpen, setIsCreateCustomLinkDialogOpen] = useState(false);
  const [isEditCustomLinkDialogOpen, setIsEditCustomLinkDialogOpen] = useState(false);
  const [customLinkToEdit, setCustomLinkToEdit] = useState<CustomLink | null>(null);
  const [isDeleteCustomLinkDialogOpen, setIsDeleteCustomLinkDialogOpen] = useState(false);
  const [customLinkToDeleteId, setCustomLinkToDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const fetchCategories = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await neon.from("categories").select().eq("user_id", userId);
    if (error) {
      toast.error("Erro ao carregar categorias: " + error.message);
      setCategories([]);
    } else {
      setCategories((data || []) as Category[]);
    }
    setLoading(false);
  }, [userId]);

  const fetchAgents = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await neon.from("agents").select().eq("user_id", userId);
    if (error) {
      toast.error("Erro ao carregar agentes: " + error.message);
      setAgents([]);
    } else {
      const agents = (data || []).map((agent: any) => ({
        ...agent,
        category_ids: (Array.isArray(agent.category_ids) ? agent.category_ids : []).map((id: any) => String(id)),
        attachments: Array.isArray(agent.attachments) ? agent.attachments : [],
      })) as Agent[];
      setAgents(agents);
    }
    setLoading(false);
  }, [userId]);

  const fetchCustomLinks = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await neon
      .from("custom_links")
      .select()
      .eq("user_id", userId)
      .order("display_order", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar links personalizados: " + error.message);
      setCustomLinks([]);
    } else {
      setCustomLinks((data || []) as CustomLink[]);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchCategories();
      fetchAgents();
      fetchCustomLinks();
    }
  }, [userId, fetchCategories, fetchAgents, fetchCustomLinks]);

  const handleAddCategory = async (name: string) => {
    if (!userId) {
      toast.error("Você precisa estar logado para criar categorias.");
      return;
    }
    
    try {
      console.log("Tentando criar categoria:", name, "para o usuário:", userId);
      const { data, error } = await neon
        .from("categories")
        .insert({ name, user_id: userId })
        .select();

      if (error) {
        console.error("Erro do banco de dados ao criar categoria:", error);
        // Tratamento específico para colunas faltantes ou erros de schema
        const errorMsg = error.message || "Erro na query";
        toast.error("Erro ao criar categoria: " + errorMsg);
      } else {
        if (data && data.length > 0) {
          setCategories((prev) => [...prev, data[0] as Category]);
          toast.success(`Categoria '${name}' criada com sucesso!`);
        } else {
          console.error("Nenhum dado retornado ao criar categoria");
          toast.error("Erro: Nenhum dado retornado do servidor");
        }
      }
    } catch (err) {
      console.error("Erro inesperado ao criar categoria:", err);
      toast.error("Erro inesperado ao criar categoria");
    }
  };

  const handleOpenEditCategoryDialog = (category: Category) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem editar categorias.");
      return;
    }
    setCategoryToEdit(category);
    setIsEditCategoryDialogOpen(true);
  };

  const handleEditCategory = async (categoryId: string, newName: string) => {
    if (!userId) {
      toast.error("Você precisa estar logado para editar categorias.");
      return;
    }
    const { data, error } = await neon
      .from("categories")
      .update({ name: newName })
      .eq("id", categoryId)
      .select();

    if (error) {
      toast.error("Erro ao editar categoria: " + error.message);
    } else {
      if (data && data.length > 0) {
        setCategories((prev) =>
          prev.map((cat) => (cat.id === categoryId ? (data[0] as Category) : cat))
        );
      }
      toast.success(`Categoria atualizada para '${newName}' com sucesso!`);
    }
  };

  const confirmDeleteCategory = (categoryId: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem remover categorias.");
      return;
    }
    setCategoryToDeleteId(categoryId);
    setIsDeleteCategoryDialogOpen(true);
  };

  const handleDeleteCategory = async () => {
    if (!userId || !categoryToDeleteId) {
      toast.error("Você precisa estar logado para remover categorias.");
      return;
    }
    
    // Verificar se existem agentes associados a esta categoria
    const agentsInThisCategory = agents.filter((agent) =>
      agent.category_ids.includes(categoryToDeleteId)
    );
    
    if (agentsInThisCategory.length > 0) {
      toast.error("Não é possível remover a categoria. Existem agentes associados a ela.");
      setIsDeleteCategoryDialogOpen(false);
      setCategoryToDeleteId(null);
      return;
    }
    
    const { error } = await neon
      .from("categories")
      .delete()
      .eq("id", categoryToDeleteId);
      
    if (error) {
      toast.error("Erro ao remover categoria: " + error.message);
    } else {
      setCategories((prev) => prev.filter((cat) => cat.id !== categoryToDeleteId));
      if (selectedCategory === categoryToDeleteId) {
        setSelectedCategory("all");
      }
      toast.success("Categoria removida com sucesso!");
    }
    setIsDeleteCategoryDialogOpen(false);
    setCategoryToDeleteId(null);
  };

  const handleAddAgent = async (
    newAgentData: Omit<Agent, "id" | "userId" | "created_at">
  ) => {
    if (!userId) {
      toast.error("Você precisa estar logado para adicionar agentes.");
      return;
    }

    try {
      console.log("Tentando criar agente:", newAgentData.title, "com categorias:", newAgentData.category_ids);
      
      // Generate a UUID for the agent
      const agentId = crypto.randomUUID();
      
      // Salvar arrays como arrays nativas do PostgreSQL
      const { data, error } = await neon
        .from("agents")
        .insert({ 
          id: agentId,
          title: newAgentData.title,
          description: newAgentData.description,
          icon: newAgentData.icon,
          category_ids: newAgentData.category_ids || [],
          user_id: userId,
          instructions: (newAgentData as any).instructions || null,
          attachments: (newAgentData as any).attachments || [],
        })
        .select();

      if (error) {
        console.error("Erro do banco de dados ao criar agente:", error);
        toast.error("Erro ao adicionar agente: " + (error.message || "Erro na query"));
      } else {
        if (data && data.length > 0) {
          const newAgent = data[0];
          setAgents((prev) => [...prev, {
            ...newAgent,
            category_ids: (Array.isArray(newAgent.category_ids) ? newAgent.category_ids : []).map((id: any) => String(id)),
            attachments: Array.isArray(newAgent.attachments) ? newAgent.attachments : [],
          } as Agent]);
          toast.success(`Agente '${newAgentData.title}' adicionado com sucesso!`);
        } else {
          console.error("Nenhum dado retornado ao criar agente");
          toast.error("Erro: Nenhum dado retornado do servidor");
        }
      }
    } catch (err) {
      console.error("Erro inesperado ao criar agente:", err);
      toast.error("Erro inesperado ao criar agente");
    }
  };

  const handleStartAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (agent?.link) {
      window.open(agent.link, "_blank");
    } else if (agent) {
      navigate(`/app/chat/${agentId}`);
    }
  };

  const handleOpenEditAgentDialog = (agent: Agent) => {
    setAgentToEdit(agent);
    setIsCreateNewAIAgentDialogOpen(true);
  };

  const handleEditAgent = async (
    agentId: string,
    updatedAgentData: Omit<Agent, "id" | "userId" | "created_at">
  ) => {
    if (!userId) {
      toast.error("Você precisa estar logado para editar agentes.");
      return;
    }
    const { data, error } = await neon
      .from("agents")
      .update({
        title: updatedAgentData.title,
        description: updatedAgentData.description,
        icon: updatedAgentData.icon,
        category_ids: updatedAgentData.category_ids || [],
        link: updatedAgentData.link || null,
        instructions: updatedAgentData.instructions || null,
        attachments: updatedAgentData.attachments || [],
      })
      .eq("id", agentId)
      .select();

    if (error) {
      console.error("Erro ao editar agente:", error);
      toast.error("Erro ao editar agente: " + error.message);
    } else {
      if (data && data.length > 0) {
        const updatedAgent = data[0];
        setAgents((prev) =>
          prev.map((agent) => agent.id === agentId ? {
            ...updatedAgent,
            category_ids: (Array.isArray(updatedAgent.category_ids) ? updatedAgent.category_ids : []).map((id: any) => String(id)),
            attachments: Array.isArray(updatedAgent.attachments) ? updatedAgent.attachments : [],
          } as Agent : agent)
        );
        toast.success(`Agente '${updatedAgentData.title}' atualizado com sucesso!`);
      }
    }
  };

  const confirmDeleteAgent = (agentId: string) => {
    setAgentToDeleteId(agentId);
    setIsDeleteAgentDialogOpen(true);
  };

  const handleDeleteAgent = async () => {
    if (agentToDeleteId) {
      try {
        // Deletar conversas associadas ao agente (cascade)
        await fetch(`/api/delete-agent-conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agentToDeleteId })
        });
      } catch (e) {
        console.warn("Erro ao deletar conversas do agente:", e);
      }
      
      const { error } = await neon
        .from("agents")
        .delete()
        .eq("id", agentToDeleteId);
      if (error) {
        toast.error("Erro ao remover agente: " + error.message);
      } else {
        setAgents((prev) => prev.filter((agent) => agent.id !== agentToDeleteId));
        toast.success("Agente removido com sucesso!");
      }
      setAgentToDeleteId(null);
      setIsDeleteAgentDialogOpen(false);
    }
  };

  const handleAddCustomLink = async (title: string, url: string, displayOrder: number) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem adicionar links personalizados.");
      return;
    }
    const { data, error } = await neon
      .from("custom_links")
      .insert({ 
        title, 
        url, 
        display_order: displayOrder, 
        user_id: userId // Vincula ao usuário atual
      })
      .select();
    if (error) {
      toast.error("Erro ao adicionar link: " + error.message);
    } else {
      if (data && data.length > 0) {
        setCustomLinks((prev) => [...prev, data[0] as CustomLink]);
      }
      toast.success(`Link '${title}' adicionado com sucesso!`);
    }
  };

  const handleOpenEditCustomLinkDialog = (link: CustomLink) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem editar links personalizados.");
      return;
    }
    setCustomLinkToEdit(link);
    setIsEditCustomLinkDialogOpen(true);
  };

  const handleEditCustomLink = async (linkId: string, title: string, url: string, displayOrder: number) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem editar links personalizados.");
      return;
    }
    const { data, error } = await neon
      .from("custom_links")
      .update({ title, url, display_order: displayOrder })
      .eq("id", linkId)
      .select();
    if (error) {
      toast.error("Erro ao editar link: " + error.message);
    } else {
      if (data && data.length > 0) {
        setCustomLinks((prev) =>
          prev.map((link) => (link.id === linkId ? (data[0] as CustomLink) : link))
        );
      }
      toast.success(`Link '${title}' atualizado com sucesso!`);
    }
  };

  const confirmDeleteCustomLink = (linkId: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem remover links personalizados.");
      return;
    }
    setCustomLinkToDeleteId(linkId);
    setIsDeleteCustomLinkDialogOpen(true);
  };

  const handleDeleteCustomLink = async () => {
    if (!isAdmin || !customLinkToDeleteId) {
      toast.error("Apenas administradores podem remover links personalizados.");
      return;
    }
    const { error } = await neon
      .from("custom_links")
      .delete()
      .eq("id", customLinkToDeleteId);
    if (error) {
      toast.error("Erro ao remover link: " + error.message);
    } else {
      setCustomLinks((prev) => prev.filter((link) => link.id !== customLinkToDeleteId));
      toast.success("Link removido com sucesso!");
    }
    setIsDeleteCustomLinkDialogOpen(false);
    setCustomLinkToDeleteId(null);
  };

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategory(categoryId);
    navigate("/app");
  };

  const handleHowToUse = () => {
    navigate("/app/how-to-use");
  };

  const handleGoHome = () => {
    setSelectedCategory("all");
    navigate("/app");
  };

  // Esta lista inclui "Todos" e é usada para o dropdown da Sidebar
  const categoriesForSidebar = useMemo(
    () => [{ id: "all", name: "Todos", userId: "", created_at: "" }, ...categories],
    [categories]
  );

  const filteredAgents = useMemo(() => {
    let currentAgents = agents;
    if (selectedCategory !== "all") {
      currentAgents = currentAgents.filter((agent) =>
        agent.category_ids.includes(selectedCategory)
      );
    }
    if (searchTerm.trim()) {
      const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
      currentAgents = currentAgents.filter(
        (agent) =>
          agent.title.toLowerCase().includes(lowerCaseSearchTerm) ||
          agent.description.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }
    return currentAgents;
  }, [agents, selectedCategory, searchTerm]);

  const outletContextValue = useMemo(
    () => ({
      filteredAgents,
      onStartAgent: handleStartAgent,
      onDeleteAgent: confirmDeleteAgent,
      onEditAgent: handleOpenEditAgentDialog,
      categories: categories, // Passar as categorias reais (sem "Todos") para o AgentsView
      agents,
      searchTerm,
      onSearchChange: setSearchTerm,
      selectedCategory,
      onSelectCategory: handleSelectCategory,
    }),
    [filteredAgents, categories, agents, searchTerm, selectedCategory]
  );

  if (loading && userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Carregando dados...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isSidebarCollapsed={isSidebarCollapsed}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        isMobile={isMobile}
        profile={profile}
      />

      {/* MobileSidebar - apenas em mobile */}
      {isMobile && (
        <MobileSidebar
        categories={categoriesForSidebar} // Usar categorias com "Todos" para o MobileSidebar
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        onAddCategory={() => setIsCreateCategoryDialogOpen(true)}
        onAddAgent={() => setIsCreateAgentDialogOpen(true)}
        onHowToUse={handleHowToUse}
        onEditCategory={handleOpenEditCategoryDialog} // Reintroduzido
        onDeleteCategory={confirmDeleteCategory} // Reintroduzido
        onGoHome={handleGoHome}
        isOpen={isMobileSidebarOpen}
        onOpenChange={setIsMobileSidebarOpen}
        customLinks={customLinks}
        onAddCustomLink={() => setIsCreateCustomLinkDialogOpen(true)}
        onEditCustomLink={handleOpenEditCustomLinkDialog}
        onDeleteCustomLink={confirmDeleteCustomLink}
      />
      )}
      
      {isMobile ? (
        <main className="flex-grow container mx-auto p-4 md:p-6">
          <Outlet context={outletContextValue} />
        </main>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="flex-grow w-full">
          <ResizablePanel
            defaultSize={15}
            minSize={4}
            maxSize={25}
            collapsible={true}
            onCollapse={() => setIsSidebarCollapsed(true)}
            onExpand={() => setIsSidebarCollapsed(false)}
            className="min-w-[60px]"
          >
            <Sidebar
              categories={categoriesForSidebar} // Usar categorias com "Todos" para o Sidebar
              selectedCategory={selectedCategory}
              onSelectCategory={handleSelectCategory}
              onAddCategory={() => setIsCreateCategoryDialogOpen(true)}
              onAddAgent={() => setIsCreateNewAIAgentDialogOpen(true)}
              onHowToUse={handleHowToUse}
              onEditCategory={handleOpenEditCategoryDialog} // Reintroduzido
              onDeleteCategory={confirmDeleteCategory} // Reintroduzido
              onGoHome={handleGoHome}
              isCollapsed={isSidebarCollapsed}
              customLinks={customLinks}
              onAddCustomLink={() => setIsCreateCustomLinkDialogOpen(true)}
              onEditCustomLink={handleOpenEditCustomLinkDialog}
              onDeleteCustomLink={confirmDeleteCustomLink}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={85}>
            <main className="flex-grow container mx-auto p-4 md:p-6">
              <Outlet context={outletContextValue} />
            </main>
          </ResizablePanel>
          </ResizablePanelGroup>
      )}

      <CreateCategoryDialog
        isOpen={isCreateCategoryDialogOpen}
        onClose={() => setIsCreateCategoryDialogOpen(false)}
        onSave={handleAddCategory}
      />

      <EditCategoryDialog
        isOpen={isEditCategoryDialogOpen}
        onClose={() => {
          setIsEditCategoryDialogOpen(false);
          setCategoryToEdit(null);
        }}
        onSave={handleEditCategory}
        categoryToEdit={categoryToEdit}
      />

      <CreateAgentDialog
        isOpen={isCreateAgentDialogOpen}
        onClose={() => setIsCreateAgentDialogOpen(false)}
        onSave={handleAddAgent}
        categories={categories}
      />

      <CreateNewAIAgentDialog
        isOpen={isCreateNewAIAgentDialogOpen}
        onClose={() => {
          setIsCreateNewAIAgentDialogOpen(false);
          setAgentToEdit(null);
        }}
        onSave={handleAddAgent}
        onEditSave={handleEditAgent}
        categories={categories}
        agentToEdit={agentToEdit}
      />

      <CreateCustomLinkDialog
        isOpen={isCreateCustomLinkDialogOpen}
        onClose={() => setIsCreateCustomLinkDialogOpen(false)}
        onSave={handleAddCustomLink}
      />

      <EditCustomLinkDialog
        isOpen={isEditCustomLinkDialogOpen}
        onClose={() => {
          setIsEditCustomLinkDialogOpen(false);
          setCustomLinkToEdit(null);
        }}
        onSave={handleEditCustomLink}
        linkToEdit={customLinkToEdit}
      />

      <AlertDialog open={isDeleteAgentDialogOpen} onOpenChange={setIsDeleteAgentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente o agente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAgent}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteCategoryDialogOpen} onOpenChange={setIsDeleteCategoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente a categoria.
              <br />
              **Atenção:** Você só pode remover categorias que não possuem agentes associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteCustomLinkDialogOpen} onOpenChange={setIsDeleteCustomLinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente o link personalizado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCustomLink}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AppLayout;