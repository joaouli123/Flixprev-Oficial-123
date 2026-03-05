import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, User, Lock, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const ThankYouPage: React.FC = () => {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Background com gradiente animado */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-indigo-200/30 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-60 h-60 sm:w-80 sm:h-80 bg-indigo-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>

      <div className="max-w-2xl w-full relative z-10">
        <Card className="bg-white/80 backdrop-blur-xl border-0 shadow-2xl shadow-blue-500/10 rounded-2xl overflow-hidden animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
          <CardHeader className="text-center pb-6 pt-10 px-8 relative">
            <div className="absolute top-4 right-4 opacity-60">
              <Sparkles className="w-5 h-5 text-indigo-500" />
            </div>
            
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-3">
              Obrigado pela sua assinatura!
            </CardTitle>
            <p className="text-lg text-slate-600">
              Bem-vindo ao FLIXprev! Sua assinatura foi ativada com sucesso.
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6 px-8 pb-10">
            <div className="bg-indigo-50/50 backdrop-blur-sm rounded-xl p-6 border border-indigo-100 shadow-sm">
              <h3 className="text-xl font-semibold text-indigo-900 mb-5 flex items-center">
                <div className="p-2 bg-indigo-100 rounded-lg mr-3">
                  <Lock className="h-5 w-5 text-indigo-600" />
                </div>
                Informações de Acesso
              </h3>
              
              <div className="space-y-5">
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm mt-0.5">
                    <User className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      Usuário (Email):
                    </p>
                    <p className="text-slate-600 mt-1">
                      Use o <strong className="text-slate-900">email de compra</strong> como seu nome de usuário
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm mt-0.5">
                    <Lock className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      Senha:
                    </p>
                    <p className="text-slate-600 mt-1">
                      Use seu <strong className="text-slate-900">CPF</strong> (apenas números) como senha
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50/50 backdrop-blur-sm rounded-xl p-5 border border-emerald-100 shadow-sm">
              <p className="text-emerald-800 text-center">
                <strong className="font-semibold">Importante:</strong> Guarde essas informações em local seguro. 
                Você precisará delas para acessar sua conta.
              </p>
            </div>

            <div className="text-center pt-6">
              <Link to="/login">
                <Button 
                  size="lg" 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-6 text-lg font-medium rounded-xl shadow-lg shadow-blue-500/25 transform transition-all hover:-translate-y-0.5 w-full sm:w-auto"
                >
                  Acessar Minha Conta
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>

            <div className="text-center text-sm text-slate-500 pt-6 border-t border-slate-100 mt-8">
              <p>
                Precisa de ajuda? Entre em contato com nosso suporte.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ThankYouPage;
