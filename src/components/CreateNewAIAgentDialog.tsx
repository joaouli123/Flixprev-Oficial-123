import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bot, 
  Sparkles, 
  MessageSquare, 
  Zap, 
  Search, 
  Globe, 
  FileText, 
  ShieldCheck, 
  Cpu,
  BrainCircuit,
  Layout,
  Layers,
  Fingerprint,
  Activity,
  Box,
  Code
} from "lucide-react";
import { Agent, Category } from "@/types/app";

interface CreateNewAIAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: Omit<Agent, "id" | "userId" | "created_at">) => void;
  categories: Category[];
}

const iconOptions = [
  { name: "Bot", icon: Bot },
  { name: "Sparkles", icon: Sparkles },
  { name: "MessageSquare", icon: MessageSquare },
  { name: "Zap", icon: Zap },
  { name: "Search", icon: Search },
  { name: "Globe", icon: Globe },
  { name: "FileText", icon: FileText },
  { name: "ShieldCheck", icon: ShieldCheck },
  { name: "Cpu", icon: Cpu },
  { name: "BrainCircuit", icon: BrainCircuit },
  { name: "Layout", icon: Layout },
  { name: "Layers", icon: Layers },
  { name: "Fingerprint", icon: Fingerprint },
  { name: "Activity", icon: Activity },
  { name: "Box", icon: Box },
  { name: "Code", icon: Code },
];

const modelOptions = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Mais rápido e econômico" },
  { id: "gpt-4o", name: "GPT-4o", description: "Mais inteligente e capaz" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", description: "Excelente raciocínio" },
];

const CreateNewAIAgentDialog: React.FC<CreateNewAIAgentDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("Bot");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  const handleSave = () => {
    if (title.trim() && description.trim() && icon && selectedCategory) {
      onSave({
        title: title.trim(),
        description: description.trim(),
        icon,
        category_ids: [selectedCategory],
        // Armazenamos o modelo nos metadados ou descrição por enquanto já que o schema é fixo
        // Em um sistema real, teríamos uma coluna 'model'
      });
      setTitle("");
      setDescription("");
      setIcon("Bot");
      setSelectedModel("gpt-4o-mini");
      setSelectedCategory(undefined);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            Configurar Novo Agente IA
          </DialogTitle>
          <DialogDescription>
            Defina a personalidade e as ferramentas do seu novo assistente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Nome do Agente</Label>
            <Input
              id="title"
              placeholder="Ex: Consultor Previdenciário"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Instruções do Sistema (Prompt)</Label>
            <Textarea
              id="description"
              placeholder="Descreva como o agente deve se comportar..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Modelo de IA</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.name}</span>
                        <span className="text-[10px] text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Ícone de Identificação</Label>
            <div className="grid grid-cols-8 gap-2 border rounded-md p-2 max-h-[120px] overflow-y-auto bg-gray-50/50">
              {iconOptions.map((option) => {
                const IconComp = option.icon;
                return (
                  <Button
                    key={option.name}
                    variant={icon === option.name ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIcon(option.name)}
                    title={option.name}
                  >
                    <IconComp className="h-4 w-4" />
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20">
            Criar Agente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateNewAIAgentDialog;
