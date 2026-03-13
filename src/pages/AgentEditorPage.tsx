import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Activity,
  ArrowLeft,
  Bot,
  Box,
  Brain,
  BrainCircuit,
  Code,
  Cpu,
  File,
  FileText,
  Fingerprint,
  Globe,
  Globe2,
  Layers,
  Layout,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Agent, Category } from "@/types/app";
import { buildApiUrl } from "@/lib/api";

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

type AgentSaveProgress = {
  stage: string;
  detail?: string;
};

type OutletContext = {
  agents: Agent[];
  categories: Category[];
  onCreateAgent: (agent: Omit<Agent, "id" | "userId" | "created_at">, options?: { onProgress?: (progress: AgentSaveProgress) => void }) => Promise<boolean> | boolean;
  onUpdateAgent: (agentId: string, agent: Omit<Agent, "id" | "userId" | "created_at">, options?: { onProgress?: (progress: AgentSaveProgress) => void }) => Promise<boolean> | boolean;
  onCreateCategory: (categoryName: string) => Promise<Category | null> | Category | null;
};

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

const AgentEditorPage = () => {
  const navigate = useNavigate();
  const { agentEditId } = useParams<{ agentEditId?: string }>();
  const { agents, categories, onCreateAgent, onUpdateAgent, onCreateCategory } = useOutletContext<OutletContext>();
  const agentToEdit = useMemo(() => agents.find((agent) => agent.id === agentEditId) || null, [agents, agentEditId]);
  const isEditing = Boolean(agentToEdit);

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState("Bot");
  const [backgroundIcon, setBackgroundIcon] = useState("Bot");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [link, setLink] = useState("");
  const [extraLinks, setExtraLinks] = useState<{ label: string; url: string }[]>([]);
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

  useEffect(() => {
    if (agentEditId && !agentToEdit) {
      toast.error("Agente não encontrado para edição.");
      navigate("/app", { replace: true });
      return;
    }

    if (agentToEdit) {
      setTitle(agentToEdit.title);
      setInstructions(agentToEdit.instructions || "");
      setIcon(agentToEdit.icon || "Bot");
      setBackgroundIcon(agentToEdit.background_icon || agentToEdit.icon || "Bot");
      setLink(agentToEdit.link || "");
      setExtraLinks((agentToEdit as any).extra_links || []);
      setSelectedCategory(agentToEdit.category_ids?.[0] ? String(agentToEdit.category_ids[0]) : "");
      setShortcuts(Array.isArray(agentToEdit.shortcuts) && agentToEdit.shortcuts.length > 0 ? agentToEdit.shortcuts : ["Resumir docs", "Extrair cláusulas", "Analisar risco", "Dúvidas"]);
      setSavedAttachments((agentToEdit as any).attachments || []);
      setFiles([]);
    }
  }, [agentEditId, agentToEdit, navigate]);

  const addShortcut = () => {
    if (shortcutInput.trim() && shortcuts.length < 6) {
      setShortcuts((prev) => [...prev, shortcutInput.trim()]);
      setShortcutInput("");
    }
  };

  const removeShortcut = (index: number) => {
    setShortcuts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeSavedAttachment = (path: string) => {
    setSavedAttachments((prev) => prev.filter((item) => item !== path));
  };

  const addExtraLink = (urlValue: string, labelValue?: string) => {
    const trimmedUrl = urlValue.trim();
    if (!trimmedUrl) return;

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

    urls.forEach((url) => addExtraLink(url));
    setBulkLinksInput("");
  };

  const collectExtraLinksForSave = () => {
    const mergedLinks = [...extraLinks];

    const pushLink = (urlValue: string, labelValue?: string) => {
      const trimmedUrl = String(urlValue || "").trim();
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
          label: String(labelValue || "").trim() || buildLinkLabel(normalizedUrl),
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
    if (!newCategoryName.trim()) return;

    const createdCategory = await onCreateCategory(newCategoryName.trim());
    if (createdCategory) {
      setSelectedCategory(String(createdCategory.id));
      setNewCategoryName("");
      setIsCreatingCategoryInline(false);
    }
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    if (!title.trim() || !instructions.trim() || !selectedCategory) {
      toast.error("Preencha nome, categoria e instruções do agente.");
      return;
    }

    setIsSubmitting(true);
    setSaveProgress({
      stage: isEditing ? "Preparando atualização do agente..." : "Preparando criação do agente...",
      detail: "Validando dados e organizando fontes de conhecimento.",
    });

    const uploadedPaths = [...savedAttachments];
    const processedExtraLinks = collectExtraLinksForSave();

    for (const file of files) {
      try {
        setSaveProgress({
          stage: `Enviando anexo ${uploadedPaths.length - savedAttachments.length + 1} de ${files.length}`,
          detail: `Fazendo upload de ${file.name}.`,
        });

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(buildApiUrl("/api/agents/upload"), {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Falha no upload de ${file.name}`);
        }

        const data = await response.json();
        uploadedPaths.push(data.path);
      } catch (error) {
        console.error(error);
        toast.error(`Erro ao fazer upload de ${file.name}`);
        setIsSubmitting(false);
        setSaveProgress(null);
        return;
      }
    }

    const agentData = {
      title: title.trim(),
      role: isEditing ? agentToEdit?.role || undefined : undefined,
      description: isEditing ? agentToEdit?.description || "" : "",
      icon,
      background_icon: backgroundIcon,
      category_ids: selectedCategory ? [selectedCategory] : [],
      link: link.trim() || undefined,
      extra_links: processedExtraLinks,
      shortcuts,
      instructions: instructions.trim() || undefined,
      attachments: uploadedPaths,
    } as Omit<Agent, "id" | "userId" | "created_at">;

    const savedSuccessfully = isEditing && agentToEdit
      ? await onUpdateAgent(agentToEdit.id, agentData, { onProgress: (progress) => setSaveProgress(progress) })
      : await onCreateAgent(agentData, { onProgress: (progress) => setSaveProgress(progress) });

    setIsSubmitting(false);
    setSaveProgress(null);

    if (!savedSuccessfully) {
      return;
    }

    navigate("/app", { replace: true });
  };

  const SelectedIcon = (iconOptions.find((option) => option.name === icon)?.icon || Bot) as React.ElementType;
  const SelectedBackgroundIcon = (iconOptions.find((option) => option.name === backgroundIcon)?.icon || Bot) as React.ElementType;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/88 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">Processando base de conhecimento</h3>
                <p className="mt-1 text-sm text-slate-500">O agente só é salvo depois que links e anexos terminarem de ser processados.</p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{saveProgress?.stage || "Processando..."}</div>
              <div className="mt-1 text-sm text-slate-600">{saveProgress?.detail || "Aguarde enquanto o treinamento é finalizado."}</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{isEditing ? "Editar Especialista" : "Criar Novo Especialista"}</h1>
          <p className="mt-1 text-sm text-slate-500">Editor em página dedicada para evitar corte na pré-visualização e manter o fluxo completo.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <Label className="flex items-center gap-2 text-sm font-medium text-indigo-700">
              <Layers className="h-4 w-4 text-indigo-500" />
              Categoria <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-slate-500">Escolha a categoria do especialista ou crie uma nova sem sair da página.</p>
            <div className="flex gap-2">
              <Select value={selectedCategory || "none"} onValueChange={(value) => setSelectedCategory(value === "none" ? "" : value)}>
                <SelectTrigger className="w-full border-indigo-200 bg-white focus:border-indigo-500 focus:ring-indigo-500/20">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" className="shrink-0 border-indigo-200 text-indigo-700" onClick={() => setIsCreatingCategoryInline((prev) => !prev)}>
                <Plus className="mr-1 h-4 w-4" />
                Nova
              </Button>
            </div>
            {isCreatingCategoryInline && (
              <div className="flex gap-2 pt-2">
                <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ex: Direito de Família" className="border-indigo-200 bg-white focus:border-indigo-500 focus:ring-indigo-500/20" />
                <Button type="button" onClick={() => void handleCreateCategoryInline()} disabled={!newCategoryName.trim()}>Criar</Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-slate-700">Nome do Agente <span className="text-red-500">*</span></Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Processo Adm. Previdenciário" className="border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Ícone Principal</Label>
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              {iconOptions.slice(0, 10).map((option) => {
                const IconComp = option.icon;
                return (
                  <Button key={option.name} type="button" variant={icon === option.name ? "default" : "outline"} size="icon" onClick={() => setIcon(option.name)} className={`h-10 w-10 rounded-lg ${icon === option.name ? "border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600"}`}>
                    <IconComp className="h-5 w-5" />
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Ícone de Fundo</Label>
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              {iconOptions.slice(0, 10).map((option) => {
                const IconComp = option.icon;
                return (
                  <Button key={`bg-${option.name}`} type="button" variant={backgroundIcon === option.name ? "default" : "outline"} size="icon" onClick={() => setBackgroundIcon(option.name)} className={`h-10 w-10 rounded-lg ${backgroundIcon === option.name ? "border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600"}`}>
                    <IconComp className="h-5 w-5" />
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <Label htmlFor="link" className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Link2 className="h-4 w-4 text-indigo-500" />
              Link de Abertura Externa
            </Label>
            <Input id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://exemplo.com/recurso" className="border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" />
          </div>

          <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Globe className="h-4 w-4 text-indigo-500" />
              Links para a IA Processar
            </Label>
            <p className="text-xs text-slate-500">Links e PDFs web adicionados aqui entram no processamento e na base do agente.</p>
            {extraLinks.length > 0 && (
              <div className="mb-2 flex flex-col gap-1.5">
                {extraLinks.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs">
                    <Link2 className="h-3 w-3 flex-shrink-0 text-indigo-500" />
                    <span className="truncate font-medium text-indigo-800">{item.label}</span>
                    <span className="flex-1 truncate text-indigo-400">{item.url}</span>
                    <button type="button" className="ml-1 text-indigo-400 hover:text-red-600" onClick={() => setExtraLinks((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-600">Colar vários links de uma vez</Label>
              <Textarea value={bulkLinksInput} onChange={(e) => setBulkLinksInput(e.target.value)} placeholder="Cole um link por linha" className="min-h-[96px] resize-y border-slate-200 bg-white focus:border-indigo-500 focus:ring-indigo-500/20" />
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handleAddBulkLinks} disabled={!bulkLinksInput.trim()}>Adicionar lista</Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Nome do link (opcional)" className="flex-1 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" />
              <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://..." className="flex-1 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" />
              <Button type="button" variant="outline" size="icon" disabled={!newLinkUrl.trim()} onClick={handleAddSingleLink}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <Label htmlFor="instructions" className="text-sm font-medium text-slate-700">Instrução de Sistema <span className="text-red-500">*</span></Label>
            <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Descreva detalhadamente como o agente deve se comportar..." className="min-h-[120px] border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Arquivos Complementares</Label>
            <div className="group relative cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 transition-all hover:border-indigo-300 hover:bg-indigo-50/50">
              <input type="file" multiple className="absolute inset-0 z-10 cursor-pointer opacity-0" onChange={handleFileChange} accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png" />
              <div className="flex flex-col items-center justify-center gap-2 text-slate-500 transition-colors group-hover:text-indigo-600">
                <Upload className="h-5 w-5" />
                <span className="text-xs font-medium">Clique ou arraste para anexar</span>
              </div>
            </div>
            {(savedAttachments.length > 0 || files.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {savedAttachments.map((path) => (
                  <div key={path} className="flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700">
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[100px] truncate">{path.split("/").pop()}</span>
                    <button type="button" onClick={() => removeSavedAttachment(path)} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
                    <File className="h-3 w-3 text-indigo-500" />
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button type="button" onClick={() => removeFile(index)} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Atalhos (Máx. 6)</Label>
            <div className="mb-2 flex gap-2">
              <Input value={shortcutInput} onChange={(e) => setShortcutInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addShortcut())} placeholder="Ex: Gerar relatório" className="border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" />
              <Button type="button" variant="outline" onClick={addShortcut} disabled={shortcuts.length >= 6 || !shortcutInput.trim()}>Add</Button>
            </div>
            {shortcuts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut, index) => (
                  <div key={`${shortcut}-${index}`} className="flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700">
                    <span>{shortcut}</span>
                    <button type="button" onClick={() => removeShortcut(index)} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button onClick={() => void handleSave()} className="bg-slate-900 px-8 text-white hover:bg-slate-800">
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processando conteúdo...</span>
              ) : isEditing ? "Salvar Alterações" : "Salvar Agente"}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Pré-visualização</h3>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/40" />
              <div className="pointer-events-none absolute -bottom-6 -right-6 z-0 opacity-[0.05]">
                <SelectedBackgroundIcon className="h-48 w-48 text-slate-900" />
              </div>
              <div className="relative z-10">
                <div className="mb-4">
                  <div className="inline-flex rounded-xl bg-slate-900 p-3 text-white shadow-sm">
                    <SelectedIcon className="h-6 w-6" />
                  </div>
                </div>
                <h4 className="line-clamp-2 text-xl font-bold text-slate-900">{title || "Nome do Agente"}</h4>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <Sparkles className="h-4 w-4" />
              Dica Pro
            </div>
            <p className="text-xs leading-relaxed text-indigo-600/80">Quanto mais detalhada a instrução do sistema, melhor o agente se comporta. Links e anexos adicionados aqui são enviados para processamento e indexação ao salvar.</p>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Brain className="h-4 w-4 text-indigo-600" />
              O que é processado no salvamento
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Links extras: leitura e conversão em arquivos de conhecimento.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Arquivos anexados: upload, extração textual e reindexação do agente.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Atalhos e instruções: aplicados diretamente na experiência do chat.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AgentEditorPage;
