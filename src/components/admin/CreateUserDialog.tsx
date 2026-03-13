import React, { useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserSchema, type CreateUserInput } from "@/lib/validations";
import { calculateAgeFromBirthDate, formatCep, lookupBrazilianCep, parsePracticeAreas } from "@/lib/userProfile";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateUserInput) => Promise<boolean> | boolean;
}

const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [password, setPassword] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [practiceAreasInput, setPracticeAreasInput] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [regiao, setRegiao] = useState("");
  const [planType, setPlanType] = useState<'basic' | 'premium' | 'enterprise'>('basic');
  const [lifetimeAccess, setLifetimeAccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [sexo, setSexo] = useState<'feminino' | 'masculino' | 'outro' | 'prefiro_nao_informar'>('prefiro_nao_informar');
  const [dataNascimento, setDataNascimento] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);

  const idade = useMemo(() => calculateAgeFromBirthDate(dataNascimento), [dataNascimento]);

  const resetForm = () => {
    setEmail("");
    setFullName("");
    setPassword("");
    setRole('user');
    setDocumento("");
    setTelefone("");
    setPracticeAreasInput("");
    setCep("");
    setLogradouro("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setCidade("");
    setEstado("");
    setRegiao("");
    setPlanType('basic');
    setLifetimeAccess(false);
    setExpiresAt("");
    setSexo('prefiro_nao_informar');
    setDataNascimento("");
    setShowPassword(false);
  };

  const handleCepLookup = async (targetCep: string = cep) => {
    if (targetCep.replace(/\D/g, '').length !== 8) {
      return;
    }

    setIsLookingUpCep(true);

    try {
      const result = await lookupBrazilianCep(targetCep);
      setCep(result.cep);
      setLogradouro(result.logradouro);
      setBairro(result.bairro);
      setCidade(result.cidade);
      setEstado(result.estado);
      setRegiao(result.regiao);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível consultar o CEP.');
    } finally {
      setIsLookingUpCep(false);
    }
  };

  const handleSave = async () => {
    if (idade === null) {
      toast.error("Informe uma data de nascimento válida.");
      return;
    }

    // Validação com Zod
    const result = createUserSchema.safeParse({
      email: email.trim(),
      password: password,
      fullName: fullName.trim(),
      role: role,
      documento: documento.trim(),
      telefone: telefone.trim(),
      practiceAreas: parsePracticeAreas(practiceAreasInput),
      cep: cep.trim(),
      logradouro: logradouro.trim(),
      numero: numero.trim(),
      complemento: complemento.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      estado: estado.trim().toUpperCase(),
      regiao: regiao.trim(),
      planType,
      lifetimeAccess,
      expiresAt: expiresAt.trim(),
      sexo,
      dataNascimento,
      idade,
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    const saved = await onSave(result.data);
    if (!saved) {
      return;
    }

    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[720px] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">Adicionar Novo Usuário</DialogTitle>
          <DialogDescription className="text-slate-500 mt-1.5">
            Preencha o cadastro completo. O usuário será criado manualmente pelo admin e poderá acessar com a senha definida aqui.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium text-slate-700">
              Nome Completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do usuário"
              autoComplete="name"
              className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="documento" className="text-sm font-medium text-slate-700">
                CPF <span className="text-red-500">*</span>
              </Label>
              <Input
                id="documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone" className="text-sm font-medium text-slate-700">
                WhatsApp <span className="text-red-500">*</span>
              </Label>
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="practiceAreas" className="text-sm font-medium text-slate-700">
              Quais Ramos Atua? <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="practiceAreas"
              value={practiceAreasInput}
              onChange={(e) => setPracticeAreasInput(e.target.value)}
              placeholder="Ex: Previdenciário, Trabalhista, Cível"
              className="min-h-[88px] w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
            <p className="text-xs text-slate-500">Separe por vírgula ou uma linha por ramo.</p>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataNascimento" className="text-sm font-medium text-slate-700">
                Data de Nascimento <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dataNascimento"
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idade" className="text-sm font-medium text-slate-700">
                Idade
              </Label>
              <Input
                id="idade"
                value={idade ?? ""}
                readOnly
                placeholder="Calculada automaticamente"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sexo" className="text-sm font-medium text-slate-700">
              Sexo <span className="text-red-500">*</span>
            </Label>
            <Select value={sexo} onValueChange={(value: 'feminino' | 'masculino' | 'outro' | 'prefiro_nao_informar') => setSexo(value)}>
              <SelectTrigger className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20">
                <SelectValue placeholder="Selecione o sexo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
                <SelectItem value="prefiro_nao_informar">Prefiro não informar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MapPin className="h-4 w-4 text-indigo-600" />
              Região e Endereço
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cep" className="text-sm font-medium text-slate-700">
                  CEP <span className="text-red-500">*</span>
                  {isLookingUpCep && <Loader2 className="ml-2 h-4 w-4 inline animate-spin" />}
                </Label>
                <Input
                  id="cep"
                  value={cep}
                  onChange={(e) => {
                    const formatted = formatCep(e.target.value);
                    setCep(formatted);
                    if (formatted.replace(/\D/g, '').length === 8) {
                      void handleCepLookup(formatted);
                    }
                  }}
                  onBlur={() => void handleCepLookup(cep)}
                  placeholder="00000-000"
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logradouro" className="text-sm font-medium text-slate-700">
                Endereço <span className="text-red-500">*</span>
              </Label>
              <Input
                id="logradouro"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
                placeholder="Rua, avenida ou logradouro"
                className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero" className="text-sm font-medium text-slate-700">
                  Número <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="123"
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="complemento" className="text-sm font-medium text-slate-700">
                  Complemento
                </Label>
                <Input
                  id="complemento"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  placeholder="Apto, sala, bloco..."
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bairro" className="text-sm font-medium text-slate-700">
                  Bairro <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cidade" className="text-sm font-medium text-slate-700">
                  Cidade <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estado" className="text-sm font-medium text-slate-700">
                  UF <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value.toUpperCase())}
                  maxLength={2}
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regiao" className="text-sm font-medium text-slate-700">
                  Região <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="regiao"
                  value={regiao}
                  onChange={(e) => setRegiao(e.target.value)}
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="text-sm font-medium text-slate-700">Plano e acesso</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="planType" className="text-sm font-medium text-slate-700">
                  Plano <span className="text-red-500">*</span>
                </Label>
                <Select value={planType} onValueChange={(value: 'basic' | 'premium' | 'enterprise') => setPlanType(value)}>
                  <SelectTrigger id="planType" className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20">
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresAt" className="text-sm font-medium text-slate-700">
                  Expira em {!lifetimeAccess && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={lifetimeAccess}
                  className="w-full transition-all border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Acesso vitalício</div>
                <div className="text-xs text-slate-500">Mantém o usuário ativo sem data de expiração.</div>
              </div>
              <Switch checked={lifetimeAccess} onCheckedChange={setLifetimeAccess} />
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
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-800 hover:bg-slate-200/50">
            Cancelar
          </Button>
          <Button 
            onClick={() => void handleSave()}
            disabled={!email.trim() || !password.trim() || !fullName.trim()}
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
