import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabaseAuth } from "@/lib/supabase-auth";
import { toast } from 'sonner';
import { resetPasswordSchema } from '@/lib/validations';
import { loginUser } from '@/lib/auth';

type RecoveryType = 'recovery' | 'invite';

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
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [pendingTokenHash, setPendingTokenHash] = useState<string | null>(null);
  const [pendingRecoveryType, setPendingRecoveryType] = useState<RecoveryType | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadRecoverySession = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const tokenHash = searchParams.get('token_hash');
        const recoveryType = searchParams.get('type') as RecoveryType | null;

        if (tokenHash && (recoveryType === 'recovery' || recoveryType === 'invite')) {
          setPendingTokenHash(tokenHash);
          setPendingRecoveryType(recoveryType);
          setHasRecoverySession(true);
          setMessage('Defina sua nova senha para ativar sua conta.');
          setIsError(false);
          return;
        }

        const { data, error } = await supabaseAuth.auth.getSession();
        const email = data?.session?.user?.email ?? null;

        if (!error && email) {
          setRecoveryEmail(email);
          setHasRecoverySession(true);
          setMessage('Sessão de recuperação ativa. Defina sua nova senha para ativar a conta.');
          setIsError(false);
        } else {
          setHasRecoverySession(false);
          setMessage('Sessão de recuperação não encontrada ou expirada. Solicite um novo e-mail de ativação/redefinição.');
          setIsError(true);
        }
      } catch {
        setHasRecoverySession(false);
        setMessage('Não foi possível validar a sessão de recuperação. Tente novamente pelo link enviado no e-mail.');
        setIsError(true);
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
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasRecoverySession, showSuccessModal, navigate]);

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

    try {
      let targetEmail = recoveryEmail;

      if ((!targetEmail || !hasRecoverySession) && pendingTokenHash && pendingRecoveryType) {
        const verification = await supabaseAuth.auth.verifyOtp({
          token_hash: pendingTokenHash,
          type: pendingRecoveryType,
        });

        if (verification.error) {
          setHasRecoverySession(false);
          setMessage('Sessão de recuperação de senha não encontrada ou expirada. Por favor, inicie o processo de recuperação novamente.');
          setIsError(true);
          toast.error('Sessão de recuperação expirada ou inválida.');
          return;
        }

        const refreshed = await supabaseAuth.auth.getSession();
        targetEmail = refreshed.data?.session?.user?.email ?? verification.data.user?.email ?? null;
        setRecoveryEmail(targetEmail);
        setHasRecoverySession(true);
        setPendingTokenHash(null);
        setPendingRecoveryType(null);

        if (window.location.search) {
          window.history.replaceState({}, document.title, '/reset-password');
        }
      }

      if (!targetEmail) {
        setMessage('Sessão de recuperação de senha não encontrada ou expirada. Por favor, inicie o processo de recuperação novamente.');
        setIsError(true);
        toast.error('Sessão de recuperação expirada ou inválida.');
        return;
      }

      const { error } = await supabaseAuth.auth.updateUser({
        password: result.data.password,
      });

      if (error) {
        setMessage('Erro ao redefinir a senha: ' + error.message);
        setIsError(true);
        toast.error('Erro ao redefinir a senha: ' + error.message);
      } else {
        // Mostrar modal de sucesso e autenticar automaticamente
        setShowSuccessModal(true);
        toast.success('Senha redefinida com sucesso!');

        const loginResult = await loginUser(targetEmail, result.data.password);

        if (loginResult.success) {
          toast.success('Conta ativada e login realizado com sucesso!');
          setTimeout(() => navigate('/app'), 1200);
        } else {
          toast.warning('Senha atualizada. Faça login para continuar.');
          setTimeout(() => navigate('/login'), 2200);
        }
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
                Sua senha foi redefinida com sucesso. Você será redirecionado para a página de login em instantes.
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{width: '100%'}}></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Redirecionando...</p>
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
                Insira e confirme sua nova senha.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
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
                  disabled={loading}
                >
                  {loading ? 'Redefinindo...' : 'Redefinir Senha'}
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
