import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { checkRateLimit } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validations';
import { loginUser } from '@/lib/auth';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar dados com Zod
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const firstError = result.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    // Rate limiting - 5 tentativas por minuto
    const rateLimitKey = `login:${email}`;
    const rateLimit = checkRateLimit(rateLimitKey, 5, 60000);
    
    if (!rateLimit.allowed) {
      const waitTime = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      toast.error(`Muitas tentativas de login. Tente novamente em ${waitTime} segundos.`);
      return;
    }

    setLoading(true);

    try {
      const loginResult = await loginUser(result.data.email, result.data.password);

      if (!loginResult.success) {
        toast.error(loginResult.error || 'Email ou senha incorretos.');
      } else {
        toast.success('Login realizado com sucesso!');
        navigate('/app');
      }
    } catch (err: any) {
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
          <div className="absolute top-1/4 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-blue-200/30 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-60 h-60 sm:w-80 sm:h-80 bg-indigo-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {/* Botão de voltar elegante */}
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 mb-6 sm:mb-8 text-slate-600 hover:text-slate-900 transition-colors duration-200 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium">Voltar para início</span>
          </Link>

          {/* Card principal com efeitos visuais aprimorados */}
          <Card className="bg-white/80 backdrop-blur-xl border-0 shadow-2xl shadow-blue-500/10 rounded-2xl overflow-hidden transform transition-all duration-500 hover:shadow-3xl hover:shadow-blue-500/20 animate-in fade-in-0 slide-in-from-bottom-4">
            {/* Header com ícones decorativos */}
            <CardHeader className="text-center pb-6 sm:pb-8 pt-8 sm:pt-10 px-6 sm:px-8 relative">
              <div className="absolute top-4 right-4 opacity-60 hover:opacity-100 transition-opacity">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
              </div>
              <div className="absolute top-4 left-4 opacity-60 hover:opacity-100 transition-opacity">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
              </div>
              
              <div className="mb-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg transform transition-transform hover:scale-105">
                  <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>
              </div>
              
              <CardTitle className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-3">
                Bem-vindo de volta!
              </CardTitle>
              <CardDescription className="text-slate-600 leading-relaxed px-2 text-sm sm:text-base">
                Acesse sua conta para continuar explorando todas as funcionalidades da plataforma
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8">
              {/* Formulário customizado com show/hide password */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-medium text-slate-700">
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="transition-all focus:shadow-lg focus:shadow-blue-500/10 border-slate-200 focus:border-blue-500 hover:border-slate-300"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="font-medium text-slate-700">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="transition-all focus:shadow-lg focus:shadow-blue-500/10 border-slate-200 focus:border-blue-500 hover:border-slate-300 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors duration-200 focus:outline-none focus:text-blue-500"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full font-medium transition-all hover:shadow-lg hover:shadow-blue-500/25 transform hover:-translate-y-0.5 active:scale-95 bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? 'Entrando...' : 'Entrar na conta'}
                </Button>
              </form>

              {/* Link manual para a página de recuperação de senha */}
              <div className="mt-4 text-center">
                <Link to="/esqueci-senha" className="text-sm text-blue-600 hover:text-blue-700 transition-colors underline font-medium">
                  <Button variant="link" className="p-0 h-auto text-blue-600 hover:text-blue-700">
                    Esqueceu sua senha?
                  </Button>
                </Link>
              </div>

              {/* Divisor decorativo */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100">
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-2">Protegido por criptografia de ponta a ponta</p>
                  <div className="flex justify-center items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-slate-400">Conexão segura</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer com informações adicionais */}
          <div className="mt-4 sm:mt-6 text-center px-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Ao fazer login, você concorda com nossos{' '}
              <Link to="/terms" className="text-blue-600 hover:text-blue-700 transition-colors underline">
                Termos de Uso
              </Link>{' '}
              e{' '}
              <Link to="/privacy" className="text-blue-600 hover:text-blue-700 transition-colors underline">
                Política de Privacidade
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;