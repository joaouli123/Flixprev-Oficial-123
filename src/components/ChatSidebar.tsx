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

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

interface ChatSidebarProps {
  agentId: string;
  currentConversationId: number | null;
}

export const ChatSidebar = ({ agentId, currentConversationId }: ChatSidebarProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(isMobile ?? false);

  const loadConversations = async () => {
    try {
      const res = await fetch(`/api/conversations?agentId=${agentId}`);
      const data = await res.json();
      setConversations(data || []);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const displayedConversations = showAll ? conversations : conversations.slice(0, 10);

  useEffect(() => {
    loadConversations();
  }, [agentId]);

  const handleNewChat = () => {
    navigate(`/app/chat/${agentId}`);
    // Não fazer reload aqui - deixa o ChatPage carregar normalmente
  };

  const handleDeleteConversation = async (convId: number) => {
    if (confirm("Tem certeza que quer deletar esta conversa?")) {
      try {
        await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
        await loadConversations();
        if (currentConversationId === convId) {
          navigate(`/app/chat/${agentId}`);
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
        headers: { "Content-Type": "application/json" },
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
        const res = await fetch("/api/conversations/clear-all", { method: "POST" });
        if (res.ok) {
          setConversations([]);
          navigate(`/app/chat/${agentId}`);
        } else {
          alert("Falha ao limpar conversas");
        }
      } catch (error) {
        console.error("Erro ao limpar conversas:", error);
      }
    }
  };

  if (isMobile && isCollapsed) {
    return (
      <div className="w-12 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col h-full items-center justify-between py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-10 w-10"
          data-testid="button-expand-sidebar"
          title="Expandir conversas"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col h-full",
      isMobile ? "fixed left-0 top-0 bottom-0 w-64 z-40 shadow-lg" : "w-64"
    )}>
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center gap-2">
        <Button
          onClick={handleNewChat}
          className={isMobile ? "flex-1" : "flex-1 gap-2"}
          data-testid="button-new-conversation"
        >
          {!isMobile && <Plus className="h-4 w-4" />}
          {isMobile ? <Plus className="h-4 w-4" /> : "Nova Conversa"}
        </Button>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            className="h-9 w-9"
            data-testid="button-collapse-sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {!isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-sidebar-more">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleClearAll}
                className="text-red-600 focus:text-red-600"
                data-testid="button-clear-all-conversations"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Histórico
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 p-2">Carregando...</div>
          ) : conversations.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 p-2">Nenhuma conversa</div>
          ) : (
            displayedConversations.map((conv) => (
              <div key={conv.id}>
                {editingId === conv.id ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 dark:bg-slate-800">
                    <MessageSquare className="h-4 w-4 flex-shrink-0 text-gray-500" />
                    <Input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditSave(conv.id);
                        if (e.key === "Escape") handleEditCancel();
                      }}
                      className="h-8 text-xs flex-1"
                      data-testid={`input-edit-conversation-${conv.id}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
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
                      navigate(`/app/chat/${agentId}/${conv.id}`);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group hover-elevate cursor-pointer",
                      currentConversationId === conv.id
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                    )}
                    data-testid={`button-conversation-${conv.id}`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MessageSquare className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate text-xs">
                        {conv.title.length > 20 ? `${conv.title.substring(0, 20)}...` : conv.title}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0"
                          data-testid={`button-conversation-menu-${conv.id}`}
                        >
                          <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditStart(conv);
                          }}
                          data-testid={`button-edit-conversation-${conv.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conv.id);
                          }}
                          className="text-red-600"
                          data-testid={`button-delete-conversation-${conv.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Deletar
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
              className="w-full text-xs mt-2"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Mostrar menos" : `Ver ${conversations.length - 10} mais`}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
