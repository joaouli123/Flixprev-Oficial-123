import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, User, FileText, Eye, Lock, AlertCircle } from 'lucide-react';

const LGPDNotice: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span>Voltar ao Início</span>
            </Link>
            <div className="flex items-center space-x-2">
              <Shield className="w-6 h-6 text-green-400" />
              <span className="text-white font-semibold">FlixPrev I.A.</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700 p-8 shadow-2xl">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <Shield className="w-12 h-12 text-green-400 mr-3" />
              <h1 className="text-4xl font-bold text-white">Aviso LGPD</h1>
            </div>
            <p className="text-slate-300 text-lg">
              Lei Geral de Proteção de Dados Pessoais - Lei nº 13.709/2018
            </p>
            <p className="text-slate-400 mt-2">
              Última atualização: Janeiro de 2025
            </p>
          </div>

          {/* Content */}
          <div className="space-y-8 text-slate-300">
            {/* Introdução */}
            <section>
              <div className="flex items-center mb-4">
                <AlertCircle className="w-6 h-6 text-blue-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Compromisso com a LGPD</h2>
              </div>
              <p className="leading-relaxed">
                A FlixPrev I.A. está comprometida com a proteção de dados pessoais e o cumprimento integral da 
                Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018). Este aviso informa como 
                tratamos seus dados pessoais em conformidade com a legislação brasileira.
              </p>
            </section>

            {/* Seus Direitos */}
            <section>
              <div className="flex items-center mb-4">
                <User className="w-6 h-6 text-green-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Seus Direitos como Titular</h2>
              </div>
              <p className="mb-4">Conforme a LGPD, você possui os seguintes direitos:</p>
              <ul className="space-y-3 ml-6">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Confirmação da existência de tratamento:</strong> Saber se tratamos seus dados pessoais</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Acesso aos dados:</strong> Obter acesso aos seus dados pessoais que tratamos</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Correção:</strong> Solicitar a correção de dados incompletos, inexatos ou desatualizados</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Anonimização, bloqueio ou eliminação:</strong> Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Portabilidade:</strong> Solicitar a portabilidade dos dados a outro fornecedor</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Eliminação:</strong> Solicitar a eliminação dos dados tratados com seu consentimento</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Informação sobre compartilhamento:</strong> Obter informações sobre entidades com as quais compartilhamos seus dados</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Revogação do consentimento:</strong> Revogar o consentimento a qualquer momento</span>
                </li>
              </ul>
            </section>

            {/* Bases Legais */}
            <section>
              <div className="flex items-center mb-4">
                <FileText className="w-6 h-6 text-purple-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Bases Legais para Tratamento</h2>
              </div>
              <p className="mb-4">Tratamos seus dados pessoais com base nas seguintes hipóteses legais:</p>
              <ul className="space-y-3 ml-6">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Consentimento:</strong> Quando você nos fornece consentimento específico</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Execução de contrato:</strong> Para cumprimento de obrigações contratuais</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Legítimo interesse:</strong> Para atender nossos interesses legítimos</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Cumprimento de obrigação legal:</strong> Para cumprir obrigações legais ou regulatórias</span>
                </li>
              </ul>
            </section>

            {/* Segurança */}
            <section>
              <div className="flex items-center mb-4">
                <Lock className="w-6 h-6 text-yellow-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Medidas de Segurança</h2>
              </div>
              <p className="leading-relaxed">
                Implementamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais 
                contra acessos não autorizados, alteração, divulgação ou destruição. Utilizamos criptografia, 
                controles de acesso, monitoramento contínuo e outras práticas de segurança da informação.
              </p>
            </section>

            {/* Transferência Internacional */}
            <section>
              <div className="flex items-center mb-4">
                <Eye className="w-6 h-6 text-red-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Transferência Internacional</h2>
              </div>
              <p className="leading-relaxed">
                Quando necessário, podemos transferir seus dados pessoais para outros países. Nestes casos, 
                garantimos que o país de destino proporcione grau de proteção adequado ou implementamos 
                salvaguardas apropriadas, como cláusulas contratuais padrão aprovadas pela ANPD.
              </p>
            </section>

            {/* Encarregado de Dados */}
            <section>
              <div className="flex items-center mb-4">
                <User className="w-6 h-6 text-indigo-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Encarregado de Proteção de Dados</h2>
              </div>
              <p className="leading-relaxed mb-4">
                Designamos um Encarregado de Proteção de Dados (DPO) para atuar como canal de comunicação 
                entre você, a FlixPrev I.A. e a Autoridade Nacional de Proteção de Dados (ANPD).
              </p>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-white font-semibold mb-2">Contato do Encarregado:</p>
                <p>Email: contatodireitomastigado@gmail.com</p>
                <p>Telefone: +55 (11) 93206-4655</p>
              </div>
            </section>

            {/* Como Exercer Direitos */}
            <section>
              <div className="flex items-center mb-4">
                <FileText className="w-6 h-6 text-cyan-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Como Exercer Seus Direitos</h2>
              </div>
              <p className="leading-relaxed mb-4">
                Para exercer qualquer um dos seus direitos previstos na LGPD, entre em contato conosco através dos canais:
              </p>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <ul className="space-y-2">
                  <li>Email: contatodireitomastigado@gmail.com</li>
                  <li>Email do DPO: contatodireitomastigado@gmail.com</li>
                  <li>Formulário online: Disponível em nossa plataforma</li>
                </ul>
              </div>
              <p className="mt-4 text-slate-400">
                Responderemos às suas solicitações em até 15 dias, conforme estabelecido pela LGPD.
              </p>
            </section>

            {/* Reclamações */}
            <section>
              <div className="flex items-center mb-4">
                <AlertCircle className="w-6 h-6 text-orange-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Reclamações à ANPD</h2>
              </div>
              <p className="leading-relaxed">
                Caso não esteja satisfeito com nossas respostas ou práticas de proteção de dados, você tem 
                o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) através 
                do site: <a href="https://www.gov.br/anpd" className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">www.gov.br/anpd</a>
              </p>
            </section>

            {/* Alterações */}
            <section>
              <div className="flex items-center mb-4">
                <FileText className="w-6 h-6 text-pink-400 mr-3" />
                <h2 className="text-2xl font-semibold text-white">Alterações neste Aviso</h2>
              </div>
              <p className="leading-relaxed">
                Este aviso pode ser atualizado periodicamente para refletir mudanças em nossas práticas ou 
                na legislação. Notificaremos sobre alterações significativas através de nossos canais de comunicação.
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-700">
            <div className="text-center">
              <p className="text-slate-400 mb-4">
                Para mais informações, consulte nossa{' '}
                <Link to="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                  Política de Privacidade
                </Link>{' '}
                completa.
              </p>
              <div className="flex items-center justify-center space-x-4 text-sm text-slate-500">
                <span>© 2025 FlixPrev I.A.</span>
                <span>•</span>
                <span>Todos os direitos reservados</span>
                <span>•</span>
                <span>LGPD Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LGPDNotice;