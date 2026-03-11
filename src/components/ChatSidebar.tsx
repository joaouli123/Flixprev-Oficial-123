import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MessageSquare, Trash2, MoreVertical, Pencil, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSession } from "@/components/SessionContextProvider";

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

interface ChatSidebarProps {
  agentId: string;
  agentRouteKey: string;
  agentTitle?: string;
  currentConversationId: number | null;
}

export const ChatSidebar = ({ agentId, agentRouteKey, agentTitle, currentConversationId }: ChatSidebarProps) => {
  const { session } = useSession();
  const userId = session?.user?.id || "";
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(isMobile ?? false);

  // Update collapse state when mobile state changes
  useEffect(() => {
    if (isMobile !== undefined) {
      setIsCollapsed(isMobile);
    }
  }, [isMobile]);

  const loadConversations = async () => {
    if (!userId) {
      setConversations([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetch(`/api/conversations?agentId=${agentId}`, {
        headers: { "x-user-id": userId }
      });
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const displayedConversations = showAll ? conversations : (Array.isArray(conversations) ? conversations.slice(0, 10) : []);

  useEffect(() => {
    if (!userId || !agentId) {
      setConversations([]);
      setIsLoading(false);
      return;
    }
    loadConversations();
  }, [agentId, userId]);

  const handleNewChat = () => {
    navigate(`/app/agente/${agentRouteKey}`);
    // Não fazer reload aqui - deixa o ChatPage carregar normalmente
  };

  const handleDeleteConversation = async (convId: number) => {
    if (confirm("Tem certeza que quer deletar esta conversa?")) {
      try {
        await fetch(`/api/conversations/${convId}`, { 
          method: "DELETE",
          headers: { "x-user-id": userId }
        });
        await loadConversations();
        if (currentConversationId === convId) {
          navigate(`/app/agente/${agentRouteKey}`);
        }
      } catch (error) {
        console.error("Erro ao deletar conversa:", error);
      }
    }
  };

  const handleEditStart = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleEditSave = async (convId: number) => {
    if (!editingTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      console.log(`[SIDEBAR] Saving new title for conversation ${convId}: ${editingTitle}`);
      const res = await fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ title: editingTitle }),
      });
      
      if (!res.ok) {
        // Log the status for debugging
        console.error(`[SIDEBAR] Server returned status ${res.status}`);
        let errorMsg = "Falha ao salvar título";
        const text = await res.text();
        try {
          const errorData = JSON.parse(text);
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          console.warn("[SIDEBAR] Could not parse error response as JSON:", text);
        }
        throw new Error(errorMsg);
      }
      
      const updatedConv = await res.json();
      console.log("[SIDEBAR] Conversation updated successfully:", updatedConv);
      
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: updatedConv.title } : c));
      setEditingId(null);
      // Forçar recarga para garantir sincronia
      loadConversations();
    } catch (error: any) {
      console.error("Erro ao editar conversa:", error);
      alert(`Erro ao renomear conversa: ${error.message}`);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleClearAll = async () => {
    if (confirm("Tem certeza que deseja apagar TODO o histórico de conversas? Esta ação não pode ser desfeita.")) {
      try {
        const res = await fetch("/api/conversations/clear-all", { 
          method: "POST",
          headers: { "x-user-id": userId }
        });
        if (res.ok) {
          setConversations([]);
          navigate(`/app/agente/${agentRouteKey}`);
        } else {
          alert("Falha ao limpar conversas");
        }
      } catch (error) {
        console.error("Erro ao limpar conversas:", error);
      }
    }
  };

  if (isCollapsed) {
    return (
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-40">
        <Button
          variant="default"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-8 w-8 rounded-r-full rounded-l-none bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
          data-testid="button-expand-sidebar"
          title="Expandir conversas"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      {isCollapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-40">
          <Button
            variant="default"
            size="icon"
            onClick={() => setIsCollapsed(false)}
            className="h-8 w-8 rounded-r-full rounded-l-none bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
            data-testid="button-expand-sidebar"
            title="Expandir conversas"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className={cn(
        "bg-white border-r border-gray-200 flex flex-col h-full z-30 transition-all duration-300 relative",
        isMobile ? "fixed left-0 top-0 bottom-0 w-72 shadow-2xl" : "w-72",
        isCollapsed ? "-translate-x-full absolute" : "translate-x-0"
      )}>
        {!isCollapsed && (
          <div className="absolute -right-4 top-1/2 -translate-y-1/2 z-40">
            <Button
              variant="default"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              className="h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              data-testid="button-collapse-sidebar"
              title="Recolher conversas"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center gap-3 bg-white">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-[#434dce]/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="h-4 w-4 text-[#434dce]" />
            </div>
            <span className="font-semibold text-slate-900 truncate text-[13px] leading-tight" title={agentTitle || "Histórico de Conversas"}>
              Histórico
            </span>
          </div>
          <Button
            onClick={handleNewChat}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-600 flex-shrink-0"
            data-testid="button-new-conversation"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-indigo-200 border-t-blue-600 animate-spin"></div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8 flex flex-col items-center gap-2">
              <MessageSquare className="h-8 w-8 opacity-20" />
              <p>Nenhuma conversa</p>
            </div>
          ) : (
            displayedConversations.map((conv) => (
              <div key={conv.id} className="group/item">
                {editingId === conv.id ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100 shadow-inner">
                    <MessageSquare className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                    <Input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditSave(conv.id);
                        if (e.key === "Escape") handleEditCancel();
                      }}
                      className="h-8 text-sm flex-1 bg-white border-none shadow-sm focus-visible:ring-1 focus-visible:ring-indigo-400"
                      data-testid={`input-edit-conversation-${conv.id}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 rounded-lg hover:bg-indigo-100 text-indigo-600"
                      onClick={() => handleEditSave(conv.id)}
                      data-testid={`button-save-conversation-${conv.id}`}
                    >
                      ✓
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      console.log(`[SIDEBAR] Navigating to conversation ${conv.id}`);
                      navigate(`/app/agente/${agentRouteKey}/${conv.id}`);
                    }}
                    className={cn(
                      "w-full min-w-0 text-left px-3 py-3 rounded-xl text-sm transition-all duration-200 flex items-center justify-between group cursor-pointer border border-transparent relative overflow-hidden",
                      currentConversationId === conv.id
                        ? "bg-indigo-50/50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                    data-testid={`button-conversation-${conv.id}`}
                  >
                    {currentConversationId === conv.id && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r-full" />
                    )}
                    <div className="flex flex-col flex-1 min-w-0 max-w-[190px] gap-0.5 pl-1 overflow-hidden">
                      <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[13px] leading-tight" title={conv.title}>
                        {conv.title}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(conv.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "opacity-100 transition-opacity ml-2 flex-shrink-0 p-1 rounded-md hover:bg-slate-200/50",
                            currentConversationId === conv.id && "hover:bg-indigo-200/50"
                          )}
                          data-testid={`button-conversation-menu-${conv.id}`}
                        >
                          <MoreVertical className={cn(
                            "h-4 w-4",
                            currentConversationId === conv.id ? "text-indigo-500" : "text-slate-400"
                          )} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-gray-100 w-40">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditStart(conv);
                          }}
                          className="rounded-lg cursor-pointer focus:bg-slate-50"
                          data-testid={`button-edit-conversation-${conv.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2 text-slate-500" />
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conv.id);
                          }}
                          className="text-red-600 focus:text-red-700 focus:bg-red-50 rounded-lg cursor-pointer mt-1"
                          data-testid={`button-delete-conversation-${conv.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))
          )}
          {conversations.length > 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs mt-4 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl h-9"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Mostrar menos" : `Ver mais ${conversations.length - 10} conversas`}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
    </>
  );
};
