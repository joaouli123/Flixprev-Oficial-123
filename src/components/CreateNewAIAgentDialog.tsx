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
import { toast } from "sonner";
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
  onEditSave?: (agentId: string, agent: Omit<Agent, "id" | "userId" | "created_at">) => void;
  categories: Category[];
  agentToEdit?: Agent | null;
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
  onEditSave,
  categories,
  agentToEdit,
}) => {
  const isEditing = !!agentToEdit;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState("Bot");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<string[]>([]);
  const [shortcuts, setShortcuts] = useState<string[]>(["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
  const [shortcutInput, setShortcutInput] = useState("");

  // Preencher os campos quando estiver editando
  React.useEffect(() => {
    if (agentToEdit && isOpen) {
      console.log("Editando agente com categoria_ids:", agentToEdit.category_ids);
      console.log("Tipo de category_ids:", typeof agentToEdit.category_ids, "Array?", Array.isArray(agentToEdit.category_ids));
      console.log("Primeiro elemento:", agentToEdit.category_ids?.[0]);
      setTitle(agentToEdit.title);
      setDescription(agentToEdit.description);
      setInstructions(agentToEdit.instructions || "");
      setIcon(agentToEdit.icon);
      // Ensure selectedCategory is set correctly from category_ids
      const catId = agentToEdit.category_ids && agentToEdit.category_ids.length > 0 ? String(agentToEdit.category_ids[0]) : "";
      console.log("Editando agente - IDs de categoria:", agentToEdit.category_ids, "Selecionado:", catId);
      
      // Force update of selectedCategory
      setSelectedCategory(catId);
      
      // Diagnostic log
      console.log("Categorias disponíveis:", categories.map(c => ({ id: String(c.id), name: c.name })));
      const matched = categories.find(c => String(c.id) === String(catId));
      console.log("Categoria correspondente encontrada:", matched);
      setShortcuts(agentToEdit.shortcuts || ["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
      const attachments = (agentToEdit as any).attachments || [];
      console.log("Attachments carregados:", attachments);
      setSavedAttachments(attachments);
      setFiles([]);
      setShortcutInput("");
    } else if (isOpen && !agentToEdit) {
      setTitle("");
      setDescription("");
      setInstructions("");
      setIcon("Bot");
      setSelectedModel("gpt-4o-mini");
      setSelectedCategory("");
      setFiles([]);
      setSavedAttachments([]);
      setShortcuts(["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
      setShortcutInput("");
    }
  }, [agentToEdit, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeSavedAttachment = (path: string) => {
    setSavedAttachments((prev) => prev.filter((p) => p !== path));
  };

  const addShortcut = () => {
    if (shortcutInput.trim() && shortcuts.length < 6) {
      setShortcuts((prev) => [...prev, shortcutInput.trim()]);
      setShortcutInput("");
    }
  };

  const removeShortcut = (index: number) => {
    setShortcuts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (title.trim() && description.trim() && instructions.trim() && icon && selectedCategory) {
      // Upload new files first
      let uploadedPaths: string[] = [...savedAttachments];
      
      if (files.length > 0) {
        for (const file of files) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            
            const response = await fetch("/api/agents/upload", {
              method: "POST",
              body: formData,
            });
            
            if (response.ok) {
              const data = await response.json();
              uploadedPaths.push(data.path);
              console.log("Arquivo carregado:", data.path);
            }
          } catch (err) {
            console.error("Erro ao fazer upload do arquivo:", err);
            toast.error(`Erro ao fazer upload de ${file.name}`);
          }
        }
      }

      const categoryArray = selectedCategory ? [selectedCategory] : [];
      console.log("selectedCategory antes de salvar:", selectedCategory);
      console.log("categoryArray:", categoryArray);
      
      const agentData = {
        title: title.trim(),
        description: description.trim(),
        icon,
        category_ids: categoryArray as string[],
        shortcuts: shortcuts.length > 0 ? shortcuts : undefined,
        instructions: instructions.trim() || undefined,
        attachments: uploadedPaths,
      } as any;

      console.log("Dados completos do agente a salvar:", agentData);
      console.log("category_ids no agentData:", agentData.category_ids);

      if (isEditing && agentToEdit && onEditSave) {
        console.log("Editando agente:", agentToEdit.id, "com category_ids:", agentData.category_ids);
        onEditSave(agentToEdit.id, agentData);
        // Após salvar as alterações, reprocessar attachments se houver para garantir RAG
        if (uploadedPaths.length > 0) {
          fetch('/api/admin/reprocess-attachments', { method: 'POST' }).catch(console.error);
        }
      } else {
        console.log("Criando agente com categoria:", selectedCategory);
        onSave(agentData);
      }

      setTitle("");
      setDescription("");
      setInstructions("");
      setIcon("Bot");
      setSelectedModel("gpt-4o-mini");
      setSelectedCategory("");
      setFiles([]);
      setSavedAttachments([]);
      setShortcuts(["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
      setShortcutInput("");
      onClose();
    } else {
      if (!selectedCategory) {
        toast.error("Por favor, selecione uma categoria para o agente.");
      } else if (!instructions.trim()) {
        toast.error("Por favor, preencha as Instruções do Sistema.");
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
            {isEditing ? "Editar Agente IA" : "Configurar Novo Agente IA"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Altere a personalidade e configurações do seu assistente."
              : "Defina a personalidade e anexe documentos para o seu assistente."}
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
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Uma breve descrição do agente"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="instructions">Instruções do Sistema (Prompt / Instruções)</Label>
            <Textarea
              id="instructions"
              placeholder="Descreva detalhadamente como o agente deve se comportar e qual sua base de conhecimento..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
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
            
            {(savedAttachments.length > 0 || files.length > 0) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {savedAttachments.map((path) => (
                  <div key={path} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-3 py-1 rounded-full text-xs">
                    <FileText className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{path.split("/").pop()}</span>
                    <button
                      onClick={() => removeSavedAttachment(path)}
                      className="ml-1 hover:text-red-600"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
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
              <Select 
                value={selectedCategory || "none"} 
                onValueChange={(val) => setSelectedCategory(val === "none" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria...">
                    {categories.find(c => String(c.id) === String(selectedCategory))?.name || "Selecione uma categoria"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma categoria</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
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

          <div className="grid gap-2">
            <Label>Atalhos Personalizados (Máx. 6)</Label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Ex: Gerar relatório"
                value={shortcutInput}
                onChange={(e) => setShortcutInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addShortcut()}
                className="text-sm"
              />
              <Button 
                type="button"
                variant="outline" 
                onClick={addShortcut}
                disabled={shortcuts.length >= 6 || !shortcutInput.trim()}
                className="px-3"
              >
                Adicionar
              </Button>
            </div>
            {shortcuts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs text-blue-700"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>{shortcut}</span>
                    <button
                      type="button"
                      onClick={() => removeShortcut(index)}
                      className="hover:text-blue-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20">
            {isEditing ? "Salvar Alterações" : "Criar Agente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateNewAIAgentDialog;
