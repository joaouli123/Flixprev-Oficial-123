import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, ChevronLeft, Sparkles, MoreVertical, Shield, Trash2, Download, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Agent } from "@/types/app";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TypingIndicator } from "@/components/TypingIndicator";
import { FormattedMessage } from "@/components/FormattedMessage";
import { ChatSidebar } from "@/components/ChatSidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/SessionContextProvider";
import { extractUuidFromRouteKey, makeAgentRouteKey, toSlug } from "@/lib/slug";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface ChatAttachment {
  path: string;
  filename: string;
  mimeType?: string;
}

interface OutletContext {
  agents: Agent[];
}

const ChatPage = () => {
  const { session } = useSession();
  const userId = session?.user?.id || "";
  const { agentId, agentSlug, conversationId: urlConvId } = useParams<{ agentId?: string; agentSlug?: string; conversationId?: string }>();
  const agentRouteParam = agentId || agentSlug || "";
  const navigate = useNavigate();
  const { agents } = useOutletContext<OutletContext>();

  const resolveAgent = (key: string) => {
    if (!key) return undefined;
    const byId = agents.find((a) => a.id === key);
    if (byId) return byId;

    const uuidFromKey = extractUuidFromRouteKey(key);
    if (uuidFromKey) {
      const byUuidTail = agents.find((a) => a.id === uuidFromKey);
      if (byUuidTail) return byUuidTail;
    }

    return agents.find((a) => toSlug(a.title) === key);
  };

  const agent = resolveAgent(agentRouteParam);
  const resolvedAgentId = agent?.id || "";
  const resolvedAgentRouteKey = agent ? makeAgentRouteKey(agent.title, agent.id) : agentRouteParam;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(urlConvId ? parseInt(urlConvId) : null);

  useEffect(() => {
    if (!agent || !resolvedAgentRouteKey) return;

    const currentPath = window.location.pathname;
    const canonicalPath = conversationId
      ? `/app/agente/${resolvedAgentRouteKey}/${conversationId}`
      : `/app/agente/${resolvedAgentRouteKey}`;

    if (currentPath !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [agent?.id, resolvedAgentRouteKey, conversationId, navigate]);

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
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use agent shortcuts or default shortcuts
  const shortcuts = agent?.shortcuts || ["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"];

  // Initialize conversation on component mount
  useEffect(() => {
    const initConversation = async () => {
      if (!userId || !resolvedAgentId) return;
      setIsLoading(true);
      try {
        // Se já tem ID na URL, carregar mensagens dessa conversa
        if (conversationId) {
          console.log("[CHAT] Loading conversation:", conversationId);
          const res = await fetch(`/api/conversations/${conversationId}/messages`, {
            headers: { "x-user-id": userId }
          });
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
          console.log("[CHAT] Checking for existing conversations for agent:", resolvedAgentId);
          const conversationsRes = await fetch(`/api/conversations?agentId=${resolvedAgentId}`, {
            headers: { "x-user-id": userId }
          });
          if (conversationsRes.ok) {
            const rawConversations = await conversationsRes.json();
            const conversations = Array.isArray(rawConversations) ? rawConversations : [];
            if (conversations && conversations.length > 0) {
              const lastConv = conversations[0]; // Assumindo que o backend retorna ordenado por data descendente
              console.log("[CHAT] Found existing conversation, redirecting:", lastConv.id);
              setConversationId(lastConv.id);
              navigate(`/app/agente/${resolvedAgentRouteKey}/${lastConv.id}`, { replace: true });
              return;
            }
          }

          // Criar nova conversa se não existir nenhuma
          console.log("[CHAT] No existing conversation found. Creating new one for agent:", agent?.title, "ID:", resolvedAgentId);
          const response = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-user-id": userId },
            body: JSON.stringify({ 
              title: `Novo Chat`,
              agentId: resolvedAgentId,
              userId,
            }),
          });
          if (response.ok) {
            const conv = await response.json();
            console.log("[CHAT] Conversation created with ID:", conv.id);
            setConversationId(conv.id);
            // Manter mensagens vazias apenas para nova conversa
            // Atualizar a URL para incluir o ID da conversa sem recarregar
            navigate(`/app/agente/${resolvedAgentRouteKey}/${conv.id}`, { replace: true });
          }
        }
      } catch (error) {
        console.error("[CHAT] Error:", error);
        // Não limpar mensagens em caso de erro
      } finally {
        setIsLoading(false);
      }
    };
    if (agent?.title && userId) {
      initConversation();
    }
  }, [agent?.title, resolvedAgentId, resolvedAgentRouteKey, conversationId, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [messages]);

  const uploadAttachment = async (file: File): Promise<ChatAttachment> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/agents/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Falha ao enviar anexo");
    }

    return await res.json();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingAttachment(file);
    e.target.value = "";
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          e.preventDefault();
          const ext = pastedFile.type.split("/")[1] || "png";
          const file = new File([pastedFile], `imagem-colada-${Date.now()}.${ext}`, { type: pastedFile.type });
          setPendingAttachment(file);
        }
        break;
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !pendingAttachment) {
      console.warn("[CHAT] Cannot send: input and attachment are empty");
      return;
    }
    
    if (!conversationId) {
      console.warn("[CHAT] Conversation not ready yet, waiting...");
      return;
    }

    const messageContent = input.trim();
    const attachmentLabel = pendingAttachment ? `\n\n📎 Anexo: ${pendingAttachment.name}` : "";
    const userMsg: Message = { role: "user", content: `${messageContent}${attachmentLabel}`.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const convId = conversationId;
      console.log("[CHAT] Sending message to conversation:", convId, "agentId:", resolvedAgentId);

      let uploadedAttachment: ChatAttachment | null = null;
      if (pendingAttachment) {
        uploadedAttachment = await uploadAttachment(pendingAttachment);
      }
      
      const response = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ 
          content: messageContent,
          agentId: resolvedAgentId,
          attachment: uploadedAttachment
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
      setPendingAttachment(null);
      setIsSending(false);
    }
  };

  const handleClearChat = async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
        headers: { "x-user-id": userId }
      });
      if (res.ok) {
        setMessages([]);
        navigate(`/app/agente/${resolvedAgentRouteKey}`, { replace: true });
      }
    } catch (error) {
      console.error("[CHAT] Failed to clear chat:", error);
    }
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    
    // Create text content
    const exportText = messages.map(msg => {
      const role = msg.role === "user" ? "Você" : agent?.title || "Agente";
      return `${role}:\n${msg.content}\n\n-------------------\n\n`;
    }).join("");

    // Create and trigger download
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `chat-${agent?.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'export'}-${new Date().toISOString().split('T')[0]}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full h-full min-h-0 min-w-0 overflow-hidden bg-white relative">
      <ChatSidebar
        agentId={resolvedAgentId}
        agentRouteKey={resolvedAgentRouteKey}
        agentTitle={agent?.title}
        currentConversationId={conversationId}
      />
      <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden relative min-w-0 bg-transparent">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3 z-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Button 
                variant="ghost" 
                onClick={() => navigate("/app")} 
                className="hover:bg-slate-100 text-slate-600 flex-shrink-0 rounded-lg h-9 px-2 flex items-center gap-1"
                data-testid="button-back-chat"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Voltar</span>
              </Button>
              <div className="flex-1 min-w-0 flex items-center gap-2 ml-2">
                <h1 className="text-base font-semibold text-slate-900 truncate flex items-center gap-2">
                  {agent?.title || "Chat"}
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600 flex-shrink-0"></span>
                </h1>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-xl rounded-xl">
                <DropdownMenuItem onClick={handleExportChat} className="cursor-pointer hover:bg-slate-50 gap-2 focus:bg-slate-50">
                  <Download className="h-4 w-4 text-slate-500" />
                  <span>Exportar Conversa (.txt)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearChat} className="cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 gap-2 focus:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir Conversa</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain">
            <div className="px-4 py-6 w-full">
              <div className="w-full space-y-6">
                {/* Mensagem de Boas-vindas e Atalhos */}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center text-center space-y-8 py-12 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="h-20 w-20 bg-indigo-100 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
                      <Bot className="h-10 w-10 text-indigo-600" />
                    </div>
                    <div className="space-y-3 max-w-md">
                      <h2 className="text-2xl font-bold text-slate-900">
                        Olá! Sou seu agente de IA em "{agent?.title}"
                      </h2>
                      <p className="text-slate-500 text-lg">
                        Estou aqui para ajudar. Como posso ser útil hoje?
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-8">
                      {shortcuts.map((s) => (
                        <Button
                          key={s}
                          variant="outline"
                          className="justify-start h-auto py-4 px-5 rounded-xl bg-white hover:bg-slate-50 hover:text-slate-900 border-gray-200 shadow-sm transition-all duration-200 group"
                          onClick={() => setInput(s)}
                          data-testid={`button-shortcut-welcome-${s.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <Sparkles className="h-4 w-4 text-indigo-600 mr-3 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{s}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={`${msg.role}-${i}`}
                    className={cn(
                      "flex gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 mt-1">
                        <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                    )}
                    <div className={cn(
                      "px-4 py-3 sm:px-5 sm:py-4 rounded-2xl text-sm sm:text-base leading-relaxed max-w-[85%] sm:max-w-[75%] break-words overflow-x-auto relative",
                      msg.role === "assistant" 
                        ? "bg-white border border-gray-200 text-slate-800 rounded-tl-sm shadow-sm" 
                        : "bg-indigo-600 text-white rounded-tr-sm shadow-sm"
                    )}>
                      {msg.role === "assistant" ? (
                        <FormattedMessage content={msg.content} />
                      ) : (
                        msg.content
                      )}
                      <div className={cn(
                        "text-[10px] mt-2 text-right opacity-70",
                        msg.role === "assistant" ? "text-slate-400" : "text-indigo-100"
                      )}>
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 mt-1">
                      <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="px-4 py-3 sm:px-5 sm:py-4 rounded-2xl text-sm sm:text-base leading-relaxed bg-white border border-gray-200 shadow-sm rounded-tl-sm flex items-center">
                      <TypingIndicator />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-white border-t border-gray-100 px-4 py-4 z-20">
          <div className="w-full">
            {pendingAttachment && (
              <div className="mb-2 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                <span className="text-xs text-indigo-700 truncate">📎 {pendingAttachment.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-indigo-600 hover:text-red-600"
                  onClick={() => setPendingAttachment(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="relative flex items-center">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-2 rounded-xl h-10 w-10 p-0 bg-transparent hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all"
                title="Anexar arquivo"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Input
                placeholder="Descreva a falha ou código de erro..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handleInputPaste}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="rounded-2xl text-base bg-white border-gray-300 text-slate-900 pl-14 pr-14 py-6 shadow-sm focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                data-testid="input-message"
              />
              <Button 
                onClick={handleSend} 
                disabled={isSending || (!input.trim() && !pendingAttachment)}
                className="absolute right-2 rounded-xl h-10 w-10 p-0 bg-transparent hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all"
                data-testid="button-send-message"
              >
                {isSending ? <span className="animate-spin">⚙️</span> : <Send className="h-5 w-5" />}
              </Button>
            </div>
            <div className="text-center mt-3 flex items-center justify-center gap-1.5">
              <Shield className="h-3 w-3 text-slate-400" />
              <span className="text-xs text-slate-500">Ambiente Seguro. As respostas são geradas por IA e revisadas por normas técnicas.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
