import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, ChevronLeft, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Agent } from "@/types/app";
import { Badge } from "@/components/ui/badge";

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
      content: `Olá! Eu sou o ${agent?.title || "Agente"}. Como posso ajudar você hoje?`,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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

    // Resposta simulada
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Esta é uma resposta simulada da API OpenAI vinculada a este agente. Em breve integraremos a conexão real.",
        },
      ]);
    }, 1000);
  };

  const shortcuts = ["Resumir", "Analisar", "Traduzir", "Dúvidas"];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app")} className="hover-elevate">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-blue-600" />
              {agent?.title || "Chat com Agente"}
            </h1>
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              GPT-4o Mini
            </Badge>
          </div>
          <p className="text-gray-500 text-sm">{agent?.description}</p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden shadow-xl border-gray-200/50 bg-white/95 backdrop-blur-sm">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 max-w-[85%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border",
                  msg.role === "assistant" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-gray-50 text-gray-600 border-gray-100"
                )}>
                  {msg.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "p-3 rounded-2xl text-sm shadow-sm border transition-all duration-300",
                  msg.role === "assistant" 
                    ? "bg-white border-gray-100 rounded-tl-none" 
                    : "bg-blue-600 text-white border-blue-700 rounded-tr-none"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-gray-50/50 space-y-4">
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="rounded-full border-gray-300 text-gray-600 hover:bg-white hover:border-blue-400 hover:text-blue-600 transition-all h-8 px-4"
                onClick={() => setInput(s)}
              >
                <Sparkles className="h-3 w-3 mr-2" />
                {s}
              </Button>
            ))}
          </div>
          
          <div className="flex gap-2">
            <Input
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="bg-white rounded-xl focus:ring-blue-500 h-11"
            />
            <Button onClick={handleSend} className="rounded-xl h-11 px-6 shadow-md shadow-blue-500/20">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ChatPage;
