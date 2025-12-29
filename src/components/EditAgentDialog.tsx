import React, { useState, useEffect } from "react";
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
import * as LucideIcons from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { Upload, X, FileText, File } from "lucide-react";
import { Agent, Category } from "@/types/app";
import { toast } from "sonner";

interface EditAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agentId: string, updatedAgent: Omit<Agent, "id" | "userId" | "created_at">) => void;
  agentToEdit: Agent | null;
  categories: Category[];
}

const iconOptions = Object.keys(LucideIcons).filter(name => {
  const icon = LucideIcons[name as keyof typeof LucideIcons];
  return typeof icon === 'function' && (icon as any).$$typeof === Symbol.for('react.forward_ref');
});

const EditAgentDialog: React.FC<EditAgentDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  agentToEdit,
  categories,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState("Bot");
  const [link, setLink] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<string[]>([]);

  useEffect(() => {
    if (agentToEdit) {
      setTitle(agentToEdit.title);
      setDescription(agentToEdit.description);
      setInstructions(agentToEdit.instructions || "");
      setIcon(agentToEdit.icon);
      setLink(agentToEdit.link || "");
      
      // Ensure selectedCategory is set correctly from category_ids
      const categoryId = agentToEdit.category_ids?.[0];
      if (categoryId) {
        setSelectedCategory(String(categoryId));
      } else {
        setSelectedCategory(undefined);
      }
      
      setSavedAttachments((agentToEdit as any).attachments || []);
      setFiles([]);
    } else {
      setTitle("");
      setDescription("");
      setInstructions("");
      setIcon("Bot");
      setLink("");
      setSelectedCategory(undefined);
      setSavedAttachments([]);
      setFiles([]);
    }
  }, [agentToEdit]);

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

  const handleSave = async () => {
    if (!selectedCategory) {
      toast.error("Por favor, selecione uma categoria para o agente.");
      return;
    }

    if (agentToEdit && title.trim() && description.trim() && icon) {
      // Upload new files first
      let uploadedPaths: string[] = [...savedAttachments];
      
      if (files.length > 0) {
        for (const file of files) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("agentId", agentToEdit.id);
            
            const response = await fetch("/api/agents/upload", {
              method: "POST",
              body: formData,
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log("[EDIT] Upload response:", data);
              if (data.path) {
                uploadedPaths.push(data.path);
                toast.success(`${file.name} anexado com sucesso!`);
              }
            } else {
              const error = await response.text();
              console.error("[EDIT] Upload failed:", error);
              toast.error(`Erro ao fazer upload de ${file.name}`);
            }
          } catch (err) {
            console.error("Erro ao fazer upload do arquivo:", err);
            toast.error(`Erro ao fazer upload de ${file.name}`);
          }
        }
      }

      console.log("[EDIT] Salvando agente com attachments:", uploadedPaths);
      onSave(agentToEdit.id, {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim() || undefined,
        icon,
        category_ids: [selectedCategory],
        attachments: uploadedPaths,
        link: link.trim() || undefined,
      });
      onClose();
    }
  };

  const SelectedIconComponent: LucideIcon | undefined = LucideIcons[icon as keyof typeof LucideIcons] as LucideIcon | undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Agente IA</DialogTitle>
          <DialogDescription>
            Altere a personalidade e configurações do seu assistente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Nome do Agente</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Descrição Curta</Label>
            <Textarea
              id="description"
              placeholder="Uma breve descrição do agente..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="instructions">Instruções do Sistema (Prompt / Instruções)</Label>
            <Textarea
              id="instructions"
              placeholder="Descreva detalhadamente como o agente deve se comportar..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[100px]"
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
                    <button onClick={() => removeFile(index)} className="hover:text-red-500" type="button">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="icon">Ícone</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger>
                  {SelectedIconComponent ? (
                    <div className="flex items-center gap-2">
                      <SelectedIconComponent className="h-4 w-4" />
                      <span>{icon}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Selecione</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map((iconName) => {
                    const IconComponent: LucideIcon | undefined = LucideIcons[iconName as keyof typeof LucideIcons] as LucideIcon | undefined;
                    return (
                      <SelectItem key={iconName} value={iconName}>
                        <div className="flex items-center gap-2">
                          {IconComponent && <IconComponent className="h-4 w-4" />}
                          {iconName}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Categoria</Label>
            <Select 
              value={selectedCategory} 
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria">
                  {categories.find(c => c.id === selectedCategory)?.name || "Selecione uma categoria"}
                </SelectValue>
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
            <Label htmlFor="link">Link (URL)</Label>
            <Input
              id="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Ex: https://www.exemplo.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditAgentDialog;
