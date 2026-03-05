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
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">Editar Link Personalizado</DialogTitle>
          <DialogDescription className="text-slate-500 mt-1.5">
            Altere os detalhes do seu link personalizado.
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
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomLinkDialog;
