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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserSchema } from "@/lib/validations";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (email: string, firstName: string, lastName: string, role: 'user' | 'admin', password: string) => void;
}

const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSave = () => {
    // Validação com Zod
    const result = createUserSchema.safeParse({
      email: email.trim(),
      password: password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role,
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    onSave(
      result.data.email,
      result.data.firstName,
      result.data.lastName,
      result.data.role,
      result.data.password
    );
    
    setEmail("");
    setFirstName("");
    setLastName("");
    setPassword("");
    setRole('user');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">Adicionar Novo Usuário</DialogTitle>
          <DialogDescription className="text-slate-500 mt-1.5">
            Preencha os detalhes para criar uma nova conta. O usuário poderá fazer login imediatamente.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              autoComplete="email"
              className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-slate-700">
              Senha <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                Nome
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="João"
                autoComplete="given-name"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                Sobrenome
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Silva"
                autoComplete="family-name"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium text-slate-700">
              Papel <span className="text-red-500">*</span>
            </Label>
            <Select value={role} onValueChange={(value: 'user' | 'admin') => setRole(value)}>
              <SelectTrigger className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user" className="cursor-pointer">Usuário</SelectItem>
                <SelectItem value="admin" className="cursor-pointer">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5">✅</span>
            <span>O usuário será criado com a senha definida e poderá fazer login imediatamente.</span>
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-800 hover:bg-slate-200/50">
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!email.trim() || !password.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
          >
            Adicionar Usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;
