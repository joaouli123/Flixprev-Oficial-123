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
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState("Bot");
  const [backgroundIcon, setBackgroundIcon] = useState("Bot");
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
      setRole(agentToEdit.role || "");
      setDescription(agentToEdit.description);
      setInstructions(agentToEdit.instructions || "");
      setIcon(agentToEdit.icon);
      setBackgroundIcon(agentToEdit.background_icon || agentToEdit.icon || "Bot");
      // Ensure selectedCategory is set correctly from category_ids
      const catId = agentToEdit.category_ids && agentToEdit.category_ids.length > 0 ? String(agentToEdit.category_ids[0]) : "";
      console.log("Editando agente - IDs de categoria:", agentToEdit.category_ids, "Selecionado:", catId);
      
      // Force update of selectedCategory
      setSelectedCategory(catId);
      
      // Diagnostic log
      console.log("Categorias disponíveis:", categories.map(c => ({ id: String(c.id), name: c.name })));
      const matched = categories.find(c => String(c.id) === String(catId));
      console.log("Categoria correspondente encontrada:", matched);
      
      // Garantir que os shortcuts sejam carregados se existirem, senão usar os padrões
      const agentShortcuts = (agentToEdit as any).shortcuts;
      setShortcuts(Array.isArray(agentShortcuts) && agentShortcuts.length > 0 
        ? agentShortcuts 
        : ["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
        
      const attachments = (agentToEdit as any).attachments || [];
      console.log("Attachments carregados:", attachments);
      setSavedAttachments(attachments);
      setFiles([]);
      setShortcutInput("");
    } else if (isOpen && !agentToEdit) {
      setTitle("");
      setRole("");
      setDescription("");
      setInstructions("");
      setIcon("Bot");
      setBackgroundIcon("Bot");
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
            if (isEditing && agentToEdit?.id) {
              formData.append("agentId", agentToEdit.id);
            }
            
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
        role: role.trim() || undefined,
        description: description.trim(),
        icon,
        background_icon: backgroundIcon,
        category_ids: categoryArray as string[],
        shortcuts: shortcuts, // Sempre enviar os shortcuts atuais
        instructions: instructions.trim() || undefined,
        attachments: uploadedPaths,
      } as any;

      console.log("Dados completos do agente a salvar:", agentData);
      console.log("category_ids no agentData:", agentData.category_ids);

      if (isEditing && agentToEdit && onEditSave) {
        console.log("Editando agente:", agentToEdit.id, "com category_ids:", agentData.category_ids);
        onEditSave(agentToEdit.id, agentData);
      } else {
        console.log("Criando agente com categoria:", selectedCategory);
        onSave(agentData);
      }

      setTitle("");
      setRole("");
      setDescription("");
      setInstructions("");
      setIcon("Bot");
      setBackgroundIcon("Bot");
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

  const SelectedIcon = (iconOptions.find(o => o.name === icon)?.icon || Bot) as React.ElementType;
  const SelectedBackgroundIcon = (iconOptions.find(o => o.name === backgroundIcon)?.icon || Bot) as React.ElementType;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 flex flex-row items-center gap-3">
          <DialogTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            {isEditing ? "Editar Especialista" : "Criar Novo Especialista"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row h-[70vh]">
          {/* Left Column - Form */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5 border-r border-slate-100">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium text-slate-700">Nome do Agente <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                placeholder="Ex: Especialista Atlas Schindler"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-sm font-medium text-slate-700">Função (Role)</Label>
              <Input
                id="role"
                placeholder="Ex: Tira-dúvidas de Manuais"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium text-slate-700">Descrição Curta <span className="text-red-500">*</span></Label>
              <Input
                id="description"
                placeholder="Ex: Focado nos manuais da linha 3300 e 5500."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Ícone Principal <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                {iconOptions.slice(0, 10).map((option) => {
                  const IconComp = option.icon;
                  return (
                    <Button
                      key={option.name}
                      variant={icon === option.name ? "default" : "outline"}
                      size="icon"
                      className={`h-10 w-10 rounded-lg transition-all ${icon === option.name ? 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'}`}
                      onClick={() => setIcon(option.name)}
                      title={option.name}
                      type="button"
                    >
                      <IconComp className="h-5 w-5" />
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Ícone de Fundo (Marca d'água) <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                {iconOptions.slice(0, 10).map((option) => {
                  const IconComp = option.icon;
                  return (
                    <Button
                      key={`bg-${option.name}`}
                      variant={backgroundIcon === option.name ? "default" : "outline"}
                      size="icon"
                      className={`h-10 w-10 rounded-lg transition-all ${backgroundIcon === option.name ? 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'}`}
                      onClick={() => setBackgroundIcon(option.name)}
                      title={option.name}
                      type="button"
                    >
                      <IconComp className="h-5 w-5" />
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                Marca / Base de Conhecimento <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-slate-500 mb-2">Selecione a marca para que o agente responda APENAS com os documentos dessa marca.</p>
              <Select 
                value={selectedCategory || "none"} 
                onValueChange={(val) => setSelectedCategory(val === "none" ? "" : val)}
              >
                <SelectTrigger className="w-full border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500">
                  <SelectValue placeholder="Todas as marcas (sem filtro)">
                    {categories.find(c => String(c.id) === String(selectedCategory))?.name || "Todas as marcas (sem filtro)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todas as marcas (sem filtro)</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100">
              <Label htmlFor="instructions" className="text-sm font-medium text-slate-700">Instrução de Sistema <span className="text-red-500">*</span></Label>
              <Textarea
                id="instructions"
                placeholder="Descreva detalhadamente como o agente deve se comportar..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full min-h-[100px] resize-none transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Arquivos Complementares</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all cursor-pointer relative group">
                <input
                  type="file"
                  multiple
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"
                />
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500 group-hover:text-indigo-600 transition-colors">
                  <Upload className="h-5 w-5" />
                  <span className="text-xs font-medium">Clique ou arraste para anexar</span>
                </div>
              </div>
              
              {(savedAttachments.length > 0 || files.length > 0) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {savedAttachments.map((path) => (
                    <div key={path} className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-full text-[10px] font-medium">
                      <FileText className="h-3 w-3" />
                      <span className="truncate max-w-[100px]">{path.split("/").pop()}</span>
                      <button onClick={() => removeSavedAttachment(path)} className="ml-1 hover:text-red-600" type="button"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full text-[10px] font-medium">
                      <File className="h-3 w-3 text-indigo-500" />
                      <span className="truncate max-w-[100px]">{file.name}</span>
                      <button onClick={() => removeFile(index)} className="ml-1 hover:text-red-500" type="button"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Atalhos (Máx. 6)</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Ex: Gerar relatório"
                  value={shortcutInput}
                  onChange={(e) => setShortcutInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addShortcut())}
                  className="text-sm border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <Button type="button" variant="outline" onClick={addShortcut} disabled={shortcuts.length >= 6 || !shortcutInput.trim()} className="px-3">
                  Add
                </Button>
              </div>
              {shortcuts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-1 text-[10px] font-medium text-indigo-700">
                      <span>{shortcut}</span>
                      <button type="button" onClick={() => removeShortcut(index)} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="w-full md:w-[350px] bg-slate-50/50 p-6 flex flex-col gap-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Pré-visualização</h3>
              
              {/* Preview Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/40 opacity-100" />
                
                {/* Ícone de fundo (Marca d'água) */}
                <div className="pointer-events-none absolute -bottom-6 -right-6 z-0 opacity-[0.05]">
                  <SelectedBackgroundIcon className="h-48 w-48 text-slate-900" />
                </div>

                <div className="relative z-10">
                  <div className="mb-4">
                    <div className="inline-flex rounded-xl bg-slate-900 p-3 text-white shadow-sm">
                      <SelectedIcon className="h-6 w-6" />
                    </div>
                  </div>
                  <h4 className="line-clamp-1 text-xl font-bold text-slate-900">
                    {title || "Nome do Agente"}
                  </h4>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {role || "FUNÇÃO"}
                  </div>
                  <p className="mt-2.5 min-h-[44px] text-sm leading-relaxed text-slate-600 line-clamp-2">
                    {description || "Descrição breve do especialista..."}
                  </p>
                </div>
              </div>
            </div>

            {/* Pro Tip */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm mb-2">
                <Sparkles className="h-4 w-4" />
                Dica Pro
              </div>
              <p className="text-xs text-indigo-600/80 leading-relaxed">
                Quanto mais detalhada a "Instrução de Sistema", melhor o agente se comportará. Você pode colar trechos de manuais técnicos.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center">
          <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-800 hover:bg-slate-100">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all px-8">
            {isEditing ? "Salvar Alterações" : "Salvar Agente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateNewAIAgentDialog;
