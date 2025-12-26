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
import { Agent, Category } from "@/types/app";

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
  const [icon, setIcon] = useState("Bot");
  const [link, setLink] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (agentToEdit) {
      setTitle(agentToEdit.title);
      setDescription(agentToEdit.description);
      setIcon(agentToEdit.icon);
      setLink(agentToEdit.link || "");
      setSelectedCategory(agentToEdit.category_ids[0] || undefined);
    } else {
      setTitle("");
      setDescription("");
      setIcon("Bot");
      setLink("");
      setSelectedCategory(undefined);
    }
  }, [agentToEdit]);

  const handleSave = () => {
    if (agentToEdit && title.trim() && description.trim() && icon && selectedCategory) {
      onSave(agentToEdit.id, {
        title: title.trim(),
        description: description.trim(),
        icon,
        category_ids: [selectedCategory],
        link: link.trim() || undefined,
      });
      onClose();
    }
  };

  const SelectedIconComponent: LucideIcon | undefined = LucideIcons[icon as keyof typeof LucideIcons] as LucideIcon | undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Agente</DialogTitle>
          <DialogDescription>
            Altere os detalhes do agente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Título
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Descrição
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="icon" className="text-right">
              Ícone
            </Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger className="col-span-3">
                {SelectedIconComponent ? (
                  <div className="flex items-center gap-2">
                    <SelectedIconComponent className="h-4 w-4" />
                    <span>{icon}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Selecione um ícone</span>
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
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="link" className="text-right">
              Link (URL)
            </Label>
            <Input
              id="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Ex: https://www.exemplo.com"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">
              Categoria
            </Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecione uma categoria" />
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
