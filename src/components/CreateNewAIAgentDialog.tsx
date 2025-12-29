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
  Code,
  Upload,
  X,
  File
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
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (title.trim() && description.trim() && icon && selectedCategory) {
      console.log("Salvando agente com categoria selecionada:", selectedCategory);
      onSave({
        title: title.trim(),
        description: description.trim(),
        icon,
        category_ids: [selectedCategory],
      });
      setTitle("");
      setDescription("");
      setIcon("Bot");
      setSelectedModel("gpt-4o-mini");
      setSelectedCategory(undefined);
      setFiles([]);
      onClose();
    } else {
      if (!selectedCategory) {
        toast.error("Por favor, selecione uma categoria para o agente.");
      } else {
        toast.error("Por favor, preencha todos os campos obrigatórios.");
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            Configurar Novo Agente IA
          </DialogTitle>
          <DialogDescription>
            Defina a personalidade e anexe documentos para o seu assistente.
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
            <Label htmlFor="description">Instruções do Sistema (Prompt / Instruções)</Label>
            <Textarea
              id="description"
              placeholder="Descreva detalhadamente como o agente deve se comportar e qual sua base de conhecimento..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Arquivos Complementares (PDF, DOCX, Imagens)</Label>
            <div className="border-2 border-dashed rounded-lg p-4 bg-gray-50/50 hover:bg-gray-100/50 transition-colors cursor-pointer relative">
              <input
                type="file"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileChange}
                accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"
              />
              <div className="flex flex-col items-center justify-center gap-2 text-gray-500">
                <Upload className="h-6 w-6" />
                <span className="text-sm font-medium">Clique ou arraste para anexar</span>
                <span className="text-[10px]">Suporta PDF, Word, Imagens</span>
              </div>
            </div>
            
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 bg-white border rounded-full px-3 py-1 text-xs text-gray-600 group hover:border-blue-300">
                    <File className="h-3 w-3 text-blue-500" />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <button onClick={() => removeFile(index)} className="hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                        <span className="font-medium text-xs">{model.name}</span>
                        <span className="text-[9px] text-muted-foreground">{model.description}</span>
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
            <div className="grid grid-cols-8 gap-2 border rounded-md p-2 max-h-[100px] overflow-y-auto bg-gray-50/50">
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
