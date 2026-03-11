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

interface CreateTutorialDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, description: string, url: string, order: number) => void;
}

const CreateTutorialDialog: React.FC<CreateTutorialDialogProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [order, setOrder] = useState(0);

  const handleSave = () => {
    if (title.trim() && url.trim()) {
      onSave(title.trim(), description.trim(), url.trim(), order);
      setTitle("");
      setDescription("");
      setUrl("");
      setOrder(0);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-white/20 shadow-2xl">
        <DialogHeader className="px-6 py-5 border-b border-gray-100/50 bg-white/50">
          <DialogTitle className="text-xl font-semibold text-gray-800">Adicionar Novo Tutorial</DialogTitle>
          <DialogDescription className="text-sm text-gray-500 mt-1">
            Insira o título e o link do vídeo do YouTube para o tutorial.
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
              placeholder="Ex: Como usar o sistema"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium text-gray-700">
              Descrição
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resumo curto do que o usuário vai aprender neste vídeo"
              className="min-h-28 w-full bg-white/50 border-gray-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
            Salvar Tutorial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTutorialDialog;
