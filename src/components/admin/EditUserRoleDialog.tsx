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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Papel do Usuário</DialogTitle>
          <DialogDescription>
            Altere o papel de {userToEdit?.email}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Papel
            </Label>
            <Select value={newRole} onValueChange={(value: 'user' | 'admin') => setNewRole(value)}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
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

export default EditUserRoleDialog;
