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
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">Adicionar Novo Link</DialogTitle>
          <DialogDescription className="text-slate-500 mt-1.5">
            Insira o título, a URL e a ordem de exibição para o seu link.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-slate-700">
              Título <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Meu Site"
              className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium text-slate-700">
              URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ex: https://www.exemplo.com"
              className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="displayOrder" className="text-sm font-medium text-slate-700">
              Ordem de Exibição
            </Label>
            <Input
              id="displayOrder"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-800 hover:bg-slate-200/50">
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!title.trim() || !url.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
          >
            Salvar Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCustomLinkDialog;
