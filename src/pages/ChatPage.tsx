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
          // Criar nova conversa
          console.log("[CHAT] Creating conversation for agent:", agent?.title);
          const response = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: `Chat with ${agent?.title || "Agent"}` }),
          });
          if (response.ok) {
            const conv = await response.json();
            console.log("[CHAT] Conversation created with ID:", conv.id);
            setConversationId(conv.id);
            setMessages([]);
          }
        }
      } catch (error) {
        console.error("[CHAT] Error:", error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };
    if (agent?.title) {
      initConversation();
    }
  }, [agent?.title, conversationId]);

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
    <div className="flex w-full h-screen overflow-hidden bg-gray-50/30 dark:bg-slate-900/30">
      <ChatSidebar agentId={agentId!} currentConversationId={conversationId} />
      <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white dark:bg-slate-950 px-3 py-2 sm:px-4 sm:py-3">
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
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-semibold truncate flex items-center gap-1 sm:gap-2">
                  <Bot className="h-4 w-4 flex-shrink-0 text-blue-600" />
                  <span className="truncate">{agent?.title || "Chat"}</span>
                </h1>
              </div>
              <div className="hidden sm:flex items-center gap-1 sm:gap-2 mt-0.5 flex-wrap">
                <div className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full">
                  <Zap className="h-2.5 w-2.5" />
                  GPT-4o Mini
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800 flex items-center gap-0.5 cursor-help text-xs px-2 py-0.5 rounded-full">
                        <Database className="h-2.5 w-2.5" />
                        Knowledge Base
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Este agente utiliza seus documentos e instruções como contexto prioritário.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <ScrollArea className="flex-1 w-full" ref={scrollRef}>
          <div className="px-3 py-4 sm:px-4 sm:py-6 w-full h-full">
            <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
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
        <div className="flex-shrink-0 bg-white dark:bg-slate-950 border-t dark:border-slate-800 px-3 py-3 sm:px-4 sm:py-4">
        <div className="w-full space-y-2">
          <div className="flex flex-wrap gap-1 sm:gap-2 overflow-x-auto pb-1">
            {shortcuts.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="rounded-full text-xs px-2 sm:px-3 hover-elevate flex-shrink-0 whitespace-nowrap"
                onClick={() => setInput(s)}
                data-testid={`button-shortcut-${s.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">{s}</span>
                <span className="sm:hidden text-xs">{s.split(' ')[0]}</span>
              </Button>
            ))}
          </div>
          
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
