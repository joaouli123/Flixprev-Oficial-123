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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminUser } from "@/types/app";

interface EditUserRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userId: string, newRole: 'user' | 'admin') => void;
  userToEdit: AdminUser | null;
}

const EditUserRoleDialog: React.FC<EditUserRoleDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  userToEdit,
}) => {
  const [newRole, setNewRole] = useState<'user' | 'admin'>(userToEdit?.role || 'user');

  useEffect(() => {
    if (userToEdit) {
      setNewRole(userToEdit.role);
    }
  }, [userToEdit]);

  const handleSave = () => {
    if (userToEdit && newRole) {
      onSave(userToEdit.id, newRole);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">Editar Papel do Usuário</DialogTitle>
          <DialogDescription className="text-slate-500 mt-1.5">
            Altere o papel de <span className="font-medium text-slate-700">{userToEdit?.email}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium text-slate-700">
              Papel <span className="text-red-500">*</span>
            </Label>
            <Select value={newRole} onValueChange={(value: 'user' | 'admin') => setNewRole(value)}>
              <SelectTrigger className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user" className="cursor-pointer">Usuário</SelectItem>
                <SelectItem value="admin" className="cursor-pointer">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-800 hover:bg-slate-200/50">
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
          >
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserRoleDialog;
