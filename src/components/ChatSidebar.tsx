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
import { Plus, MessageSquare, Trash2, MoreVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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

  useEffect(() => {
    loadConversations();
    // Aumentar frequência de atualização do histórico
    const interval = setInterval(loadConversations, 3000);
    return () => clearInterval(interval);
  }, [agentId]);

  const handleNewChat = () => {
    navigate(`/app/chat/${agentId}`);
    setTimeout(loadConversations, 500);
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
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Falha ao salvar título");
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

  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-slate-700">
        <Button
          onClick={handleNewChat}
          className="w-full gap-2"
          data-testid="button-new-conversation"
        >
          <Plus className="h-4 w-4" />
          Nova Conversa
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 p-2">Carregando...</div>
          ) : conversations.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 p-2">Nenhuma conversa</div>
          ) : (
            conversations.map((conv) => (
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
                    onClick={() => navigate(`/app/chat/${agentId}/${conv.id}`)}
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
                      <span className="truncate text-xs">{conv.title}</span>
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
        </div>
      </ScrollArea>
    </div>
  );
};
