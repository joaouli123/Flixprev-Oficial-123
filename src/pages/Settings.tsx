import React, { useState, useEffect } from "react";
import { useSession } from "@/components/SessionContextProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseAuth } from "@/lib/neon"
import { persistSupabaseSession } from "@/lib/auth";
import { accountProfileSchema } from "@/lib/validations";
import { calculateAgeFromBirthDate, formatCep, formatPracticeAreas, lookupBrazilianCep, parsePracticeAreas } from "@/lib/userProfile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Lock, Loader2, MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Settings: React.FC = () => {
  const { session, profile, refreshProfile } = useSession();
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");

  const [fullName, setFullName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [practiceAreasInput, setPracticeAreasInput] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [regiao, setRegiao] = useState("");
  const [sexo, setSexo] = useState<'feminino' | 'masculino' | 'outro' | 'prefiro_nao_informar'>('prefiro_nao_informar');
  const [dataNascimento, setDataNascimento] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(profile?.avatar_url || null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);

  // Estados para troca de senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const idade = calculateAgeFromBirthDate(dataNascimento);

  useEffect(() => {
    if (profile) {
      const profileName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.nome_completo || "";
      setFullName((prev) => prev || profileName);
      setBillingEmail((prev) => prev || profile.email || session?.user?.email || "");
      setDocumento((prev) => prev || profile.documento || "");
      setTelefone((prev) => prev || profile.telefone || "");
      setPracticeAreasInput((prev) => prev || formatPracticeAreas(profile.ramos_atuacao));
      setCep((prev) => prev || profile.cep || "");
      setLogradouro((prev) => prev || profile.logradouro || "");
      setBairro((prev) => prev || profile.bairro || "");
      setCidade((prev) => prev || profile.cidade || "");
      setEstado((prev) => prev || profile.estado || "");
      setRegiao((prev) => prev || profile.regiao || "");
      setSexo((prev) => (prev !== 'prefiro_nao_informar' ? prev : ((profile.sexo as any) || 'prefiro_nao_informar')));
      setDataNascimento((prev) => prev || profile.data_nascimento || "");
      setAvatarPreviewUrl(profile.avatar_url || null);
    }
  }, [profile, session?.user?.email]);

  useEffect(() => {
    if (session?.user?.email) {
      setBillingEmail((prev) => prev || session.user.email || "");
    }
  }, [session?.user?.email]);

  useEffect(() => {
    const fetchBillingInfo = async () => {
      if (!session?.user?.id) return;

      try {
        const response = await fetch(`${apiBaseUrl}/api/account/profile`, {
          headers: {
            "Content-Type": "application/json",
            "x-user-id": session.user.id,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Erro ${response.status}`);
        }

        const payload = await response.json();
        const data = payload?.profile;

        if (data) {
          setFullName(data.nome_completo || "");
          setBillingEmail(data.email || session.user.email || "");
          setDocumento(data.documento || "");
          setTelefone(data.telefone || "");
          setPracticeAreasInput(formatPracticeAreas(data.ramos_atuacao));
          setCep(data.cep || "");
          setLogradouro(data.logradouro || "");
          setBairro(data.bairro || "");
          setCidade(data.cidade || "");
          setEstado(data.estado || "");
          setRegiao(data.regiao || "");
          setSexo((data.sexo as any) || 'prefiro_nao_informar');
          setDataNascimento(data.data_nascimento || "");
        }
      } catch (error) {
        console.error("Erro ao carregar dados de faturamento:", error);
      }
    };

    fetchBillingInfo();
  }, [apiBaseUrl, session?.user?.id, session?.user?.email]);

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

    const trimmedFullName = fullName.trim();
    const parsedProfile = accountProfileSchema.safeParse({
      fullName: trimmedFullName,
      email: billingEmail.trim().toLowerCase(),
      documento: documento.trim(),
      telefone: telefone.trim(),
      practiceAreas: parsePracticeAreas(practiceAreasInput),
      cep: cep.trim(),
      logradouro: logradouro.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      estado: estado.trim().toUpperCase(),
      regiao: regiao.trim(),
      sexo,
      dataNascimento,
      idade: idade ?? -1,
    });

    if (!parsedProfile.success) {
      toast.error(parsedProfile.error.errors[0]?.message || "Preencha os campos obrigatórios do perfil.");
      return;
    }

    setIsSavingProfile(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/account/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.user.id,
        },
        body: JSON.stringify({
          full_name: trimmedFullName || null,
          email: billingEmail.trim().toLowerCase(),
          documento: documento.trim() || null,
          telefone: telefone.trim() || null,
          ramos_atuacao: parsePracticeAreas(practiceAreasInput),
          cep: cep.trim() || null,
          logradouro: logradouro.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          estado: estado.trim().toUpperCase() || null,
          regiao: regiao.trim() || null,
          sexo,
          idade,
          data_nascimento: dataNascimento || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const payload = await response.json();
      const savedProfile = payload?.profile;

      if (savedProfile) {
        setFullName(savedProfile.nome_completo || "");
        setBillingEmail(savedProfile.email || billingEmail.trim().toLowerCase());
        setDocumento(savedProfile.documento || "");
        setTelefone(savedProfile.telefone || "");
        setPracticeAreasInput(formatPracticeAreas(savedProfile.ramos_atuacao));
        setCep(savedProfile.cep || "");
        setLogradouro(savedProfile.logradouro || "");
        setBairro(savedProfile.bairro || "");
        setCidade(savedProfile.cidade || "");
        setEstado(savedProfile.estado || "");
        setRegiao(savedProfile.regiao || "");
        setSexo((savedProfile.sexo as any) || 'prefiro_nao_informar');
        setDataNascimento(savedProfile.data_nascimento || "");
      }

      await refreshProfile();
      toast.success("Configurações atualizadas com sucesso!");
      setAvatarFile(null);
    } catch (error: any) {
      toast.error("Erro ao salvar perfil: " + (error?.message || "falha desconhecida"));
      console.error("Erro ao salvar perfil:", error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCepLookup = async () => {
    if (cep.replace(/\D/g, '').length !== 8) {
      return;
    }

    setIsLookingUpCep(true);

    try {
      const result = await lookupBrazilianCep(cep);
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

  const handleChangePassword = async () => {
    const currentEmail = String(session?.user?.email || billingEmail || "").trim().toLowerCase();

    if (!session?.user?.id || !currentEmail) {
      toast.error("Você precisa estar logado para trocar a senha.");
      return;
    }

    if (!currentPassword.trim()) {
      toast.error("Informe sua senha atual para confirmar a troca.");
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
      const signInResult = await supabaseAuth.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      });

      if (signInResult.error || !signInResult.data.user) {
        throw new Error(signInResult.error?.message || "Não foi possível validar sua senha atual.");
      }

      persistSupabaseSession({
        user: signInResult.data.user,
        accessToken: signInResult.data.session?.access_token,
        fallbackEmail: currentEmail,
      });

      const { error } = await supabaseAuth.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw new Error(error.message);
      } else {
        const refreshedSession = await supabaseAuth.auth.getSession();
        if (refreshedSession.data.session?.user) {
          persistSupabaseSession({
            user: refreshedSession.data.session.user,
            accessToken: refreshedSession.data.session.access_token,
            fallbackEmail: currentEmail,
          });
        }

        toast.success("Senha atualizada com sucesso!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (error: any) {
      toast.error("Erro ao trocar a senha: " + (error?.message || "falha desconhecida"));
    } finally {
      setIsSavingPassword(false);
    }
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
                  <Label htmlFor="telefone" className="text-gray-700">WhatsApp</Label>
                  <Input
                    id="telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="practiceAreas" className="text-gray-700">Quais Ramos Atua?</Label>
                <Textarea
                  id="practiceAreas"
                  value={practiceAreasInput}
                  onChange={(e) => setPracticeAreasInput(e.target.value)}
                  placeholder="Ex: Previdenciário, Trabalhista"
                  className="min-h-[88px] bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <MapPin className="h-4 w-4 text-indigo-600" />
                  Região e Endereço
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cep" className="text-gray-700">CEP</Label>
                    <Input
                      id="cep"
                      value={cep}
                      onChange={(e) => setCep(formatCep(e.target.value))}
                      onBlur={() => void handleCepLookup()}
                      placeholder="00000-000"
                      className="bg-white border-gray-200 focus:bg-white transition-colors"
                    />
                  </div>
                  <Button type="button" variant="outline" className="self-end" onClick={() => void handleCepLookup()} disabled={isLookingUpCep || cep.replace(/\D/g, '').length !== 8}>
                    {isLookingUpCep ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar CEP'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logradouro" className="text-gray-700">Endereço</Label>
                  <Input
                    id="logradouro"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                    className="bg-white border-gray-200 focus:bg-white transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bairro" className="text-gray-700">Bairro</Label>
                    <Input
                      id="bairro"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      className="bg-white border-gray-200 focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cidade" className="text-gray-700">Cidade</Label>
                    <Input
                      id="cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      className="bg-white border-gray-200 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="estado" className="text-gray-700">UF</Label>
                    <Input
                      id="estado"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value.toUpperCase())}
                      maxLength={2}
                      className="bg-white border-gray-200 focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regiao" className="text-gray-700">Região</Label>
                    <Input
                      id="regiao"
                      value={regiao}
                      onChange={(e) => setRegiao(e.target.value)}
                      className="bg-white border-gray-200 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sexo" className="text-gray-700">Sexo</Label>
                  <Select value={sexo} onValueChange={(value: 'feminino' | 'masculino' | 'outro' | 'prefiro_nao_informar') => setSexo(value)}>
                    <SelectTrigger className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                      <SelectItem value="prefiro_nao_informar">Prefiro não informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dataNascimento" className="text-gray-700">Data de Nascimento</Label>
                  <Input
                    id="dataNascimento"
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="idade" className="text-gray-700">Idade</Label>
                  <Input
                    id="idade"
                    value={idade ?? ""}
                    readOnly
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="currentPassword" className="text-gray-700">Senha Atual</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
              />
            </div>
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
              <span className="font-medium text-amber-600">Confirmação de segurança:</span> informe sua senha atual para trocar a senha a qualquer momento dentro da conta.
            </p>
            <Button 
              onClick={handleChangePassword} 
              disabled={isSavingPassword || !currentPassword.trim() || newPassword.length < 6 || newPassword !== confirmPassword} 
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
