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
import { buildApiUrl } from "@/lib/api";
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
  File,
  Link2,
  Plus,
  Loader2,
  Globe2,
  Brain
} from "lucide-react";
import { Agent, Category } from "@/types/app";

type AgentSaveProgress = {
  stage: string;
  detail?: string;
};

interface CreateNewAIAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: Omit<Agent, "id" | "userId" | "created_at">, options?: { onProgress?: (progress: AgentSaveProgress) => void }) => Promise<boolean> | boolean;
  onEditSave?: (agentId: string, agent: Omit<Agent, "id" | "userId" | "created_at">, options?: { onProgress?: (progress: AgentSaveProgress) => void }) => Promise<boolean> | boolean;
  onCreateCategory?: (categoryName: string) => Promise<Category | null> | Category | null;
  categories: Category[];
  agentToEdit?: Agent | null;
}

function buildLinkLabel(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const pathLabel = parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]+/g, " ")
      .replace(/\.[a-z0-9]+$/i, "")
      .trim();

    return pathLabel || parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "Fonte externa";
  }
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
  onCreateCategory,
  categories,
  agentToEdit,
}) => {
  const isEditing = !!agentToEdit;

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState("Bot");
  const [backgroundIcon, setBackgroundIcon] = useState("Bot");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [link, setLink] = useState("");
  const [extraLinks, setExtraLinks] = useState<{label: string; url: string}[]>([]);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [bulkLinksInput, setBulkLinksInput] = useState("");
  const [isCreatingCategoryInline, setIsCreatingCategoryInline] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<string[]>([]);
  const [shortcuts, setShortcuts] = useState<string[]>(["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
  const [shortcutInput, setShortcutInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveProgress, setSaveProgress] = useState<AgentSaveProgress | null>(null);

  // Preencher os campos quando estiver editando
  React.useEffect(() => {
    if (agentToEdit && isOpen) {
      console.log("Editando agente com categoria_ids:", agentToEdit.category_ids);
      console.log("Tipo de category_ids:", typeof agentToEdit.category_ids, "Array?", Array.isArray(agentToEdit.category_ids));
      console.log("Primeiro elemento:", agentToEdit.category_ids?.[0]);
      setTitle(agentToEdit.title);
      setInstructions(agentToEdit.instructions || "");
      setIcon(agentToEdit.icon);
      setBackgroundIcon(agentToEdit.background_icon || agentToEdit.icon || "Bot");
      setLink(agentToEdit.link || "");
      setExtraLinks((agentToEdit as any).extra_links || []);
      setBulkLinksInput("");
      setIsCreatingCategoryInline(false);
      setNewCategoryName("");
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
      setInstructions("");
      setIcon("Bot");
      setBackgroundIcon("Bot");
      setSelectedCategory("");
      setLink("");
      setExtraLinks([]);
      setNewLinkLabel("");
      setNewLinkUrl("");
      setBulkLinksInput("");
      setIsCreatingCategoryInline(false);
      setNewCategoryName("");
      setFiles([]);
      setSavedAttachments([]);
      setShortcuts(["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
      setShortcutInput("");
      setIsSubmitting(false);
      setSaveProgress(null);
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

  const addExtraLink = (urlValue: string, labelValue?: string) => {
    const trimmedUrl = urlValue.trim();
    if (!trimmedUrl) {
      return;
    }

    try {
      const normalizedUrl = new URL(trimmedUrl).toString();
      const normalizedLabel = (labelValue || "").trim() || buildLinkLabel(normalizedUrl);

      setExtraLinks((prev) => {
        if (prev.some((item) => item.url === normalizedUrl)) {
          return prev;
        }

        return [...prev, { label: normalizedLabel, url: normalizedUrl }];
      });
    } catch {
      toast.error(`URL inválida: ${trimmedUrl}`);
    }
  };

  const handleAddSingleLink = () => {
    addExtraLink(newLinkUrl, newLinkLabel);
    setNewLinkLabel("");
    setNewLinkUrl("");
  };

  const handleAddBulkLinks = () => {
    const urls = bulkLinksInput
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      return;
    }

    urls.forEach((url) => addExtraLink(url));
    setBulkLinksInput("");
  };

  const collectExtraLinksForSave = () => {
    const mergedLinks = [...extraLinks];

    const pushLink = (urlValue: string, labelValue?: string) => {
      const trimmedUrl = String(urlValue || '').trim();
      if (!trimmedUrl) {
        return;
      }

      try {
        const normalizedUrl = new URL(trimmedUrl).toString();
        if (mergedLinks.some((item) => item.url === normalizedUrl)) {
          return;
        }

        mergedLinks.push({
          url: normalizedUrl,
          label: String(labelValue || '').trim() || buildLinkLabel(normalizedUrl),
        });
      } catch {
        toast.error(`URL inválida: ${trimmedUrl}`);
      }
    };

    pushLink(newLinkUrl, newLinkLabel);

    bulkLinksInput
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((url) => pushLink(url));

    return mergedLinks;
  };

  const handleCreateCategoryInline = async () => {
    if (!newCategoryName.trim()) {
      return;
    }

    if (!onCreateCategory) {
      toast.error("A criação de categoria não está disponível neste contexto.");
      return;
    }

    const createdCategory = await onCreateCategory(newCategoryName.trim());
    if (createdCategory) {
      setSelectedCategory(String(createdCategory.id));
      setNewCategoryName("");
      setIsCreatingCategoryInline(false);
    }
  };

  const handleSave = async () => {
    if (isSubmitting) {
      return;
    }

    if (title.trim() && instructions.trim() && icon && selectedCategory) {
      setIsSubmitting(true);
      setSaveProgress({
        stage: isEditing ? "Preparando atualização do agente..." : "Preparando criação do agente...",
        detail: "Validando dados e organizando as fontes de conhecimento.",
      });

      // Upload new files first
      const uploadedPaths: string[] = [...savedAttachments];
      
      if (files.length > 0) {
        for (const file of files) {
          try {
            setSaveProgress({
              stage: `Enviando anexo ${uploadedPaths.length - savedAttachments.length + 1} de ${files.length}`,
              detail: `Fazendo upload de ${file.name} para a base do agente.`,
            });
            const formData = new FormData();
            formData.append("file", file);
            
            const response = await fetch(buildApiUrl("/api/agents/upload"), {
              method: "POST",
              body: formData,
            });
            
            if (response.ok) {
              const data = await response.json();
              uploadedPaths.push(data.path);
              console.log("Arquivo carregado:", data.path);
            } else {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Falha no upload de ${file.name}`);
            }
          } catch (err) {
            console.error("Erro ao fazer upload do arquivo:", err);
            toast.error(`Erro ao fazer upload de ${file.name}`);
            setIsSubmitting(false);
            setSaveProgress(null);
            return;
          }
        }
      }

      const processedExtraLinks = collectExtraLinksForSave();

      if (processedExtraLinks.length > 0) {
        setSaveProgress({
          stage: "Lendo e processando o conteúdo das URLs...",
          detail: `${processedExtraLinks.length} fonte(s) externa(s) serão baixadas, convertidas em texto e indexadas no treinamento do agente.`,
        });
      } else {
        setSaveProgress({
          stage: isEditing ? "Salvando alterações do agente..." : "Salvando agente...",
          detail: "Persistindo dados principais e preparando a base de conhecimento.",
        });
      }

      const categoryArray = selectedCategory ? [selectedCategory] : [];
      console.log("selectedCategory antes de salvar:", selectedCategory);
      console.log("categoryArray:", categoryArray);
      
      const agentData = {
        title: title.trim(),
        role: isEditing ? agentToEdit?.role || undefined : undefined,
        description: isEditing ? agentToEdit?.description || "" : "",
        icon,
        background_icon: backgroundIcon,
        category_ids: categoryArray as string[],
        link: link.trim() || undefined,
        extra_links: processedExtraLinks,
        shortcuts: shortcuts,
        instructions: instructions.trim() || undefined,
        attachments: uploadedPaths,
      } as any;

      console.log("Dados completos do agente a salvar:", agentData);
      console.log("category_ids no agentData:", agentData.category_ids);

      let savedSuccessfully = false;

      if (isEditing && agentToEdit && onEditSave) {
        console.log("Editando agente:", agentToEdit.id, "com category_ids:", agentData.category_ids);
        savedSuccessfully = await onEditSave(agentToEdit.id, agentData, {
          onProgress: (progress) => setSaveProgress(progress),
        });
      } else {
        console.log("Criando agente com categoria:", selectedCategory);
        savedSuccessfully = await onSave(agentData, {
          onProgress: (progress) => setSaveProgress(progress),
        });
      }

      if (!savedSuccessfully) {
        setIsSubmitting(false);
        return;
      }

      setSaveProgress({
        stage: "Finalizando agente...",
        detail: "Conteúdo salvo e treinamento concluído com sucesso.",
      });

      setTitle("");
      setInstructions("");
      setIcon("Bot");
      setBackgroundIcon("Bot");
      setSelectedCategory("");
      setLink("");
      setExtraLinks([]);
      setNewLinkLabel("");
      setNewLinkUrl("");
      setBulkLinksInput("");
      setIsCreatingCategoryInline(false);
      setNewCategoryName("");
      setFiles([]);
      setSavedAttachments([]);
      setShortcuts(["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
      setShortcutInput("");
      setIsSubmitting(false);
      setSaveProgress(null);
      onClose();
    } else {
      setIsSubmitting(false);
      setSaveProgress(null);
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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && isSubmitting) {
        return;
      }
      onClose();
    }}>
      <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        {isSubmitting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/88 backdrop-blur-sm">
            <div className="mx-6 w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Treinando o agente com as fontes informadas</h3>
                  <p className="mt-1 text-sm text-slate-500">O agente só será salvo quando todos os anexos e URLs terminarem de ser lidos, convertidos e indexados.</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">{saveProgress?.stage || "Processando..."}</div>
                <div className="mt-1 text-sm text-slate-600">{saveProgress?.detail || "Aguarde enquanto a base de conhecimento é montada."}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-3 bg-white">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Upload className="h-4 w-4" /> Anexos</div>
                  <div className="mt-2 text-sm text-slate-700">Upload e extração textual</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3 bg-white">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Globe2 className="h-4 w-4" /> URLs</div>
                  <div className="mt-2 text-sm text-slate-700">Leitura completa do conteúdo web</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3 bg-white">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Brain className="h-4 w-4" /> Treino</div>
                  <div className="mt-2 text-sm text-slate-700">Chunking, embeddings e indexação</div>
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 flex flex-row items-center gap-3">
          <DialogTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            {isEditing ? "Editar Especialista" : "Criar Novo Especialista"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing
              ? "Atualize categoria, dados, arquivos e links de conhecimento do especialista."
              : "Crie um novo especialista, escolha a categoria e adicione arquivos ou links para a base de conhecimento."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row h-[70vh]">
          {/* Left Column - Form */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5 border-r border-slate-100">
            {/* CATEGORIA - posição de destaque */}
            <div className="space-y-2 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
              <Label className="text-sm font-medium text-indigo-700 flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                Categoria <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-slate-500 mb-2">Selecione a categoria jurídica e, se precisar, já crie uma nova sem sair deste modal.</p>
              <div className="flex gap-2">
                <Select 
                  value={selectedCategory || "none"} 
                  onValueChange={(val) => setSelectedCategory(val === "none" ? "" : val)}
                >
                  <SelectTrigger className="w-full border-indigo-200 bg-white focus:ring-indigo-500/20 focus:border-indigo-500">
                    <SelectValue placeholder="Selecione a categoria">
                      {categories.find(c => String(c.id) === String(selectedCategory))?.name || "Selecione a categoria"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="shrink-0 border-indigo-200 text-indigo-700" onClick={() => setIsCreatingCategoryInline((prev) => !prev)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova
                </Button>
              </div>
              {isCreatingCategoryInline && (
                <div className="flex gap-2 pt-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Ex: Direito de Família"
                    className="border-indigo-200 bg-white focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <Button type="button" onClick={() => void handleCreateCategoryInline()} disabled={!newCategoryName.trim()}>
                    Criar
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium text-slate-700">Nome do Agente <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                placeholder="Ex: Processo Adm. Previdenciário"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
              <p className="text-xs text-slate-400">Esse será o título principal do card.</p>
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

            {/* Link principal */}
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <Label htmlFor="link" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-indigo-500" />
                Link de Abertura Externa
              </Label>
              <p className="text-xs text-slate-500">Opcional. Se preenchido, o card abre este endereço em vez do chat do agente.</p>
              <Input
                id="link"
                type="url"
                placeholder="https://exemplo.com/recurso"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            {/* Links extras */}
            <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-500" />
                Links para a IA Processar
              </Label>
              <p className="text-xs text-slate-500">Cole aqui as páginas, PDFs ou fontes web que devem entrar na base de conhecimento do agente.</p>
              {extraLinks.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-2">
                  {extraLinks.map((el, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 text-xs">
                      <Link2 className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                      <span className="font-medium text-indigo-800 truncate">{el.label}</span>
                      <span className="text-indigo-400 truncate flex-1">{el.url}</span>
                      <button type="button" onClick={() => setExtraLinks(p => p.filter((_, i) => i !== idx))} className="ml-1 hover:text-red-600 text-indigo-400"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-600">Colar vários links de uma vez</Label>
                <Textarea
                  placeholder="Cole um link por linha"
                  value={bulkLinksInput}
                  onChange={(e) => setBulkLinksInput(e.target.value)}
                  className="min-h-[96px] resize-y border-slate-200 bg-white focus:border-indigo-500 focus:ring-indigo-500/20"
                />
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleAddBulkLinks} disabled={!bulkLinksInput.trim()}>
                    Adicionar lista
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do link (opcional)"
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  className="text-sm flex-1 border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <Input
                  placeholder="https://..."
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className="text-sm flex-1 border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!newLinkUrl.trim()}
                  onClick={handleAddSingleLink}
                  className="h-9 w-9 flex-shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-400">Os links adicionados aqui serão sincronizados com a base do agente no salvamento.</p>
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
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting} className="text-slate-600 hover:text-slate-800 hover:bg-slate-100">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting} className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all px-8">
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando conteúdo...
              </span>
            ) : isEditing ? "Salvar Alterações" : "Salvar Agente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateNewAIAgentDialog;
