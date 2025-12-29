import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface CreateAIAgentChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateAIAgentChatDialog: React.FC<CreateAIAgentChatDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Eu sou o assistente de criação de agentes IA. Vou te ajudar a configurar seu novo agente vinculado à API da OpenAI. O que este agente deve fazer?",
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Resposta simulada do "agente criador"
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Entendido! Estou processando as instruções para o seu novo agente. Posso configurar atalhos para facilitar o uso?",
        },
      ]);
    }, 1000);
  };

  const shortcuts = [
    "Resumir Texto",
    "Extrair Dados",
    "Traduzir",
    "Analisar Sentimento",
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            Criar Novo Agente IA (Chat)
          </DialogTitle>
          <DialogDescription>
            Configure seu agente conversando com nossa IA.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 max-w-[85%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  msg.role === "assistant" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600"
                )}>
                  {msg.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "p-3 rounded-lg text-sm shadow-sm border",
                  msg.role === "assistant" 
                    ? "bg-white border-gray-100" 
                    : "bg-blue-600 text-white border-blue-700"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Atalhos Sugeridos</p>
            <div className="flex flex-wrap gap-2">
              {shortcuts.map((s) => (
                <Button 
                  key={s} 
                  variant="outline" 
                  size="sm" 
                  className="border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900 h-8 px-3"
                  onClick={() => setInput(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-gray-50/50">
          <div className="flex gap-2">
            <Input
              placeholder="Digite aqui sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="bg-white"
            />
            <Button size="icon" onClick={handleSend} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAIAgentChatDialog;
