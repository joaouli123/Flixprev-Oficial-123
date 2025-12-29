import React, { useState, useEffect } from "react";
import { useSession } from "@/components/SessionContextProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { neon } from "@/lib/neon"
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const Settings: React.FC = () => {
  const { session, profile } = useSession();

  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(profile?.avatar_url || null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Estados para troca de senha
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setAvatarPreviewUrl(profile.avatar_url || null);
    }
  }, [profile]);

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

    setIsSavingProfile(true);

    const { error: updateError } = await neon
      .from('profiles')
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        avatar_url: avatarPreviewUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)
      .execute();

    if (updateError) {
      toast.error("Erro ao salvar perfil: " + updateError.message);
      console.error("Erro ao salvar perfil:", updateError);
    } else {
      toast.success("Perfil atualizado com sucesso!");
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
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          newPassword: newPassword,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        toast.error("Erro ao trocar a senha: " + (data.error || 'Erro desconhecido'));
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
    <div className="bg-background text-foreground p-6 min-h-full">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Configurações</h1>

        {/* Seção de Configurações do Perfil do Usuário */}
        <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-2xl font-semibold">Gerenciar suas informações</CardTitle>
            <CardDescription className="text-muted-foreground">
              Atualize seus detalhes pessoais e preferências.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Primeiro Nome</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Sobrenome</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatarUpload">Avatar</Label>
              <div className="flex items-center gap-4">
                {avatarPreviewUrl && (
                  <img src={avatarPreviewUrl} alt="Avatar Preview" className="h-20 w-20 rounded-full object-cover border border-border" />
                )}
                <Input
                  id="avatarUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="flex-grow"
                />
                {avatarPreviewUrl && (
                  <Button variant="outline" size="sm" onClick={() => { setAvatarFile(null); setAvatarPreviewUrl(null); }}>
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Faça upload de uma imagem para seu avatar.</p>
            </div>
            <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="w-full md:w-auto">
              {isSavingProfile ? "Salvando..." : "Salvar Alterações do Perfil"}
            </Button>
          </CardContent>
        </Card>

        {/* Seção de Troca de Senha */}
        <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <CardHeader className="p-0 mb-4 flex flex-row items-center gap-3">
            <Lock className="h-6 w-6 text-blue-600" />
            <div>
              <CardTitle className="text-2xl font-semibold">Trocar Senha</CardTitle>
              <CardDescription className="text-muted-foreground">
                Use esta seção para definir uma nova senha para sua conta.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>
            <Button 
              onClick={handleChangePassword} 
              disabled={isSavingPassword || newPassword.length < 6 || newPassword !== confirmPassword} 
              className="w-full md:w-auto bg-red-600 hover:bg-red-700"
            >
              {isSavingPassword ? "Trocando..." : "Trocar Senha"}
            </Button>
            <p className="text-sm text-red-500">
              Atenção: Após a troca de senha, você pode ser desconectado por segurança.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;