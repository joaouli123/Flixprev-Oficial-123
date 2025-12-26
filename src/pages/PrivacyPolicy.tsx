import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Shield, Eye, Lock, Database, Users, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 hover:bg-blue-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Política de Privacidade</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="p-8 bg-white/90 backdrop-blur-sm shadow-xl border-0">
          {/* Introdução */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">FlixPrev I.A - Política de Privacidade</h2>
                <p className="text-slate-600">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <p className="text-slate-700 leading-relaxed">
              A FlixPrev I.A está comprometida em proteger sua privacidade e dados pessoais. Esta política 
              descreve como coletamos, usamos, armazenamos e protegemos suas informações quando você utiliza 
              nossa plataforma de inteligência artificial para advocacia previdenciária.
            </p>
          </div>

          {/* Seções */}
          <div className="space-y-8">
            {/* 1. Informações que Coletamos */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-slate-900">1. Informações que Coletamos</h3>
              </div>
              <div className="space-y-4 text-slate-700">
                <div>
                  <h4 className="font-semibold mb-2">1.1 Dados de Cadastro:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Nome completo e dados de identificação</li>
                    <li>Endereço de e-mail</li>
                    <li>Número de telefone</li>
                    <li>Número de registro na OAB</li>
                    <li>Informações profissionais</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">1.2 Dados de Uso:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Logs de acesso e navegação</li>
                    <li>Endereço IP e localização</li>
                    <li>Informações do dispositivo e navegador</li>
                    <li>Histórico de interações com a plataforma</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">1.3 Dados Processuais:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Documentos e petições enviados</li>
                    <li>Análises e relatórios gerados</li>
                    <li>Dados de clientes (quando fornecidos)</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 2. Como Usamos suas Informações */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-slate-900">2. Como Usamos suas Informações</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>2.1 Prestação de Serviços:</strong> Para fornecer análises jurídicas, gerar documentos e oferecer suporte técnico.</p>
                <p><strong>2.2 Melhoria da Plataforma:</strong> Para aprimorar nossos algoritmos de IA e desenvolver novos recursos.</p>
                <p><strong>2.3 Comunicação:</strong> Para enviar atualizações, notificações e informações relevantes sobre o serviço.</p>
                <p><strong>2.4 Segurança:</strong> Para detectar e prevenir fraudes, abusos e atividades maliciosas.</p>
                <p><strong>2.5 Conformidade Legal:</strong> Para cumprir obrigações legais e regulamentares aplicáveis.</p>
              </div>
            </section>

            {/* 3. Compartilhamento de Dados */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-slate-900">3. Compartilhamento de Dados</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>3.1 Não Compartilhamento:</strong> Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins comerciais.</p>
                <p><strong>3.2 Prestadores de Serviço:</strong> Podemos compartilhar dados com fornecedores confiáveis que nos auxiliam na operação da plataforma, sempre sob rigorosos acordos de confidencialidade.</p>
                <p><strong>3.3 Obrigações Legais:</strong> Podemos divulgar informações quando exigido por lei, ordem judicial ou autoridades competentes.</p>
                <p><strong>3.4 Proteção de Direitos:</strong> Para proteger nossos direitos, propriedade, segurança ou de nossos usuários.</p>
              </div>
            </section>

            {/* 4. Segurança dos Dados */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-slate-900">4. Segurança dos Dados</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>4.1 Criptografia:</strong> Utilizamos criptografia de ponta para proteger dados em trânsito e em repouso.</p>
                <p><strong>4.2 Controle de Acesso:</strong> Implementamos controles rigorosos de acesso baseados em funções e necessidade.</p>
                <p><strong>4.3 Monitoramento:</strong> Monitoramos continuamente nossa infraestrutura para detectar e responder a ameaças.</p>
                <p><strong>4.4 Backup e Recuperação:</strong> Mantemos backups seguros e planos de recuperação de desastres.</p>
                <p><strong>4.5 Auditoria:</strong> Realizamos auditorias regulares de segurança e conformidade.</p>
              </div>
            </section>

            {/* 5. Seus Direitos */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-slate-900">5. Seus Direitos (LGPD)</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p>Conforme a Lei Geral de Proteção de Dados (LGPD), você tem os seguintes direitos:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>Acesso:</strong> Solicitar informações sobre o tratamento de seus dados</li>
                  <li><strong>Correção:</strong> Corrigir dados incompletos, inexatos ou desatualizados</li>
                  <li><strong>Eliminação:</strong> Solicitar a exclusão de dados desnecessários ou tratados em desconformidade</li>
                  <li><strong>Portabilidade:</strong> Solicitar a portabilidade de seus dados para outro fornecedor</li>
                  <li><strong>Oposição:</strong> Opor-se ao tratamento de dados em determinadas situações</li>
                  <li><strong>Revogação:</strong> Revogar o consentimento a qualquer momento</li>
                </ul>
              </div>
            </section>

            {/* 6. Retenção de Dados */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">6. Retenção de Dados</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>6.1 Período de Retenção:</strong> Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas nesta política.</p>
                <p><strong>6.2 Dados de Conta:</strong> Dados de cadastro são mantidos enquanto sua conta estiver ativa.</p>
                <p><strong>6.3 Dados Processuais:</strong> Documentos e análises podem ser mantidos por até 5 anos após o encerramento da conta, conforme exigências legais.</p>
                <p><strong>6.4 Exclusão:</strong> Após o período de retenção, os dados são excluídos de forma segura e irreversível.</p>
              </div>
            </section>

            {/* 7. Cookies e Tecnologias Similares */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">7. Cookies e Tecnologias Similares</h3>
              <div className="space-y-3 text-slate-700">
                <p>Utilizamos cookies e tecnologias similares para melhorar sua experiência. Para mais informações, consulte nossa <a href="/cookies" className="text-blue-600 hover:underline">Política de Cookies</a>.</p>
              </div>
            </section>

            {/* 8. Alterações na Política */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">8. Alterações nesta Política</h3>
              <div className="space-y-3 text-slate-700">
                <p>Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas por e-mail ou através da plataforma. O uso continuado dos serviços após as alterações constitui aceitação da nova política.</p>
              </div>
            </section>

            {/* 9. Contato */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">9. Contato</h3>
              <div className="space-y-3 text-slate-700">
                <p>Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato:</p>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p><strong>E-mail:</strong> contatodireitomastigado@gmail.com</p>
                  <p><strong>Assunto:</strong> Privacidade e Proteção de Dados</p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                © {new Date().getFullYear()} FlixPrev I.A. Todos os direitos reservados.
              </p>
              <Button
                onClick={() => navigate("/")}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                Voltar ao Início
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default PrivacyPolicy;