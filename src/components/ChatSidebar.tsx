import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2, ChevronDown } from "lucide-react";
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

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
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
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleNewChat = () => {
    navigate(`/chat/${agentId}`);
    setTimeout(loadConversations, 500);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation();
    if (confirm("Tem certeza que quer deletar esta conversa?")) {
      try {
        await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
        await loadConversations();
        if (currentConversationId === convId) {
          navigate(`/chat/${agentId}`);
        }
      } catch (error) {
        console.error("Erro ao deletar conversa:", error);
      }
    }
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
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${agentId}/${conv.id}`)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group hover-elevate",
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
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0"
                  data-testid={`button-delete-conversation-${conv.id}`}
                >
                  <Trash2 className="h-3 w-3 text-red-500" />
                </button>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
