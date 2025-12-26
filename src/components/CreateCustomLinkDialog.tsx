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

interface CreateCustomLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, url: string, displayOrder: number) => void;
}

const CreateCustomLinkDialog: React.FC<CreateCustomLinkDialogProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);

  const handleSave = () => {
    if (title.trim() && url.trim()) {
      onSave(title.trim(), url.trim(), displayOrder);
      setTitle("");
      setUrl("");
      setDisplayOrder(0);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Link Personalizado</DialogTitle>
          <DialogDescription>
            Insira o título, a URL e a ordem de exibição para o seu link.
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
            <Label htmlFor="url" className="text-right">
              URL
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ex: https://www.exemplo.com"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="displayOrder" className="text-right">
              Ordem
            </Label>
            <Input
              id="displayOrder"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar Link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCustomLinkDialog;
