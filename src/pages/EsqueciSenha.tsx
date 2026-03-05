import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabaseAuth } from "@/lib/supabase-auth";
import { toast } from 'sonner'; // Importar toast

const EsqueciSenha: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!email.trim()) {
      toast.error("Por favor, insira seu e-mail.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
        redirectTo: `https://flixprev.com.br/reset-password`,
      });

      if (error) {
        toast.error("Erro ao enviar e-mail: " + error.message);
      } else {
        toast.success("E-mail de redefinição enviado! Verifique sua caixa de entrada.");
        setEmail('');
      }
    } catch (err: any) {
      toast.error("Ocorreu um erro inesperado: " + err.message);
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
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
                  <Lock className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>
              </div>
              
              <CardTitle className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-3">
                Esqueceu a Senha?
              </CardTitle>
              <CardDescription className="text-slate-600 leading-relaxed px-2 text-sm sm:text-base">
                Insira o e-mail associado à sua conta. Enviaremos um link para redefinição de senha.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3"
                  disabled={loading}
                >
                  {loading ? 'Enviando...' : 'Enviar Link de Redefinição'}
                </Button>
              </form>

              {/* Divisor decorativo */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100">
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-2">Verifique sua caixa de entrada após o envio.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EsqueciSenha;
