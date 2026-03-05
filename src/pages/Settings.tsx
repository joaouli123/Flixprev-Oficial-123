import React, { useState, useEffect } from "react";
import { useSession } from "@/components/SessionContextProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseAuth } from "@/lib/neon"
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const splitFullName = (value: string): { firstName: string | null; lastName: string | null } => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const Settings: React.FC = () => {
  const { session, profile } = useSession();

  const [fullName, setFullName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(profile?.avatar_url || null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Estados para troca de senha
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      const profileName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
      setFullName((prev) => prev || profileName);
      setAvatarPreviewUrl(profile.avatar_url || null);
    }
  }, [profile]);

  useEffect(() => {
    if (session?.user?.email) {
      setBillingEmail((prev) => prev || session.user.email || "");
    }
  }, [session?.user?.email]);

  useEffect(() => {
    const fetchBillingInfo = async () => {
      if (!session?.user?.id) return;

      const { data, error } = await supabaseAuth
        .from("usuarios")
        .select("nome_completo, email, documento, telefone")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar dados de faturamento:", error);
        return;
      }

      if (data) {
        setFullName(data.nome_completo || "");
        setBillingEmail(data.email || session.user.email || "");
        setDocumento(data.documento || "");
        setTelefone(data.telefone || "");
      }
    };

    fetchBillingInfo();
  }, [session?.user?.id]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreviewUrl(URL.createObjectURL(file));
    } else {
      setAvatarFile(null);
      if (!profile?.avatar_url) {
        setAvatarPreviewUrl(null);
      }
    }
  };

  const handleSaveProfile = async () => {
    if (!session?.user?.id) {
      toast.error("Você precisa estar logado para salvar as configurações do perfil.");
      return;
    }

    if (!billingEmail.trim()) {
      toast.error("Informe um e-mail válido para salvar as configurações.");
      return;
    }

    setIsSavingProfile(true);

    const trimmedFullName = fullName.trim();

    const { error: usuariosError } = await supabaseAuth
      .from('usuarios')
      .upsert(
        {
          user_id: session.user.id,
          nome_completo: trimmedFullName || null,
          email: billingEmail.trim().toLowerCase(),
          documento: documento.trim() || null,
          telefone: telefone.trim() || null,
        },
        { onConflict: 'user_id' }
      );

    if (usuariosError) {
      toast.error("Erro ao salvar perfil: " + (usuariosError?.message || "falha desconhecida"));
      console.error("Erro ao salvar perfil:", usuariosError);
    } else {
      toast.success("Configurações atualizadas com sucesso!");
      setAvatarFile(null);
    }
    setIsSavingProfile(false);
  };

  const handleChangePassword = async () => {
    if (!session) {
      toast.error("Você precisa estar logado para trocar a senha.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setIsSavingPassword(true);

    try {
      const { error } = await supabaseAuth.auth.updateUser({
        password: newPassword
      });

      if (error) {
        toast.error("Erro ao trocar a senha: " + error.message);
      } else {
        toast.success("Senha atualizada com sucesso!");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (error: any) {
      toast.error("Erro ao trocar a senha: " + error.message);
    }
    setIsSavingPassword(false);
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Configurações</h1>
        <p className="text-gray-500">Gerencie suas preferências e segurança da conta.</p>
      </div>

      {/* Seção de Configurações do Perfil do Usuário */}
      <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <CardTitle className="text-xl font-semibold text-gray-900">Informações Pessoais</CardTitle>
          <CardDescription className="text-gray-500">
            Atualize seus detalhes pessoais e foto de perfil.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex-shrink-0 flex flex-col items-center gap-3">
              <div className="relative group">
                {avatarPreviewUrl ? (
                  <img src={avatarPreviewUrl} alt="Avatar Preview" className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-md" />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-indigo-50 border-4 border-white shadow-md flex items-center justify-center text-indigo-500">
                    <span className="text-2xl font-semibold">{fullName?.charAt(0) || 'U'}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <label htmlFor="avatarUpload" className="cursor-pointer text-white text-xs font-medium">Alterar</label>
                </div>
              </div>
              {avatarPreviewUrl && (
                <Button variant="ghost" size="sm" onClick={() => { setAvatarFile(null); setAvatarPreviewUrl(null); }} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 text-xs">
                  Remover foto
                </Button>
              )}
            </div>
            
            <div className="flex-grow w-full space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-gray-700">Nome Completo</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billingEmail" className="text-gray-700">E-mail</Label>
                  <Input
                    id="billingEmail"
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="documento" className="text-gray-700">CPF/CNPJ</Label>
                  <Input
                    id="documento"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone" className="text-gray-700">Telefone</Label>
                  <Input
                    id="telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2 hidden">
                <Input
                  id="avatarUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
              {isSavingProfile ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Seção de Troca de Senha */}
      <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex flex-row items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold text-gray-900">Segurança</CardTitle>
            <CardDescription className="text-gray-500">
              Altere sua senha de acesso.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-gray-700">Nova Senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-700">Confirmar Nova Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
              />
            </div>
          </div>
          
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500 flex-1">
              <span className="font-medium text-amber-600">Atenção:</span> Após a troca de senha, você precisará fazer login novamente.
            </p>
            <Button 
              onClick={handleChangePassword} 
              disabled={isSavingPassword || newPassword.length < 6 || newPassword !== confirmPassword} 
              className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white shadow-sm"
            >
              {isSavingPassword ? "Atualizando..." : "Atualizar Senha"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
