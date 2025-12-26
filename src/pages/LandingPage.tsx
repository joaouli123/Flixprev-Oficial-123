import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/layout/LandingNavbar";
import { 
  Brain, 
  ArrowRight, 
  Shield, 
  Zap, 
  Users, 
  TrendingUp, 
  Smartphone, 
  Sparkles, 
  Bot, 
  Rocket, 
  Lock, 
  FileText, 
  ScrollText, 
  Cookie, 
  Mail, 
  Phone, 
  Heart,
  type LucideIcon 
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Agent } from "@/types/app";
import { toast } from "sonner";

const LandingPage = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("agents")
        .select("id, title, description, icon");

      if (error || !data) {
        // Fallback: dados mock quando Supabase não está disponível
        const mockAgents: Agent[] = [
          {
            id: "1",
            title: "Assistente Geral",
            description: "Um assistente geral para responder suas dúvidas",
            icon: "Bot"
          },
          {
            id: "2", 
            title: "Consultor de Negócios",
            description: "Ajuda com estratégias e consultoria empresarial",
            icon: "TrendingUp"
          },
          {
            id: "3",
            title: "Especialista em Tecnologia",
            description: "Suporte e orientação em questões tecnológicas",
            icon: "Zap"
          }
        ];
        setAgents(mockAgents);
      } else {
        setAgents(data as Agent[]);
      }
      setLoading(false);
    };

    fetchAgents();
  }, []);

  // Mapa de ícones para evitar import dinâmico
  const iconMap: Record<string, LucideIcon> = {
    Brain, ArrowRight, Shield, Zap, Users, TrendingUp, Smartphone, 
    Sparkles, Bot, Rocket, Lock, FileText, ScrollText, Cookie, Mail, Phone, Heart
  };
  
  const getLucideIcon = (iconName: string): LucideIcon => {
    return iconMap[iconName] || Bot;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-gray-800 flex flex-col relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <LandingNavbar />

      <main className="flex-grow flex flex-col relative z-10">
        {/* Hero Section Redesenhada */}
        <section className="flex-grow flex flex-col items-center justify-center px-4 py-16 sm:py-24">
          <div className="text-center max-w-4xl mx-auto">
            {/* Ícone principal com animação */}
            <div className="mb-8 relative">
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/25 transform transition-all hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-4 duration-1000">
                <Brain className="h-16 w-16 text-white" />
              </div>
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse"></div>
            </div>

            {/* Título principal */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent leading-tight animate-in fade-in-0 slide-in-from-bottom-6 duration-1000 delay-200">
              FlixPrev I.A
            </h1>

            {/* Subtítulo */}
            <p className="text-xl sm:text-2xl lg:text-3xl mb-4 text-slate-700 font-medium animate-in fade-in-0 slide-in-from-bottom-8 duration-1000 delay-400">
              Inteligência Artificial para
            </p>
            <p className="text-2xl sm:text-3xl lg:text-4xl mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent font-bold animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-600">
              Advocacia Previdenciária
            </p>

            {/* Descrição */}
            <p className="text-lg sm:text-xl mb-12 text-slate-600 leading-relaxed max-w-3xl mx-auto animate-in fade-in-0 slide-in-from-bottom-12 duration-1000 delay-800">
              Revolucione sua prática jurídica com nossa plataforma de IA especializada em direito previdenciário. 
              Automatize análises, otimize processos e maximize seus resultados.
            </p>

            {/* CTA Button */}
            <div className="animate-in fade-in-0 slide-in-from-bottom-14 duration-1000 delay-1000">
              <a href="https://pay.cakto.com.br/vhmancx_628125" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-12 py-6 text-xl rounded-2xl shadow-2xl shadow-blue-500/25 transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 group">
                  <span className="flex items-center gap-3">
                    Começar Agora
                    <ArrowRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
                  </span>
                </Button>
              </a>
            </div>

            {/* Badges de confiança */}
            <div className="mt-16 flex flex-wrap justify-center gap-6 animate-in fade-in-0 slide-in-from-bottom-16 duration-1000 delay-1200">
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <Shield className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-slate-700">100% Seguro</span>
              </div>
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <Zap className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-slate-700">IA Avançada</span>
              </div>
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <Users className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-slate-700">Suporte 24/7</span>
              </div>
            </div>
          </div>
        </section>

        {/* Seção de Recursos */}
        <section className="py-20 px-4 bg-white/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                Por que escolher o FlixPrev I.A?
              </h2>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto">
                Nossa plataforma combina tecnologia de ponta com expertise jurídica para transformar sua advocacia previdenciária
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Brain,
                  title: "IA Especializada",
                  description: "Algoritmos treinados especificamente para direito previdenciário com alta precisão",
                  color: "from-blue-500 to-indigo-600"
                },
                {
                  icon: Zap,
                  title: "Análise Rápida",
                  description: "Processe documentos e casos em segundos, não em horas",
                  color: "from-yellow-500 to-orange-600"
                },
                {
                  icon: Shield,
                  title: "Segurança Total",
                  description: "Criptografia de ponta a ponta e conformidade com LGPD",
                  color: "from-green-500 to-emerald-600"
                },
                {
                  icon: TrendingUp,
                  title: "Resultados Comprovados",
                  description: "Aumente sua taxa de sucesso em até 40% com nossas análises",
                  color: "from-purple-500 to-pink-600"
                },
                {
                  icon: Users,
                  title: "Suporte Especializado",
                  description: "Equipe de advogados e desenvolvedores disponível 24/7",
                  color: "from-cyan-500 to-blue-600"
                },
                {
                  icon: Smartphone,
                  title: "Acesso Mobile",
                  description: "Trabalhe de qualquer lugar com nossa plataforma responsiva",
                  color: "from-rose-500 to-red-600"
                }
              ].map((feature, index) => (
                <Card key={index} className="p-8 bg-white/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 group rounded-2xl">
                  <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold mb-4 text-slate-900">{feature.title}</CardTitle>
                  <CardDescription className="text-slate-600 leading-relaxed">{feature.description}</CardDescription>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Seção de Agentes Redesenhada */}
        <section className="py-24 px-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 relative overflow-hidden">
          {/* Elementos decorativos de fundo */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
          </div>

          <div className="max-w-7xl mx-auto relative z-10">
            {/* Header da seção melhorado */}
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 backdrop-blur-sm px-6 py-3 rounded-full border border-blue-200/50 mb-8">
                <Sparkles className="h-6 w-6 text-blue-600" />
                <span className="text-blue-700 font-semibold text-sm uppercase tracking-wider">Inteligência Artificial</span>
              </div>
              
              <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-tight">
                <span className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
                  Nossos Assistentes
                </span>
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Inteligentes
                </span>
              </h2>
              
              <p className="text-xl sm:text-2xl text-slate-600 max-w-4xl mx-auto leading-relaxed">
                Assistentes de IA especializados, treinados com milhares de casos reais para 
                <span className="text-blue-600 font-semibold"> revolucionar sua advocacia</span>
              </p>

              {/* Estatísticas impressionantes */}
              <div className="flex flex-wrap justify-center gap-8 mt-12">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">98%</div>
                  <div className="text-sm text-slate-500 uppercase tracking-wide">Precisão</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">24/7</div>
                  <div className="text-sm text-slate-500 uppercase tracking-wide">Disponível</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">+1000</div>
                  <div className="text-sm text-slate-500 uppercase tracking-wide">Casos Analisados</div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="relative">
                  <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-200"></div>
                  <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-600 border-t-transparent absolute top-0 left-0"></div>
                </div>
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-20">
                <div className="relative inline-block mb-8">
                  <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl">
                    <Bot className="w-16 h-16 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-slate-900 mb-4">Assistentes em Preparação</h3>
                <p className="text-xl text-slate-600 mb-2">Nossos especialistas estão finalizando o treinamento</p>
                <p className="text-slate-500 mb-8">Em breve, você terá acesso aos assistentes mais avançados do mercado</p>
                <Link to="/login" className="inline-block">
                  <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-10 py-4 rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:-translate-y-1 text-lg">
                    <span className="flex items-center gap-3">
                      <Rocket className="w-5 h-5" />
                      Ser Notificado do Lançamento
                    </span>
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {agents.map((agent, index) => {
                  const IconComponent = getLucideIcon(agent.icon);
                  const gradients = [
                    "from-blue-500 to-indigo-600",
                    "from-purple-500 to-pink-600", 
                    "from-green-500 to-emerald-600",
                    "from-orange-500 to-red-600",
                    "from-cyan-500 to-blue-600",
                    "from-violet-500 to-purple-600"
                  ];
                  const gradient = gradients[index % gradients.length];
                  
                  return (
                    <Card key={agent.id} className="group p-8 bg-white/90 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-all duration-700 hover:-translate-y-4 rounded-3xl overflow-hidden relative flex flex-col h-full">
                      {/* Background gradient animado mais sutil */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${gradient.replace('500', '500/5').replace('600', '600/5')} opacity-0 group-hover:opacity-100 transition-opacity duration-700`}></div>
                      
                      {/* Badge de status */}
                      <div className="absolute top-4 right-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          ATIVO
                        </span>
                      </div>
                      
                      <div className="relative z-10 flex flex-col h-full">
                        {/* Ícone melhorado */}
                        <div className={`w-24 h-24 bg-gradient-to-br ${gradient} rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-2xl`}>
                          <IconComponent className="h-12 w-12 text-white" />
                        </div>
                        
                        {/* Título com animação */}
                        <CardTitle className="text-2xl font-bold mb-4 text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                          {agent.title}
                        </CardTitle>
                        
                        {/* Descrição melhorada - flex-grow para ocupar espaço disponível */}
                        <CardDescription className="text-slate-600 leading-relaxed text-base mb-8 group-hover:text-slate-700 transition-colors duration-300 flex-grow">
                          {agent.description}
                        </CardDescription>
                        
                        {/* Container fixo no final do card */}
                        <div className="mt-auto">
                          {/* Indicadores de capacidade */}
                          <div className="flex items-center justify-between text-sm text-slate-500 mb-6">
                            <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-yellow-500" />
                              <span>Resposta Instantânea</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-green-500" />
                              <span>100% Seguro</span>
                            </div>
                          </div>

                          {/* Barra de progresso decorativa */}
                          <div className="w-full bg-slate-200 rounded-full h-2 mb-6 overflow-hidden">
                            <div className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-1000 group-hover:w-full`} style={{width: '85%'}}></div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Pronto para revolucionar sua advocacia?
            </h2>
            <p className="text-xl mb-10 opacity-90">
              Junte-se aos advogados que já estão usando IA para maximizar seus resultados
            </p>
            <a href="https://pay.cakto.com.br/vhmancx_628125" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 font-bold px-12 py-6 text-xl rounded-2xl shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1">
                Começar Agora
              </Button>
            </a>
          </div>
        </section>
      </main>

      {/* Rodapé com Links Úteis */}
      <footer className="bg-slate-900 text-white py-16 px-4 relative overflow-hidden">
        {/* Background decorativo */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {/* Logo e Descrição */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                  FlixPrev I.A
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed mb-6 max-w-md">
                Revolucionando a advocacia previdenciária com inteligência artificial avançada. 
                Automatize análises, otimize processos e maximize seus resultados.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span>LGPD Compliant</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Lock className="w-4 h-4 text-blue-400" />
                  <span>Dados Seguros</span>
                </div>
              </div>
            </div>

            {/* Links Legais */}
            <div>
              <h3 className="text-lg font-semibold mb-6 text-white">Legal</h3>
              <ul className="space-y-3">
                <li>
                  <Link 
                    to="/privacy" 
                    className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <FileText className="w-4 h-4 group-hover:text-blue-400" />
                    Política de Privacidade
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/terms" 
                    className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <ScrollText className="w-4 h-4 group-hover:text-blue-400" />
                    Termos de Uso
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/cookie-policy" 
                    className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <Cookie className="w-4 h-4 group-hover:text-blue-400" />
                    Política de Cookies
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/lgpd" 
                    className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <Shield className="w-4 h-4 group-hover:text-blue-400" />
                    Aviso LGPD
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contato */}
            <div>
              <h3 className="text-lg font-semibold mb-6 text-white">Contato</h3>
              <ul className="space-y-3">
                <li>
                  <a 
                    href="mailto:contatodireitomastigado@gmail.com" 
                    className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <Mail className="w-4 h-4 group-hover:text-blue-400" />
                    <span className="break-all">contatodireitomastigado@gmail.com</span>
                  </a>
                </li>
                <li>
                  <a 
                    href="tel:+5511932064655" 
                    className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <Phone className="w-4 h-4 group-hover:text-blue-400" />
                    <span>+55 (11) 93206-4655</span>
                  </a>
                </li>

              </ul>
            </div>
          </div>

          {/* Linha divisória */}
          <div className="border-t border-slate-700 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-slate-400 text-sm">
                © {new Date().getFullYear()} FlixPrev I.A. Todos os direitos reservados.
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <span className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-400" />
                  Feito com amor para advogados
                </span>
              </div>
            </div>
            
            {/* By Direito Mastigado */}
            <div className="flex justify-center mt-6 pt-6 border-t border-slate-700">
              <div className="text-white text-sm">
                By Direito Mastigado
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;