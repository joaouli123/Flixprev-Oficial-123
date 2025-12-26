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
import { CustomLink } from "@/types/app";

interface EditCustomLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (linkId: string, title: string, url: string, displayOrder: number) => void;
  linkToEdit: CustomLink | null;
}

const EditCustomLinkDialog: React.FC<EditCustomLinkDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  linkToEdit,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);

  useEffect(() => {
    if (linkToEdit) {
      setTitle(linkToEdit.title);
      setUrl(linkToEdit.url);
      setDisplayOrder(linkToEdit.display_order);
    } else {
      setTitle("");
      setUrl("");
      setDisplayOrder(0);
    }
  }, [linkToEdit]);

  const handleSave = () => {
    if (linkToEdit && title.trim() && url.trim()) {
      onSave(linkToEdit.id, title.trim(), url.trim(), displayOrder);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Link Personalizado</DialogTitle>
          <DialogDescription>
            Altere os detalhes do seu link personalizado.
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
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomLinkDialog;
