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
import { Category } from "@/types/app";

interface EditCategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (categoryId: string, newName: string) => void;
  categoryToEdit: Category | null;
}

const EditCategoryDialog: React.FC<EditCategoryDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  categoryToEdit,
}) => {
  const [categoryName, setCategoryName] = useState("");

  useEffect(() => {
    if (categoryToEdit) {
      setCategoryName(categoryToEdit.name);
    } else {
      setCategoryName("");
    }
  }, [categoryToEdit]);

  const handleSave = () => {
    if (categoryToEdit && categoryName.trim()) {
      onSave(categoryToEdit.id, categoryName.trim());
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">Editar Categoria</DialogTitle>
          <DialogDescription className="text-slate-500 mt-1.5">
            Altere o nome da sua categoria.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-slate-700">
              Nome da Categoria <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Ex: Vendas, Suporte, Marketing..."
              className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              autoFocus
            />
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-800 hover:bg-slate-200/50">
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!categoryName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
          >
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCategoryDialog;
