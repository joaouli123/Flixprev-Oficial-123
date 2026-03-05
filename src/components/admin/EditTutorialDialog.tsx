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
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-white/20 shadow-2xl">
        <DialogHeader className="px-6 py-5 border-b border-gray-100/50 bg-white/50">
          <DialogTitle className="text-xl font-semibold text-gray-800">Editar Tutorial</DialogTitle>
          <DialogDescription className="text-sm text-gray-500 mt-1">
            Altere os detalhes do tutorial.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-gray-700">
              Título
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/50 border-gray-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium text-gray-700">
              URL do YouTube
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ex: https://www.youtube.com/watch?v=VIDEO_ID"
              className="w-full bg-white/50 border-gray-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order" className="text-sm font-medium text-gray-700">
              Ordem
            </Label>
            <Input
              id="order"
              type="number"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
              className="w-full bg-white/50 border-gray-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t border-gray-100/50 bg-gray-50/50 sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20">
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTutorialDialog;
