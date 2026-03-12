import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseAuth } from "@/lib/supabase-auth";
import { toast } from 'sonner';
import { accountProfileSchema, resetPasswordSchema } from '@/lib/validations';
import { loginUser, persistSupabaseSession } from '@/lib/auth';
import { calculateAgeFromBirthDate, formatCep, formatPracticeAreas, lookupBrazilianCep, parsePracticeAreas } from '@/lib/userProfile';

type RecoveryType = 'recovery' | 'invite';

function getRecoveryUrlParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const readParam = (key: string) => searchParams.get(key) ?? hashParams.get(key);

  return {
    tokenHash: readParam('token_hash'),
    recoveryType: readParam('type') as RecoveryType | null,
    authCode: readParam('code'),
    accessToken: readParam('access_token'),
    refreshToken: readParam('refresh_token'),
  };
}

function clearRecoveryUrlParams() {
  if (!window.location.search && !window.location.hash) {
    return;
  }

  window.history.replaceState({}, document.title, '/reset-password');
}

const ResetPassword: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [fullName, setFullName] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [practiceAreasInput, setPracticeAreasInput] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [regiao, setRegiao] = useState('');
  const [sexo, setSexo] = useState<'feminino' | 'masculino' | 'outro' | 'prefiro_nao_informar'>('prefiro_nao_informar');
  const [dataNascimento, setDataNascimento] = useState('');
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);
  const isProcessingRecoveryRef = useRef(false);
  const navigate = useNavigate();
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  const idade = calculateAgeFromBirthDate(dataNascimento);

  useEffect(() => {
    let isMounted = true;

    const applyRecoveryState = (email: string | null, userId: string | null, activeMessage: string) => {
      if (!isMounted) {
        return;
      }

      setRecoveryEmail(email);
      setRecoveryUserId(userId);
      setHasRecoverySession(Boolean(email));
      setMessage(activeMessage);
      setIsError(false);
    };

    const applyExpiredState = (expiredMessage: string) => {
      if (!isMounted) {
        return;
      }

      setRecoveryEmail(null);
      setRecoveryUserId(null);
      setHasRecoverySession(false);
      setMessage(expiredMessage);
      setIsError(true);
    };

    const { data: authSubscription } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      const sessionEmail = session?.user?.email ?? null;
      const sessionUserId = session?.user?.id ?? null;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && sessionEmail) {
        applyRecoveryState(sessionEmail, sessionUserId, 'Defina sua nova senha e complete seu cadastro para ativar sua conta.');
        setSessionChecking(false);
      }
    });

    const loadRecoverySession = async () => {
      setSessionChecking(true);

      try {
        if (isProcessingRecoveryRef.current) {
          return;
        }

        isProcessingRecoveryRef.current = true;

        const {
          tokenHash,
          recoveryType,
          authCode,
          accessToken,
          refreshToken,
        } = getRecoveryUrlParams();

        if (tokenHash && (recoveryType === 'recovery' || recoveryType === 'invite')) {
          applyRecoveryState(null, null, 'Validando link de acesso...');

          const verification = await supabaseAuth.auth.verifyOtp({
            token_hash: tokenHash,
            type: recoveryType,
          });

          if (verification.error) {
            applyExpiredState('Sessão de recuperação não encontrada ou expirada. Solicite um novo e-mail de ativação/redefinição.');
            return;
          }

          const email = verification.data.user?.email ?? verification.data.session?.user?.email ?? null;
          const userId = verification.data.user?.id ?? verification.data.session?.user?.id ?? null;

          applyRecoveryState(email, userId, 'Defina sua nova senha e complete seu cadastro para ativar sua conta.');
          clearRecoveryUrlParams();

          return;
        }

        if (authCode) {
          applyRecoveryState(null, null, 'Validando link de acesso...');

          const { data, error } = await supabaseAuth.auth.exchangeCodeForSession(authCode);
          const email = data.session?.user?.email ?? data.user?.email ?? null;
          const userId = data.session?.user?.id ?? data.user?.id ?? null;

          if (error || !email) {
            applyExpiredState('Sessão de recuperação não encontrada ou expirada. Solicite um novo e-mail de ativação/redefinição.');
            return;
          }

          applyRecoveryState(email, userId, 'Defina sua nova senha e complete seu cadastro para concluir o acesso.');
          clearRecoveryUrlParams();

          return;
        }

        if (accessToken && refreshToken) {
          applyRecoveryState(null, null, 'Validando link de acesso...');

          const { data, error } = await supabaseAuth.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          const email = data.session?.user?.email ?? data.user?.email ?? null;
          const userId = data.session?.user?.id ?? data.user?.id ?? null;

          if (error || !email) {
            applyExpiredState('Sessão de recuperação não encontrada ou expirada. Solicite um novo e-mail de ativação/redefinição.');
            return;
          }

          applyRecoveryState(email, userId, 'Defina sua nova senha e complete seu cadastro para concluir o acesso.');
          clearRecoveryUrlParams();

          return;
        }

        const { data, error } = await supabaseAuth.auth.getSession();
        const email = data?.session?.user?.email ?? null;
        const userId = data?.session?.user?.id ?? null;

        if (!error && email) {
          applyRecoveryState(email, userId, 'Sessão de recuperação ativa. Defina sua nova senha e complete seu cadastro.');
        } else {
          applyExpiredState('Sessão de recuperação não encontrada ou expirada. Solicite um novo e-mail de ativação/redefinição.');
        }
      } catch {
        applyExpiredState('Não foi possível validar a sessão de recuperação. Tente novamente pelo link enviado no e-mail.');
      } finally {
        if (isMounted) {
          setSessionChecking(false);
        }
        isProcessingRecoveryRef.current = false;
      }
    };

    loadRecoverySession();

    // Proteção adicional: bloquear tentativas de navegação para /app durante redefinição
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasRecoverySession && !showSuccessModal) {
        e.preventDefault();
        e.returnValue = 'Você tem uma redefinição de senha em andamento. Tem certeza que deseja sair?';
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      if (hasRecoverySession && !showSuccessModal && window.location.pathname.startsWith('/app')) {
        e.preventDefault();
        navigate('/reset-password');
        toast.warning('Complete a redefinição de senha antes de acessar o aplicativo.');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!hasRecoverySession || !recoveryUserId || !apiBaseUrl) {
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/account/profile`, {
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': recoveryUserId,
          },
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const profile = payload?.profile;
        if (!profile) {
          return;
        }

        setFullName(profile.nome_completo || '');
        setDocumento(profile.documento || '');
        setTelefone(profile.telefone || '');
        setPracticeAreasInput(formatPracticeAreas(profile.ramos_atuacao));
        setCep(profile.cep || '');
        setLogradouro(profile.logradouro || '');
        setBairro(profile.bairro || '');
        setCidade(profile.cidade || '');
        setEstado(profile.estado || '');
        setRegiao(profile.regiao || '');
        setSexo((profile.sexo as any) || 'prefiro_nao_informar');
        setDataNascimento(profile.data_nascimento || '');
      } catch {
        return;
      }
    };

    void loadProfile();
  }, [apiBaseUrl, hasRecoverySession, recoveryUserId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setIsError(false);

    // Validar com Zod
    const result = resetPasswordSchema.safeParse({
      password: newPassword,
      confirmPassword: confirmPassword,
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      setMessage(firstError.message);
      setIsError(true);
      setLoading(false);
      toast.error(firstError.message);
      return;
    }

    const profileResult = accountProfileSchema.safeParse({
      fullName: fullName.trim(),
      email: String(recoveryEmail || '').trim().toLowerCase(),
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

    if (!profileResult.success) {
      const firstError = profileResult.error.errors[0];
      setMessage(firstError.message);
      setIsError(true);
      setLoading(false);
      toast.error(firstError.message);
      return;
    }

    try {
      let targetEmail = recoveryEmail;

      if (!targetEmail) {
        setMessage('Sessão de recuperação de senha não encontrada ou expirada. Por favor, inicie o processo de recuperação novamente.');
        setIsError(true);
        toast.error('Sessão de recuperação expirada ou inválida.');
        return;
      }

      if (!recoveryUserId) {
        setMessage('Não foi possível identificar o usuário do link de ativação. Solicite um novo acesso.');
        setIsError(true);
        toast.error('Não foi possível identificar o usuário do link.');
        return;
      }

      const profileSaveResponse = await fetch(`${apiBaseUrl}/api/account/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': recoveryUserId,
        },
        body: JSON.stringify({
          full_name: profileResult.data.fullName,
          email: profileResult.data.email,
          documento: profileResult.data.documento,
          telefone: profileResult.data.telefone,
          ramos_atuacao: profileResult.data.practiceAreas,
          cep: profileResult.data.cep,
          logradouro: profileResult.data.logradouro,
          bairro: profileResult.data.bairro,
          cidade: profileResult.data.cidade,
          estado: profileResult.data.estado,
          regiao: profileResult.data.regiao,
          sexo: profileResult.data.sexo,
          idade: profileResult.data.idade,
          data_nascimento: profileResult.data.dataNascimento,
          cadastro_finalizado_em: new Date().toISOString(),
        }),
      });

      if (!profileSaveResponse.ok) {
        const errorPayload = await profileSaveResponse.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Não foi possível salvar o cadastro complementar.');
      }

      const { error } = await supabaseAuth.auth.updateUser({
        password: result.data.password,
      });

      if (error) {
        setMessage('Erro ao redefinir a senha: ' + error.message);
        setIsError(true);
        toast.error('Erro ao redefinir a senha: ' + error.message);
      } else {
        setShowSuccessModal(true);
        toast.success('Senha redefinida com sucesso! Entrando na sua conta...');

        const currentSession = await supabaseAuth.auth.getSession();
        const sessionUser = currentSession.data.session?.user;
        const accessToken = currentSession.data.session?.access_token;

        if (sessionUser) {
          persistSupabaseSession({
            user: sessionUser,
            accessToken,
            fallbackEmail: targetEmail,
          });

          navigate('/app', { replace: true });
          return;
        }

        const loginResult = await loginUser(targetEmail, result.data.password);

        if (loginResult.success) {
          toast.success('Conta ativada e login realizado com sucesso!');
          navigate('/app', { replace: true });
          return;
        }

        setMessage('Senha atualizada, mas não foi possível iniciar sua sessão automaticamente. Faça login para continuar.');
        setIsError(false);
        setShowSuccessModal(false);
        toast.warning('Senha atualizada. Faça login para continuar.');
      }
    } catch (err: any) {
      setMessage('Ocorreu um erro inesperado: ' + err.message);
      setIsError(true);
      toast.error('Erro inesperado: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background com gradiente animado */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-indigo-200/30 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-60 h-60 sm:w-80 sm:h-80 bg-indigo-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>

      {/* Modal de Sucesso */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-300">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Senha Alterada com Sucesso!
              </h3>
              <p className="text-gray-600 mb-4">
                Sua senha foi redefinida com sucesso. Entrando na área logada...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{width: '100%'}}></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Abrindo sua conta...</p>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo principal */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {/* Botão de voltar elegante */}
          <Link 
            to="/login" 
            className="inline-flex items-center gap-2 mb-6 sm:mb-8 text-slate-600 hover:text-slate-900 transition-colors duration-200 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium">Voltar para o Login</span>
          </Link>

          {/* Card principal */}
          <Card className="bg-white/80 backdrop-blur-xl border-0 shadow-2xl shadow-blue-500/10 rounded-2xl overflow-hidden animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
            <CardHeader className="text-center pb-6 sm:pb-8 pt-8 sm:pt-10 px-6 sm:px-8">
              <div className="mb-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
                  <Lock className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>
              </div>
              
              <CardTitle className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-3">
                Redefinir Senha
              </CardTitle>
              <CardDescription className="text-slate-600 leading-relaxed px-2 text-sm sm:text-base">
                Defina sua senha e complete seu cadastro para concluir a ativação.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-semibold text-slate-800">Dados obrigatórios do cadastro</div>

                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email-display">E-mail</Label>
                    <Input id="email-display" value={recoveryEmail || ''} disabled />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="documento">CPF</Label>
                      <Input id="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone">WhatsApp</Label>
                      <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="practiceAreas">Quais Ramos Atua?</Label>
                    <Textarea
                      id="practiceAreas"
                      value={practiceAreasInput}
                      onChange={(e) => setPracticeAreasInput(e.target.value)}
                      placeholder="Ex: Previdenciário, Cível"
                      className="min-h-[88px]"
                    />
                  </div>

                  <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-medium text-slate-700">Região e Endereço</div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="cep">CEP</Label>
                        <Input id="cep" value={cep} onChange={(e) => setCep(formatCep(e.target.value))} onBlur={() => void handleCepLookup()} />
                      </div>
                      <Button type="button" variant="outline" className="self-end" onClick={() => void handleCepLookup()} disabled={isLookingUpCep || cep.replace(/\D/g, '').length !== 8}>
                        {isLookingUpCep ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar CEP'}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="logradouro">Endereço</Label>
                      <Input id="logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bairro">Bairro</Label>
                        <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cidade">Cidade</Label>
                        <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="estado">UF</Label>
                        <Input id="estado" value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase())} maxLength={2} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="regiao">Região</Label>
                        <Input id="regiao" value={regiao} onChange={(e) => setRegiao(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sexo">Sexo</Label>
                      <Select value={sexo} onValueChange={(value: 'feminino' | 'masculino' | 'outro' | 'prefiro_nao_informar') => setSexo(value)}>
                        <SelectTrigger>
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
                      <Label htmlFor="dataNascimento">Data de Nascimento</Label>
                      <Input id="dataNascimento" type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="idade">Idade</Label>
                      <Input id="idade" value={idade ?? ''} readOnly />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {message && (
                  <div className={`text-center text-sm ${isError ? 'text-red-600' : 'text-green-600'}`}>
                    {message}
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3"
                  disabled={loading || sessionChecking || !hasRecoverySession}
                >
                  {sessionChecking ? 'Validando link...' : loading ? 'Redefinindo...' : 'Redefinir Senha'}
                </Button>
              </form>

              {/* Divisor decorativo */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100">
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-2">Sua segurança é nossa prioridade.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
