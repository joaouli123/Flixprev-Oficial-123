import { useState, useMemo, useEffect, useCallback } from "react";
import { Outlet, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import MobileSidebar from "@/components/layout/MobileSidebar";
import CreateCategoryDialog from "@/components/CreateCategoryDialog";
import EditCategoryDialog from "@/components/EditCategoryDialog"; // Reintroduzido

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
import { cn } from "@/lib/utils";
import { makeAgentRouteKey, toSlug } from "@/lib/slug";
import { dedupeAgentsByPresentation, normalizeAgentTitle, shouldHideAgentFromCatalog } from "@/lib/agentText";

function isVisibleAgent(agent: Agent) {
  return !shouldHideAgentFromCatalog(agent.title, agent.description, agent.role);
}

const AppLayout = () => {
  const { session, isAdmin, profile } = useSession();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const isChatRoute = location.pathname.includes('/app/chat') || location.pathname.includes('/app/agente');

  const [categories, setCategories] = useState<Category[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isCreateCategoryDialogOpen, setIsCreateCategoryDialogOpen] = useState(false);
  const [isEditCategoryDialogOpen, setIsEditCategoryDialogOpen] = useState(false); // Reintroduzido
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null); // Reintroduzido
  const [isDeleteCategoryDialogOpen, setIsDeleteCategoryDialogOpen] = useState(false); // Reintroduzido
  const [categoryToDeleteId, setCategoryToDeleteId] = useState<string | null>(null); // Reintroduzido

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

  const normalizeAgentRecord = useCallback((agent: any) => ({
    ...agent,
    category_ids: (Array.isArray(agent.category_ids) ? agent.category_ids : []).map((id: any) => String(id)),
    extra_links: Array.isArray(agent.extra_links) ? agent.extra_links : [],
    shortcuts: Array.isArray(agent.shortcuts) ? agent.shortcuts : [],
    attachments: Array.isArray(agent.attachments) ? agent.attachments : [],
  }) as Agent, []);

  const extractMissingColumnFromSchemaCacheError = useCallback((error: any) => {
    const message = String(error?.message || "");
    const match = message.match(/Could not find the '([^']+)' column/i);
    return match?.[1] || null;
  }, []);

  const insertAgentWithSchemaFallback = useCallback(async (payload: Record<string, unknown>) => {
    const nextPayload = { ...payload };
    const omittedColumns: string[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await neon.from("agents").insert(nextPayload).select();
      if (!result.error) {
        return { ...result, omittedColumns };
      }

      const missingColumn = extractMissingColumnFromSchemaCacheError(result.error);
      if (!missingColumn || !(missingColumn in nextPayload)) {
        return { ...result, omittedColumns };
      }

      delete nextPayload[missingColumn];
      omittedColumns.push(missingColumn);
    }

    return {
      data: null,
      error: { message: "Falha ao inserir agente após múltiplas tentativas de compatibilidade." },
      omittedColumns,
    };
  }, [extractMissingColumnFromSchemaCacheError]);

  const updateAgentWithSchemaFallback = useCallback(async (agentId: string, payload: Record<string, unknown>) => {
    const nextPayload = { ...payload };
    const omittedColumns: string[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await neon.from("agents").update(nextPayload).eq("id", agentId).select();
      if (!result.error) {
        return { ...result, omittedColumns };
      }

      const missingColumn = extractMissingColumnFromSchemaCacheError(result.error);
      if (!missingColumn || !(missingColumn in nextPayload)) {
        return { ...result, omittedColumns };
      }

      delete nextPayload[missingColumn];
      omittedColumns.push(missingColumn);
    }

    return {
      data: null,
      error: { message: "Falha ao atualizar agente após múltiplas tentativas de compatibilidade." },
      omittedColumns,
    };
  }, [extractMissingColumnFromSchemaCacheError]);

  const syncAgentKnowledgeLinks = useCallback(async (agentId: string, links?: { label: string; url: string }[]) => {
    const response = await fetch(`/api/agents/${agentId}/sync-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: Array.isArray(links) ? links : [] }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || "Falha ao sincronizar links do agente.");
    }

    return payload as {
      success: boolean;
      attachments: string[];
      extra_links: { label: string; url: string }[];
      failures?: Array<{ url: string; error: string }>;
    };
  }, []);

  const fetchCategories = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await neon
      .from("categories")
      .select()
      .or(`user_id.is.null,user_id.eq.${userId}`);
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
    const { data, error } = await neon
      .from("agents")
      .select()
      .or(`user_id.is.null,user_id.eq.${userId}`);
    if (error) {
      toast.error("Erro ao carregar agentes: " + error.message);
      setAgents([]);
    } else {
      const agents = (data || []).map((agent: any) => ({
        ...agent,
        category_ids: (Array.isArray(agent.category_ids) ? agent.category_ids : []).map((id: any) => String(id)),
        extra_links: Array.isArray(agent.extra_links) ? agent.extra_links : [],
        shortcuts: Array.isArray(agent.shortcuts) ? agent.shortcuts : [],
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

  useEffect(() => {
    const slugFromPath = location.pathname.startsWith('/app/categorias/') ? (categorySlug || null) : null;
    const slugFromQuery = searchParams.get('categoria');
    const requestedSlug = slugFromQuery || slugFromPath;
    const isAgentsListingRoute = location.pathname === '/app' || location.pathname.startsWith('/app/categorias/');

    if (!requestedSlug) {
      if (!isAgentsListingRoute && selectedCategory !== 'all') {
        setSelectedCategory('all');
      }
      return;
    }

    const matchedCategory = categories.find((cat) => toSlug(cat.name) === requestedSlug);
    if (!matchedCategory) {
      if (selectedCategory !== 'all') {
        setSelectedCategory('all');
      }
      return;
    }

    if (selectedCategory !== matchedCategory.id) {
      setSelectedCategory(matchedCategory.id);
    }

    if (slugFromPath && location.pathname !== '/app') {
      navigate(`/app?categoria=${encodeURIComponent(requestedSlug)}`, { replace: true });
    }
  }, [categories, categorySlug, location.pathname, navigate, searchParams, selectedCategory]);

  const handleAddCategory = async (name: string) => {
    if (!userId) {
      toast.error("Você precisa estar logado para criar categorias.");
      return null;
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
          return data[0] as Category;
        } else {
          console.error("Nenhum dado retornado ao criar categoria");
          toast.error("Erro: Nenhum dado retornado do servidor");
        }
      }
    } catch (err) {
      console.error("Erro inesperado ao criar categoria:", err);
      toast.error("Erro inesperado ao criar categoria");
    }

    return null;
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
    newAgentData: Omit<Agent, "id" | "userId" | "created_at">,
    options?: { onProgress?: (progress: { stage: string; detail?: string }) => void }
  ) => {
    if (!userId) {
      toast.error("Você precisa estar logado para adicionar agentes.");
      return false;
    }

    try {
      console.log("Tentando criar agente:", newAgentData.title, "com categorias:", newAgentData.category_ids);
      options?.onProgress?.({
        stage: "Salvando estrutura principal do agente...",
        detail: "Criando o registro base antes de processar anexos e URLs.",
      });
      
      // Generate a UUID for the agent
      const agentId = crypto.randomUUID();
      const insertPayload: Record<string, unknown> = {
        id: agentId,
        title: newAgentData.title,
        role: newAgentData.role,
        description: newAgentData.description,
        icon: newAgentData.icon,
        background_icon: newAgentData.background_icon,
        category_ids: newAgentData.category_ids || [],
        link: newAgentData.link || null,
        user_id: userId,
        shortcuts: (newAgentData as any).shortcuts || [],
        instructions: (newAgentData as any).instructions || null,
        attachments: (newAgentData as any).attachments || [],
      };

      if (Array.isArray(newAgentData.extra_links) && newAgentData.extra_links.length > 0) {
        insertPayload.extra_links = newAgentData.extra_links;
      }
      
      // Salvar arrays como arrays nativas do PostgreSQL
      const { data, error, omittedColumns } = await insertAgentWithSchemaFallback(insertPayload);

      if (error) {
        console.error("Erro do banco de dados ao criar agente:", error);
        toast.error("Erro ao adicionar agente: " + (error.message || "Erro na query"));
        return false;
      } else {
        if (data && data.length > 0) {
          if (omittedColumns.length > 0) {
            toast.warning(`Agente salvo com compatibilidade temporária. Colunas ausentes no banco: ${omittedColumns.join(", ")}.`);
          }

          let normalizedAgent = normalizeAgentRecord(data[0]);

          try {
            if (normalizedAgent.extra_links.length > 0) {
              options?.onProgress?.({
                stage: "Lendo e processando o conteúdo das URLs...",
                detail: `Baixando ${normalizedAgent.extra_links.length} fonte(s) externa(s), extraindo texto e indexando a base do agente.`,
              });

              const syncResult = await syncAgentKnowledgeLinks(normalizedAgent.id, normalizedAgent.extra_links);
              normalizedAgent = {
                ...normalizedAgent,
                attachments: Array.isArray(syncResult.attachments) ? syncResult.attachments : normalizedAgent.attachments,
                extra_links: Array.isArray(syncResult.extra_links) ? syncResult.extra_links : normalizedAgent.extra_links,
              };

              if (syncResult.failures && syncResult.failures.length > 0) {
                toast.warning(`Alguns links do agente não puderam ser processados (${syncResult.failures.length}).`);
              }
            }
          } catch (syncError: any) {
            console.error("Erro ao sincronizar links do agente:", syncError);
            toast.error(syncError?.message || "Falha ao sincronizar links para a IA.");
          }

          setAgents((prev) => [...prev, normalizedAgent]);
          toast.success(`Agente '${newAgentData.title}' adicionado com sucesso!`);

          if (normalizedAgent.extra_links.length === 0) {
            options?.onProgress?.({
              stage: "Indexando anexos do agente...",
              detail: "Gerando chunks e embeddings dos arquivos já enviados para treinar a IA.",
            });
            await fetch(`/api/admin/reprocess-agent-attachments/${normalizedAgent.id}`, { method: 'POST' }).catch(console.error);
          }
          
          // Emit new notification
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: "Novo Agente Disponível! 🚀",
              message: `O assistente "${newAgentData.title}" acabou de ser implementado na plataforma.`
            })
          }).catch(console.error);

          return true;
        } else {
          console.error("Nenhum dado retornado ao criar agente");
          toast.error("Erro: Nenhum dado retornado do servidor");
          return false;
        }
      }
    } catch (err) {
      console.error("Erro inesperado ao criar agente:", err);
      toast.error("Erro inesperado ao criar agente");
      return false;
    }
  };

  const handleStartAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (agent?.link) {
      window.open(agent.link, "_blank");
    } else if (agent) {
      navigate(`/app/agente/${makeAgentRouteKey(agent.title, agent.id)}`);
    }
  };

  const handleOpenEditAgentDialog = (agent: Agent) => {
    setAgentToEdit(agent);
    setIsCreateNewAIAgentDialogOpen(true);
  };

  const handleEditAgent = async (
    agentId: string,
    updatedAgentData: Omit<Agent, "id" | "userId" | "created_at">,
    options?: { onProgress?: (progress: { stage: string; detail?: string }) => void }
  ) => {
    if (!userId) {
      toast.error("Você precisa estar logado para editar agentes.");
      return false;
    }
    const updatePayload: Record<string, unknown> = {
      title: updatedAgentData.title,
      role: updatedAgentData.role,
      description: updatedAgentData.description,
      icon: updatedAgentData.icon,
      background_icon: updatedAgentData.background_icon,
      category_ids: updatedAgentData.category_ids || [],
      link: updatedAgentData.link || null,
      shortcuts: updatedAgentData.shortcuts || [],
      instructions: updatedAgentData.instructions || null,
      attachments: updatedAgentData.attachments || [],
    };

    if (Array.isArray(updatedAgentData.extra_links) && updatedAgentData.extra_links.length > 0) {
      updatePayload.extra_links = updatedAgentData.extra_links;
    }

    options?.onProgress?.({
      stage: "Salvando alterações do agente...",
      detail: "Atualizando os dados principais antes de reprocessar o conhecimento.",
    });

    const { data, error, omittedColumns } = await updateAgentWithSchemaFallback(agentId, updatePayload);

    if (error) {
      console.error("Erro ao editar agente:", error);
      toast.error("Erro ao editar agente: " + error.message);
      return false;
    } else {
      if (data && data.length > 0) {
        if (omittedColumns.length > 0) {
          toast.warning(`Agente atualizado com compatibilidade temporária. Colunas ausentes no banco: ${omittedColumns.join(", ")}.`);
        }

        let normalizedAgent = normalizeAgentRecord(data[0]);

        try {
          if (normalizedAgent.extra_links.length > 0) {
            options?.onProgress?.({
              stage: "Relendo e processando as URLs do agente...",
              detail: `Atualizando ${normalizedAgent.extra_links.length} fonte(s) externas e reindexando o treinamento.`,
            });

            const syncResult = await syncAgentKnowledgeLinks(agentId, normalizedAgent.extra_links);
            normalizedAgent = {
              ...normalizedAgent,
              attachments: Array.isArray(syncResult.attachments) ? syncResult.attachments : normalizedAgent.attachments,
              extra_links: Array.isArray(syncResult.extra_links) ? syncResult.extra_links : normalizedAgent.extra_links,
            };

            if (syncResult.failures && syncResult.failures.length > 0) {
              toast.warning(`Alguns links do agente não puderam ser processados (${syncResult.failures.length}).`);
            }
          }
        } catch (syncError: any) {
          console.error("Erro ao sincronizar links do agente:", syncError);
          toast.error(syncError?.message || "Falha ao sincronizar links para a IA.");
        }

        setAgents((prev) =>
          prev.map((agent) => agent.id === agentId ? normalizedAgent : agent)
        );
        toast.success(`Agente '${updatedAgentData.title}' atualizado com sucesso!`);

        if (normalizedAgent.extra_links.length === 0) {
          options?.onProgress?.({
            stage: "Reindexando anexos do agente...",
            detail: "Atualizando chunks e embeddings dos anexos já existentes.",
          });
          await fetch(`/api/admin/reprocess-agent-attachments/${agentId}`, { method: 'POST' }).catch(console.error);
        }
        
        // Emit new notification
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: "Agente Atualizado! 🔄",
            message: `O assistente "${updatedAgentData.title}" recebeu novas atualizações de melhoria na plataforma.`
          })
        }).catch(console.error);

        return true;
      }
    }

    return false;
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
    setSearchTerm("");

    if (categoryId === 'all') {
      if (location.pathname !== '/app' || searchParams.get('categoria')) {
        navigate('/app', { replace: true });
      }
      return;
    }

    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      navigate('/app', { replace: true });
      return;
    }

    const nextSlug = toSlug(category.name);
    const currentSlug = searchParams.get('categoria');
    const isLegacyCategoryRoute = location.pathname.startsWith('/app/categorias/');

    if (location.pathname !== '/app' || currentSlug !== nextSlug || isLegacyCategoryRoute) {
      navigate(`/app?categoria=${encodeURIComponent(nextSlug)}`, { replace: true });
    }
  };

  const handleHowToUse = () => {
    navigate("/app/how-to-use");
  };

  const handleGoHome = () => {
    setSelectedCategory("all");
    navigate("/app", { replace: true });
  };

  // Esta lista inclui "Todos" e é usada para o dropdown da Sidebar
  const categoriesForSidebar = useMemo(
    () => [{ id: "all", name: "Todos", userId: "", created_at: "" }, ...categories],
    [categories]
  );

  const visibleAgents = useMemo(
    () => dedupeAgentsByPresentation(agents.filter((agent) => isVisibleAgent(agent))),
    [agents]
  );

  const filteredAgents = useMemo(() => {
    let currentAgents = visibleAgents;
    if (selectedCategory !== "all") {
      // Usar comparação flexível (==) para IDs de categoria que podem ser string ou number
      currentAgents = currentAgents.filter((agent) =>
        agent.category_ids.some(id => String(id) === String(selectedCategory))
      );
    }
    if (searchTerm.trim()) {
      const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
      currentAgents = currentAgents.filter(
        (agent) =>
          normalizeAgentTitle(agent.title, agent.description, agent.role).toLowerCase().includes(lowerCaseSearchTerm) ||
          String(agent.role || "").toLowerCase().includes(lowerCaseSearchTerm) ||
          String(agent.description || "").toLowerCase().includes(lowerCaseSearchTerm)
      );
    }
    return currentAgents;
  }, [visibleAgents, selectedCategory, searchTerm]);

  const outletContextValue = useMemo(
    () => ({
      filteredAgents,
      onStartAgent: handleStartAgent,
      onDeleteAgent: confirmDeleteAgent,
      onEditAgent: handleOpenEditAgentDialog,
      categories: categories, // Passar as categorias reais (sem "Todos") para o AgentsView
      agents: visibleAgents,
      searchTerm,
      onSearchChange: setSearchTerm,
      selectedCategory,
      onSelectCategory: handleSelectCategory,
    }),
    [filteredAgents, categories, visibleAgents, searchTerm, selectedCategory]
  );

  if (loading && userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Carregando dados...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-50/50 overflow-hidden">
      {/* MobileSidebar - apenas em mobile */}
      {isMobile && (
        <MobileSidebar
          categories={categoriesForSidebar}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          onAddCategory={() => setIsCreateCategoryDialogOpen(true)}
          onAddAgent={() => setIsCreateNewAIAgentDialogOpen(true)}
          onHowToUse={handleHowToUse}
          onEditCategory={handleOpenEditCategoryDialog}
          onDeleteCategory={confirmDeleteCategory}
          onGoHome={handleGoHome}
          isOpen={isMobileSidebarOpen}
          onOpenChange={setIsMobileSidebarOpen}
          customLinks={customLinks}
          onAddCustomLink={() => setIsCreateCustomLinkDialogOpen(true)}
          onEditCustomLink={handleOpenEditCustomLinkDialog}
          onDeleteCustomLink={confirmDeleteCustomLink}
        />
      )}

      {/* Sidebar Desktop */}
      {!isMobile && (
        <div className={cn(
          "transition-all duration-300 ease-in-out z-50 border-r border-slate-200/60 bg-white/80 backdrop-blur-xl relative",
          isSidebarCollapsed ? "w-20" : "w-72"
        )}>
          <Sidebar
            categories={categoriesForSidebar}
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
            onAddCategory={() => setIsCreateCategoryDialogOpen(true)}
            onAddAgent={() => setIsCreateNewAIAgentDialogOpen(true)}
            onHowToUse={handleHowToUse}
            onEditCategory={handleOpenEditCategoryDialog}
            onDeleteCategory={confirmDeleteCategory}
            onGoHome={handleGoHome}
            isCollapsed={isSidebarCollapsed}
            customLinks={customLinks}
            onAddCustomLink={() => setIsCreateCustomLinkDialogOpen(true)}
            onEditCustomLink={handleOpenEditCustomLinkDialog}
            onDeleteCustomLink={confirmDeleteCustomLink}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isSidebarCollapsed={isSidebarCollapsed}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          isMobile={isMobile}
          profile={profile}
        />
        
        <main className={cn(
          "flex-1 flex flex-col",
          isChatRoute ? "overflow-hidden" : "overflow-y-auto",
          !isChatRoute && "p-4 md:p-6 lg:p-8"
        )}>
          <div className={cn(
            "mx-auto w-full flex-1 flex flex-col min-h-0",
            isChatRoute && "overflow-hidden",
            !isChatRoute && "max-w-7xl"
          )}>
            <Outlet context={outletContextValue} />
          </div>
        </main>
      </div>

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



      <CreateNewAIAgentDialog
        isOpen={isCreateNewAIAgentDialogOpen}
        onClose={() => {
          setIsCreateNewAIAgentDialogOpen(false);
          setAgentToEdit(null);
        }}
        onSave={handleAddAgent}
        onEditSave={handleEditAgent}
        onCreateCategory={handleAddCategory}
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
