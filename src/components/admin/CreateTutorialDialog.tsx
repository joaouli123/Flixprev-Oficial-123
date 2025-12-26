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

interface CreateTutorialDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, url: string, order: number) => void;
}

const CreateTutorialDialog: React.FC<CreateTutorialDialogProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [order, setOrder] = useState(0);

  const handleSave = () => {
    if (title.trim() && url.trim()) {
      onSave(title.trim(), url.trim(), order);
      setTitle("");
      setUrl("");
      setOrder(0);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Tutorial</DialogTitle>
          <DialogDescription>
            Insira o título e o link do vídeo do YouTube para o tutorial.
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
              URL do YouTube
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ex: https://www.youtube.com/watch?v=VIDEO_ID"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="order" className="text-right">
              Ordem
            </Label>
            <Input
              id="order"
              type="number"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar Tutorial</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTutorialDialog;
