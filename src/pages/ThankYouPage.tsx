import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, User, Lock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const ThankYouPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card className="bg-white dark:bg-gray-800 shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Obrigado pela sua assinatura!
            </CardTitle>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Bem-vindo ao FLIXprev! Sua assinatura foi ativada com sucesso.
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
              <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center">
                <Lock className="h-5 w-5 mr-2" />
                Informações de Acesso
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <User className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Usuário (Email):
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      Use o <strong>email de compra</strong> como seu nome de usuário
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Senha:
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      Use seu <strong>CPF</strong> (apenas números) como senha
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <p className="text-green-800 dark:text-green-200 text-center">
                <strong>Importante:</strong> Guarde essas informações em local seguro. 
                Você precisará delas para acessar sua conta.
              </p>
            </div>

            <div className="text-center pt-4">
              <Link to="/login">
                <Button 
                  size="lg" 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg font-medium"
                >
                  Acessar Minha Conta
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>

            <div className="text-center text-sm text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
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