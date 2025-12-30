import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, ChevronLeft, Sparkles, Zap, FileText, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Agent } from "@/types/app";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TypingIndicator } from "@/components/TypingIndicator";
import { FormattedMessage } from "@/components/FormattedMessage";
import { ChatSidebar } from "@/components/ChatSidebar";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface OutletContext {
  agents: Agent[];
}

const ChatPage = () => {
  const { agentId, conversationId: urlConvId } = useParams<{ agentId: string; conversationId?: string }>();
  const navigate = useNavigate();
  const { agents } = useOutletContext<OutletContext>();
  const agent = agents.find((a) => a.id === agentId);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(urlConvId ? parseInt(urlConvId) : null);

  // Update conversationId when URL parameter changes
  useEffect(() => {
    if (urlConvId) {
      const parsedId = parseInt(urlConvId);
      if (parsedId !== conversationId) {
        console.log("[CHAT] URL conversationId changed:", parsedId);
        setConversationId(parsedId);
      }
    } else {
      setConversationId(null);
    }
  }, [urlConvId]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use agent shortcuts or default shortcuts
  const shortcuts = agent?.shortcuts || ["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"];

  // Initialize conversation on component mount
  useEffect(() => {
    const initConversation = async () => {
      setIsLoading(true);
      try {
        // Se já tem ID na URL, carregar mensagens dessa conversa
        if (conversationId) {
          console.log("[CHAT] Loading conversation:", conversationId);
          const res = await fetch(`/api/conversations/${conversationId}/messages`);
          if (res.ok) {
            const msgs = await res.json();
            const formattedMsgs = msgs.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
            setMessages(formattedMsgs);
          }
        } else {
          // Tentar encontrar a última conversa deste agente antes de criar uma nova
          console.log("[CHAT] Checking for existing conversations for agent:", agentId);
          const conversationsRes = await fetch(`/api/conversations?agentId=${agentId}`);
          if (conversationsRes.ok) {
            const conversations = await conversationsRes.json();
            if (conversations && conversations.length > 0) {
              const lastConv = conversations[0]; // Assumindo que o backend retorna ordenado por data descendente
              console.log("[CHAT] Found existing conversation, redirecting:", lastConv.id);
              setConversationId(lastConv.id);
              navigate(`/app/chat/${agentId}/${lastConv.id}`, { replace: true });
              return;
            }
          }

          // Criar nova conversa se não existir nenhuma
          console.log("[CHAT] No existing conversation found. Creating new one for agent:", agent?.title, "ID:", agentId);
          const response = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              title: `Chat with ${agent?.title || "Agent"}`,
              agentId: agentId
            }),
          });
          if (response.ok) {
            const conv = await response.json();
            console.log("[CHAT] Conversation created with ID:", conv.id);
            setConversationId(conv.id);
            // Manter mensagens vazias apenas para nova conversa
            // Atualizar a URL para incluir o ID da conversa sem recarregar
            navigate(`/app/chat/${agentId}/${conv.id}`, { replace: true });
          }
        }
      } catch (error) {
        console.error("[CHAT] Error:", error);
        // Não limpar mensagens em caso de erro
      } finally {
        setIsLoading(false);
      }
    };
    if (agent?.title) {
      initConversation();
    }
  }, [agent?.title, agentId, conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) {
      console.warn("[CHAT] Cannot send: input is empty");
      return;
    }
    
    if (!conversationId) {
      console.warn("[CHAT] Conversation not ready yet, waiting...");
      return;
    }

    const messageContent = input;
    const userMsg: Message = { role: "user", content: messageContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const convId = conversationId;
      console.log("[CHAT] Sending message to conversation:", convId, "agentId:", agentId);
      
      const response = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: messageContent, 
          agentId: agentId 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Servidor retornou erro ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Falha ao iniciar stream");

      // Initialize assistant message
      // setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (part.startsWith("data: ")) {
            const jsonStr = part.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const data = JSON.parse(jsonStr);
              if (data.content) {
                assistantContent += data.content;
              }
              if (data.done) break;
              if (data.error) throw new Error(data.error);
            } catch (e: any) {
              if (e.message.includes("AI Error")) throw e;
              console.warn("Parse error in stream chunk:", e);
            }
          }
        }
      }

      // Add full message at the end instead of streaming
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (error: any) {
      console.error("[CHAT] Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Erro: ${error.message || "Ocorreu um erro ao processar sua solicitação."}` }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex w-full h-full overflow-hidden bg-gray-50/30 dark:bg-slate-900/30 relative">
      <ChatSidebar agentId={agentId!} currentConversationId={conversationId} />
      <div className="flex flex-col flex-1 h-full overflow-hidden relative min-w-0 bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white dark:bg-slate-950 px-3 py-2 sm:px-4 sm:py-3 z-20">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/app")} 
              className="hover-elevate flex-shrink-0"
              data-testid="button-back-chat"
            >
              <ChevronLeft className="h-5 w-5 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base font-semibold truncate flex items-center gap-1 sm:gap-2">
                <Bot className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <span className="truncate">{agent?.title || "Chat"}</span>
              </h1>
              {agent?.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 whitespace-pre-wrap">
                  {agent.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <ScrollArea className="flex-1 w-full" ref={scrollRef}>
          <div className="px-3 py-4 sm:px-4 sm:py-6 w-full h-full">
            <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
              {/* Mensagem de Boas-vindas e Atalhos */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center text-center space-y-6 py-8 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="space-y-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                      Olá! Sou seu agente de IA em "{agent?.title}"
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400">
                      Estou aqui para ajudar. Em que posso te ajudar hoje?
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                    {shortcuts.map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        className="justify-start h-auto py-3 px-4 rounded-xl hover-elevate border-gray-200 dark:border-slate-800"
                        onClick={() => setInput(s)}
                        data-testid={`button-shortcut-welcome-${s.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Sparkles className="h-4 w-4 mr-2 text-blue-500 flex-shrink-0" />
                        <span className="text-sm truncate">{s}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={cn(
                    "flex gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                      <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
                    </div>
                  )}
                  <div className={cn(
                    "px-3 py-2 sm:px-4 sm:py-3 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] sm:max-w-[75%] break-words",
                    msg.role === "assistant" 
                      ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-tl-none" 
                      : "bg-blue-600 dark:bg-blue-700 text-white rounded-tr-none"
                  )}>
                    {msg.role === "assistant" ? (
                      <FormattedMessage content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                      <User className="h-3 w-3 sm:h-4 sm:w-4" />
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                    <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
                  </div>
                  <div className="px-3 py-2 sm:px-4 sm:py-3 rounded-2xl text-xs sm:text-sm leading-relaxed bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-tl-none">
                    <TypingIndicator />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-white dark:bg-slate-950 border-t dark:border-slate-800 px-3 py-2 sm:px-4 sm:py-3 z-20">
        <div className="w-full max-w-2xl mx-auto space-y-1">
          <div className="flex gap-2">
            <Input
              placeholder="Pergunte..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              data-testid="input-message"
            />
            <Button 
              onClick={handleSend} 
              disabled={isSending || !input.trim()}
              className="rounded-lg px-3 sm:px-4 flex-shrink-0"
              data-testid="button-send-message"
            >
              {isSending ? <span className="animate-spin">⚙️</span> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ChatPage;
