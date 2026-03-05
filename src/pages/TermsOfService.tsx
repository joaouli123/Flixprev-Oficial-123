import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ScrollText, Scale, AlertTriangle, CreditCard, UserCheck, Gavel } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TermsOfService: React.FC = () => {
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
            className="flex items-center gap-2 hover:bg-indigo-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <ScrollText className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-900">Termos de Uso</h1>
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
                <ScrollText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">FlixPrev I.A - Termos de Uso</h2>
                <p className="text-slate-600">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Estes Termos de Uso regem o acesso e uso da plataforma FlixPrev I.A, uma ferramenta de 
              inteligência artificial para advocacia previdenciária. Ao utilizar nossos serviços, você 
              concorda integralmente com estes termos.
            </p>
          </div>

          {/* Seções */}
          <div className="space-y-8">
            {/* 1. Definições */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Scale className="w-5 h-5 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">1. Definições</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>1.1 Plataforma:</strong> O sistema FlixPrev I.A, incluindo website, aplicações e serviços relacionados.</p>
                <p><strong>1.2 Usuário:</strong> Advogado ou profissional do direito devidamente habilitado que utiliza a plataforma.</p>
                <p><strong>1.3 Serviços:</strong> Funcionalidades de análise jurídica, geração de documentos e assistência por IA oferecidas pela plataforma.</p>
                <p><strong>1.4 Conteúdo:</strong> Informações, documentos, análises e dados inseridos ou gerados na plataforma.</p>
              </div>
            </section>

            {/* 2. Aceitação dos Termos */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">2. Aceitação dos Termos</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>2.1 Concordância:</strong> O uso da plataforma implica na aceitação integral destes termos.</p>
                <p><strong>2.2 Capacidade Legal:</strong> Você declara ter capacidade legal para celebrar este acordo.</p>
                <p><strong>2.3 Habilitação Profissional:</strong> Você declara ser advogado regularmente inscrito na OAB ou profissional habilitado.</p>
                <p><strong>2.4 Atualizações:</strong> Reservamo-nos o direito de modificar estes termos, notificando os usuários sobre alterações significativas.</p>
              </div>
            </section>

            {/* 3. Descrição dos Serviços */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">3. Descrição dos Serviços</h3>
              <div className="space-y-4 text-slate-700">
                <div>
                  <h4 className="font-semibold mb-2">3.1 Funcionalidades Principais:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Análise automatizada de documentos previdenciários</li>
                    <li>Geração de petições e recursos</li>
                    <li>Cálculos previdenciários assistidos por IA</li>
                    <li>Pesquisa jurisprudencial inteligente</li>
                    <li>Relatórios e pareceres técnicos</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">3.2 Limitações:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Os serviços são ferramentas de apoio, não substituindo o julgamento profissional</li>
                    <li>Resultados podem variar conforme a qualidade dos dados fornecidos</li>
                    <li>Não garantimos resultados específicos em processos judiciais</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 4. Obrigações do Usuário */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Gavel className="w-5 h-5 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">4. Obrigações do Usuário</h3>
              </div>
              <div className="space-y-4 text-slate-700">
                <div>
                  <h4 className="font-semibold mb-2">4.1 Uso Adequado:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Utilizar a plataforma apenas para fins profissionais legítimos</li>
                    <li>Fornecer informações verdadeiras e atualizadas</li>
                    <li>Manter a confidencialidade de suas credenciais de acesso</li>
                    <li>Respeitar direitos de propriedade intelectual</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">4.2 Condutas Proibidas:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Compartilhar acesso com terceiros não autorizados</li>
                    <li>Tentar burlar sistemas de segurança</li>
                    <li>Usar a plataforma para atividades ilegais</li>
                    <li>Sobrecarregar intencionalmente os sistemas</li>
                    <li>Extrair dados de forma automatizada sem autorização</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">4.3 Responsabilidade Profissional:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Revisar e validar todas as análises e documentos gerados</li>
                    <li>Assumir responsabilidade pelos trabalhos apresentados aos clientes</li>
                    <li>Cumprir normas éticas da advocacia</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 5. Pagamentos e Assinaturas */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">5. Pagamentos e Assinaturas</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>5.1 Planos:</strong> Oferecemos diferentes planos de assinatura com funcionalidades específicas.</p>
                <p><strong>5.2 Cobrança:</strong> Pagamentos são processados mensalmente ou anualmente, conforme o plano escolhido.</p>
                <p><strong>5.3 Renovação:</strong> Assinaturas são renovadas automaticamente, salvo cancelamento prévio.</p>
                <p><strong>5.4 Cancelamento:</strong> Você pode cancelar sua assinatura a qualquer momento através da plataforma.</p>
                <p><strong>5.5 Reembolso:</strong> Não oferecemos reembolsos para períodos já utilizados, exceto em casos específicos previstos em lei.</p>
                <p><strong>5.6 Alteração de Preços:</strong> Preços podem ser alterados mediante notificação prévia de 30 dias.</p>
              </div>
            </section>

            {/* 6. Propriedade Intelectual */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">6. Propriedade Intelectual</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>6.1 Direitos da FlixPrev:</strong> Todos os direitos sobre a plataforma, algoritmos, marca e tecnologia pertencem à FlixPrev I.A.</p>
                <p><strong>6.2 Conteúdo do Usuário:</strong> Você mantém os direitos sobre os documentos e dados que inserir na plataforma.</p>
                <p><strong>6.3 Licença de Uso:</strong> Concedemos licença limitada, não exclusiva e revogável para uso da plataforma.</p>
                <p><strong>6.4 Melhorias:</strong> Podemos usar dados agregados e anonimizados para melhorar nossos serviços.</p>
              </div>
            </section>

            {/* 7. Limitação de Responsabilidade */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-xl font-semibold text-slate-900">7. Limitação de Responsabilidade</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>7.1 Ferramenta de Apoio:</strong> A plataforma é uma ferramenta de apoio profissional, não substituindo o julgamento jurídico.</p>
                <p><strong>7.2 Responsabilidade do Usuário:</strong> O usuário é integralmente responsável pelo uso das análises e documentos gerados.</p>
                <p><strong>7.3 Limitação de Danos:</strong> Nossa responsabilidade limita-se ao valor pago pela assinatura no período em questão.</p>
                <p><strong>7.4 Disponibilidade:</strong> Não garantimos disponibilidade ininterrupta dos serviços.</p>
                <p><strong>7.5 Força Maior:</strong> Não nos responsabilizamos por interrupções causadas por eventos de força maior.</p>
              </div>
            </section>

            {/* 8. Privacidade e Proteção de Dados */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">8. Privacidade e Proteção de Dados</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>8.1 LGPD:</strong> Cumprimos integralmente a Lei Geral de Proteção de Dados (LGPD).</p>
                <p><strong>8.2 Política de Privacidade:</strong> O tratamento de dados pessoais é regido por nossa <a href="/privacidade" className="text-indigo-600 hover:underline">Política de Privacidade</a>.</p>
                <p><strong>8.3 Segurança:</strong> Implementamos medidas técnicas e organizacionais para proteger seus dados.</p>
                <p><strong>8.4 Confidencialidade:</strong> Respeitamos o sigilo profissional e a confidencialidade dos dados processuais.</p>
              </div>
            </section>

            {/* 9. Suspensão e Encerramento */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">9. Suspensão e Encerramento</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>9.1 Suspensão:</strong> Podemos suspender o acesso em caso de violação destes termos ou inadimplência.</p>
                <p><strong>9.2 Encerramento pelo Usuário:</strong> Você pode encerrar sua conta a qualquer momento.</p>
                <p><strong>9.3 Encerramento pela FlixPrev:</strong> Podemos encerrar contas que violem estes termos, mediante notificação.</p>
                <p><strong>9.4 Efeitos do Encerramento:</strong> Após o encerramento, o acesso aos serviços será interrompido e dados podem ser excluídos conforme nossa política de retenção.</p>
              </div>
            </section>

            {/* 10. Disposições Gerais */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">10. Disposições Gerais</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>10.1 Lei Aplicável:</strong> Estes termos são regidos pela legislação brasileira.</p>
                <p><strong>10.2 Foro:</strong> Fica eleito o foro da comarca de São Paulo/SP para dirimir controvérsias.</p>
                <p><strong>10.3 Integralidade:</strong> Estes termos constituem o acordo integral entre as partes.</p>
                <p><strong>10.4 Severabilidade:</strong> A invalidade de qualquer cláusula não afeta a validade das demais.</p>
                <p><strong>10.5 Cessão:</strong> Você não pode ceder seus direitos sem nossa autorização prévia.</p>
              </div>
            </section>

            {/* 11. Contato */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">11. Contato</h3>
              <div className="space-y-3 text-slate-700">
                <p>Para dúvidas sobre estes termos ou questões contratuais:</p>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p><strong>E-mail:</strong> contatodireitomastigado@gmail.com</p>
                  <p><strong>Assunto:</strong> Termos de Uso - Questões Contratuais</p>
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

export default TermsOfService;
