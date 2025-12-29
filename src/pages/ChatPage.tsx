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

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface OutletContext {
  agents: Agent[];
}

const ChatPage = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { agents } = useOutletContext<OutletContext>();
  const agent = agents.find((a) => a.id === agentId);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Olá! Eu sou o ${agent?.title || "Agente"}. Minha base de conhecimento foi atualizada com seus documentos e instruções. Como posso ser útil agora?`,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use agent shortcuts or default shortcuts
  const shortcuts = agent?.shortcuts || ["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Resposta simulada especializada baseada no modelo
    setTimeout(() => {
      let modelContext = "modelo GPT-4o Mini";
      if (agent?.description?.toLowerCase().includes("gpt-4o") && !agent?.description?.toLowerCase().includes("mini")) {
        modelContext = "modelo GPT-4o";
      } else if (agent?.description?.toLowerCase().includes("claude")) {
        modelContext = "modelo Claude 3.5 Sonnet";
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Com base nas instruções personalizadas e nos documentos anexados para o agente "${agent?.title}", analisei sua solicitação. Esta resposta está sendo gerada utilizando o ${modelContext} com foco na sua base de dados privada. Estou pronto para processar seus arquivos .docx, .pdf ou imagens conforme solicitado.`,
        },
      ]);
    }, 1500);
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-gray-50/30 dark:bg-slate-900/30">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white dark:bg-slate-950 p-2 sm:p-3">
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/app")} 
              className="hover-elevate flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
              data-testid="button-back-chat"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg md:text-xl font-semibold truncate flex items-center gap-1 sm:gap-2">
                  <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                  <span className="truncate">{agent?.title || "Chat"}</span>
                </h1>
              </div>
              <div className="hidden sm:flex items-center gap-1 sm:gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800 flex items-center gap-0.5 text-xs">
                  <Zap className="h-2.5 w-2.5" />
                  GPT-4o Mini
                </Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800 flex items-center gap-0.5 cursor-help text-xs">
                        <Database className="h-2.5 w-2.5" />
                        Knowledge Base
                      </Badge>
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
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-3 sm:p-4 md:p-6 w-full">
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
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                      <User className="h-3 w-3 sm:h-4 sm:w-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-950 border-t dark:border-slate-800 p-2 sm:p-3 pb-safe">
        <div className="w-full space-y-2">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 overflow-x-auto pb-1">
            {shortcuts.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="rounded-full text-xs h-7 sm:h-8 px-2.5 sm:px-3 hover-elevate flex-shrink-0 whitespace-nowrap"
                onClick={() => setInput(s)}
                data-testid={`button-shortcut-${s.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                <span className="hidden sm:inline">{s}</span>
                <span className="sm:hidden">{s.split(' ')[0]}</span>
              </Button>
            ))}
          </div>
          
          <div className="flex gap-1.5 sm:gap-2">
            <Input
              placeholder="Pergunte..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="rounded-lg sm:rounded-xl h-9 sm:h-10 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              data-testid="input-message"
            />
            <Button 
              onClick={handleSend} 
              className="rounded-lg sm:rounded-xl h-9 sm:h-10 px-2 sm:px-4 flex-shrink-0"
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
