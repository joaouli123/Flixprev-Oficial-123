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

interface Tutorial {
  id: string;
  title: string;
  url: string;
  display_order: number;
}

interface EditTutorialDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tutorialId: string, title: string, url: string, order: number) => void;
  tutorialToEdit: Tutorial | null;
}

const EditTutorialDialog: React.FC<EditTutorialDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  tutorialToEdit,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [order, setOrder] = useState(0);

  useEffect(() => {
    if (tutorialToEdit) {
      setTitle(tutorialToEdit.title);
      setUrl(tutorialToEdit.url);
      setOrder(tutorialToEdit.display_order);
    } else {
      setTitle("");
      setUrl("");
      setOrder(0);
    }
  }, [tutorialToEdit]);

  const handleSave = () => {
    if (tutorialToEdit && title.trim() && url.trim()) {
      onSave(tutorialToEdit.id, title.trim(), url.trim(), order);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Tutorial</DialogTitle>
          <DialogDescription>
            Altere os detalhes do tutorial.
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
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTutorialDialog;
