import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Cookie, Settings, BarChart3, Shield, Eye, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CookiePolicy: React.FC = () => {
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
            <Cookie className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-900">Política de Cookies</h1>
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
                <Cookie className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">FlixPrev I.A - Política de Cookies</h2>
                <p className="text-slate-600">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Esta política explica como a FlixPrev I.A utiliza cookies e tecnologias similares em nossa 
              plataforma. Ao continuar navegando, você concorda com o uso de cookies conforme descrito 
              nesta política.
            </p>
          </div>

          {/* Seções */}
          <div className="space-y-8">
            {/* 1. O que são Cookies */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Cookie className="w-5 h-5 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">1. O que são Cookies</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>1.1 Definição:</strong> Cookies são pequenos arquivos de texto armazenados no seu dispositivo quando você visita um website.</p>
                <p><strong>1.2 Finalidade:</strong> Permitem que o site "lembre" de suas ações e preferências ao longo do tempo.</p>
                <p><strong>1.3 Tecnologias Similares:</strong> Também utilizamos web beacons, pixels de rastreamento e armazenamento local.</p>
                <p><strong>1.4 Segurança:</strong> Cookies não podem executar programas ou transmitir vírus para seu computador.</p>
              </div>
            </section>

            {/* 2. Tipos de Cookies que Utilizamos */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">2. Tipos de Cookies que Utilizamos</h3>
              <div className="space-y-6">
                {/* Cookies Essenciais */}
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Shield className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-green-900">2.1 Cookies Essenciais (Obrigatórios)</h4>
                  </div>
                  <div className="text-green-800 space-y-2">
                    <p><strong>Finalidade:</strong> Necessários para o funcionamento básico da plataforma</p>
                    <p><strong>Exemplos:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Autenticação e sessão do usuário</li>
                      <li>Segurança e prevenção de fraudes</li>
                      <li>Preferências de idioma e região</li>
                      <li>Carrinho de compras e processo de pagamento</li>
                    </ul>
                    <p><strong>Duração:</strong> Sessão ou até 1 ano</p>
                    <p><strong>Consentimento:</strong> Não requer consentimento (interesse legítimo)</p>
                  </div>
                </div>

                {/* Cookies de Performance */}
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <div className="flex items-center gap-3 mb-3">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-semibold text-indigo-900">2.2 Cookies de Performance e Análise</h4>
                  </div>
                  <div className="text-indigo-800 space-y-2">
                    <p><strong>Finalidade:</strong> Coletam informações sobre como você usa a plataforma</p>
                    <p><strong>Exemplos:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Google Analytics (tráfego e comportamento)</li>
                      <li>Métricas de performance da aplicação</li>
                      <li>Análise de funcionalidades mais utilizadas</li>
                      <li>Detecção de erros e problemas técnicos</li>
                    </ul>
                    <p><strong>Duração:</strong> Até 2 anos</p>
                    <p><strong>Consentimento:</strong> Requer consentimento</p>
                  </div>
                </div>

                {/* Cookies Funcionais */}
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Settings className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-purple-900">2.3 Cookies Funcionais</h4>
                  </div>
                  <div className="text-purple-800 space-y-2">
                    <p><strong>Finalidade:</strong> Melhoram a funcionalidade e personalização</p>
                    <p><strong>Exemplos:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Lembrar preferências de interface</li>
                      <li>Configurações de dashboard personalizadas</li>
                      <li>Histórico de pesquisas recentes</li>
                      <li>Preferências de notificações</li>
                    </ul>
                    <p><strong>Duração:</strong> Até 1 ano</p>
                    <p><strong>Consentimento:</strong> Requer consentimento</p>
                  </div>
                </div>

                {/* Cookies de Marketing */}
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Eye className="w-5 h-5 text-orange-600" />
                    <h4 className="font-semibold text-orange-900">2.4 Cookies de Marketing</h4>
                  </div>
                  <div className="text-orange-800 space-y-2">
                    <p><strong>Finalidade:</strong> Personalizam anúncios e medem eficácia de campanhas</p>
                    <p><strong>Exemplos:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Google Ads e Facebook Pixel</li>
                      <li>Remarketing e retargeting</li>
                      <li>Análise de conversões</li>
                      <li>Segmentação de audiência</li>
                    </ul>
                    <p><strong>Duração:</strong> Até 2 anos</p>
                    <p><strong>Consentimento:</strong> Requer consentimento</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Cookies de Terceiros */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">3. Cookies de Terceiros</h3>
              <div className="space-y-4 text-slate-700">
                <p>Utilizamos serviços de terceiros que podem definir seus próprios cookies:</p>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <p><strong>Google Analytics:</strong> Análise de tráfego e comportamento</p>
                      <p className="text-sm text-slate-600">Política: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Privacy Policy</a></p>
                    </div>
                    <div>
                      <p><strong>Google Ads:</strong> Publicidade e remarketing</p>
                      <p className="text-sm text-slate-600">Política: <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Ads Policy</a></p>
                    </div>
                    <div>
                      <p><strong>Supabase:</strong> Infraestrutura e autenticação</p>
                      <p className="text-sm text-slate-600">Política: <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Supabase Privacy</a></p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Gerenciamento de Cookies */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">4. Como Gerenciar Cookies</h3>
              </div>
              <div className="space-y-4 text-slate-700">
                <div>
                  <h4 className="font-semibold mb-2">4.1 Configurações da Plataforma:</h4>
                  <p>Você pode gerenciar suas preferências de cookies através do banner de consentimento ou nas configurações da sua conta.</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">4.2 Configurações do Navegador:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><strong>Chrome:</strong> Configurações → Privacidade e segurança → Cookies</li>
                    <li><strong>Firefox:</strong> Opções → Privacidade e Segurança → Cookies</li>
                    <li><strong>Safari:</strong> Preferências → Privacidade → Cookies</li>
                    <li><strong>Edge:</strong> Configurações → Cookies e permissões do site</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">4.3 Ferramentas de Opt-out:</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Analytics Opt-out</a></li>
                    <li><a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Ads Settings</a></li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 5. Impacto da Desabilitação */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Trash2 className="w-5 h-5 text-amber-600" />
                <h3 className="text-xl font-semibold text-slate-900">5. Impacto da Desabilitação de Cookies</h3>
              </div>
              <div className="space-y-3 text-slate-700">
                <p><strong>5.1 Cookies Essenciais:</strong> A desabilitação pode impedir o funcionamento adequado da plataforma.</p>
                <p><strong>5.2 Cookies Funcionais:</strong> Você pode perder personalizações e preferências salvas.</p>
                <p><strong>5.3 Cookies de Análise:</strong> Não afeta a funcionalidade, mas limita nossa capacidade de melhorar o serviço.</p>
                <p><strong>5.4 Cookies de Marketing:</strong> Você pode ver anúncios menos relevantes.</p>
              </div>
            </section>

            {/* 6. Duração e Expiração */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">6. Duração e Expiração</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>6.1 Cookies de Sessão:</strong> Expiram quando você fecha o navegador.</p>
                <p><strong>6.2 Cookies Persistentes:</strong> Permanecem até a data de expiração ou até serem excluídos manualmente.</p>
                <p><strong>6.3 Renovação:</strong> Alguns cookies são renovados a cada visita para manter a funcionalidade.</p>
                <p><strong>6.4 Limpeza Automática:</strong> Removemos automaticamente cookies expirados de nossos sistemas.</p>
              </div>
            </section>

            {/* 7. Atualizações desta Política */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">7. Atualizações desta Política</h3>
              <div className="space-y-3 text-slate-700">
                <p><strong>7.1 Modificações:</strong> Podemos atualizar esta política para refletir mudanças em nossas práticas ou na legislação.</p>
                <p><strong>7.2 Notificação:</strong> Alterações significativas serão comunicadas através da plataforma ou por e-mail.</p>
                <p><strong>7.3 Consentimento:</strong> O uso continuado após as alterações constitui aceitação da nova política.</p>
              </div>
            </section>

            {/* 8. Contato */}
            <section>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">8. Contato</h3>
              <div className="space-y-3 text-slate-700">
                <p>Para dúvidas sobre cookies ou para exercer seus direitos:</p>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p><strong>E-mail:</strong> contatodireitomastigado@gmail.com</p>
                  <p><strong>Assunto:</strong> Política de Cookies - Dúvidas</p>
                </div>
              </div>
            </section>
          </div>

          {/* Banner de Consentimento Exemplo */}
          <div className="mt-12 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-indigo-200">
            <h4 className="font-semibold text-slate-900 mb-3">Exemplo de Banner de Consentimento:</h4>
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-start gap-3">
                <Cookie className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-slate-700 mb-3">
                    Utilizamos cookies para melhorar sua experiência, personalizar conteúdo e analisar nosso tráfego. 
                    Ao continuar navegando, você concorda com nossa política de cookies.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      Aceitar Todos
                    </Button>
                    <Button size="sm" variant="outline">
                      Configurar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-slate-600">
                      Rejeitar Opcionais
                    </Button>
                  </div>
                </div>
              </div>
            </div>
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

export default CookiePolicy;
