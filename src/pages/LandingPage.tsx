import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Link, useLocation } from "react-router-dom";
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
  Scale,
  Landmark,
  Coins,
  Cpu,
  Check,
  type LucideIcon 
} from "lucide-react";
import { neon as supabase } from "@/lib/neon"
import { Agent, Category } from "@/types/app";
import { toast } from "sonner";
import { normalizeAgentDescription, normalizeAgentTitle } from "@/lib/agentText";

/* ─── Configuração de cores por categoria ─── */
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; gradient: string; icon: LucideIcon }> = {
  "previdenciário": { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", gradient: "from-blue-500 to-indigo-600", icon: Shield },
  "previdenciario": { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", gradient: "from-blue-500 to-indigo-600", icon: Shield },
  "trabalhista": { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", gradient: "from-emerald-500 to-green-600", icon: Scale },
  "tributário": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", gradient: "from-amber-500 to-orange-600", icon: Coins },
  "tributario": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", gradient: "from-amber-500 to-orange-600", icon: Coins },
  "prompts ia": { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", gradient: "from-purple-500 to-violet-600", icon: Cpu },
  "stj": { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", gradient: "from-rose-500 to-pink-600", icon: Landmark },
};

function normalizeCategoryName(rawName: string) {
  return rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/direito\s*/gi, "")
    .trim();
}

function sortCategoriesWithPrevidenciarioFirst(categoryList: Category[]) {
  return [...categoryList].sort((a, b) => {
    const aName = normalizeCategoryName(a.name);
    const bName = normalizeCategoryName(b.name);
    const aIsPrevidenciario = aName.includes("previdenciario");
    const bIsPrevidenciario = bName.includes("previdenciario");

    if (aIsPrevidenciario && !bIsPrevidenciario) return -1;
    if (!aIsPrevidenciario && bIsPrevidenciario) return 1;

    return 0;
  });
}

function getCategoryTheme(name: string) {
  const key = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/direito\s*/i, "");
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", gradient: "from-indigo-500 to-blue-600", icon: Brain };
}

function isVisibleCategory(rawName: string) {
  const normalized = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalized === "prompt" || normalized === "prompts ia") return false;

  return !/^test(e)?\b/.test(normalized);
}

function isVisibleAgent(agent: Agent) {
  const description = String(agent.description || "").trim();

  return !/gerado a partir do PDF mestre de agentes/i.test(description);
}

const LandingPage = () => {
  const location = useLocation();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("");

  const referralCode = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get("ref") || "";
    const cleanedFromQuery = fromQuery.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();

    if (cleanedFromQuery) {
      localStorage.setItem("referral_code", cleanedFromQuery);
      return cleanedFromQuery;
    }

    const fromStorage = localStorage.getItem("referral_code") || "";
    return fromStorage.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  }, [location.search]);

  const checkoutUrl = useMemo(() => {
    const url = new URL("https://pay.cakto.com.br/vhmancx_628125");
    if (referralCode) {
      url.searchParams.set("ref", referralCode);
      url.searchParams.set("referral_code", referralCode);
      url.searchParams.set("codigo_indicacao", referralCode);
      url.searchParams.set("utm_content", referralCode);
    }
    return url.toString();
  }, [referralCode]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Buscar agentes e categorias em paralelo
      const [agentsRes, catsRes] = await Promise.all([
        supabase.from("agents").select("id, title, description, icon, category_ids"),
        supabase.from("categories").select("id, name"),
      ]);

      if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
      if (catsRes.data) setCategories(catsRes.data as Category[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const visibleCategories = useMemo(() => {
    return sortCategoriesWithPrevidenciarioFirst(
      categories.filter((category) => isVisibleCategory(category.name))
    );
  }, [categories]);

  const visibleAgents = useMemo(() => {
    return agents.filter((agent) => isVisibleAgent(agent));
  }, [agents]);

  // Contagem de agentes por categoria
  const agentsCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of visibleCategories) counts.set(cat.id, 0);
    for (const agent of visibleAgents) {
      const uniqueCategoryIds = [...new Set((agent.category_ids || []).map((categoryId) => String(categoryId)))];
      for (const cid of uniqueCategoryIds) {
        counts.set(cid, (counts.get(cid) || 0) + 1);
      }
    }
    return counts;
  }, [visibleAgents, visibleCategories]);

  // Agentes filtrados pela aba ativa
  const visibleAgentsForTab = useMemo(() => {
    if (!activeTab) return visibleAgents;
    return visibleAgents.filter((a) => (a.category_ids || []).includes(activeTab));
  }, [visibleAgents, activeTab]);

  useEffect(() => {
    if (!visibleCategories.length) return;
    if (!activeTab || !visibleCategories.some((c) => c.id === activeTab)) {
      setActiveTab(visibleCategories[0].id);
    }
  }, [visibleCategories, activeTab]);

  // Ícone único para agentes na listagem clean
  const AgentListIcon = Check;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-gray-800 flex flex-col relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <LandingNavbar />

      <main className="flex-grow flex flex-col relative z-10">
        {/* Hero Section Compacta */}
        <section id="inicio-section" className="flex flex-col items-center justify-center px-4 py-16 sm:py-20">
          <div className="text-center max-w-4xl mx-auto">
            {/* Ícone principal */}
            <div className="mb-6 relative">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/25 transform transition-all hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-4 duration-1000">
                <Brain className="h-12 w-12 text-white" />
              </div>
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse"></div>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-4 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent leading-tight animate-in fade-in-0 slide-in-from-bottom-6 duration-1000 delay-200">
              FlixPrev I.A
            </h1>

            <p className="text-xl sm:text-2xl mb-3 text-slate-700 font-medium animate-in fade-in-0 slide-in-from-bottom-8 duration-1000 delay-400">
              Inteligência Artificial para
            </p>
            <p className="text-2xl sm:text-3xl mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent font-bold animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-600">
              Advocacia Inteligente
            </p>

            <p className="text-lg sm:text-xl mb-8 text-slate-600 leading-relaxed max-w-3xl mx-auto animate-in fade-in-0 slide-in-from-bottom-12 duration-1000 delay-800">
              Plataforma de IA especializada em Direito Previdenciário, Trabalhista e Tributário. 
              Automatize análises, otimize processos e maximize seus resultados.
            </p>

            {/* Category tabs no Hero */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 animate-in fade-in-0 slide-in-from-bottom-14 duration-1000 delay-900 max-w-5xl mx-auto">
              {visibleCategories.map((cat) => {
                const theme = getCategoryTheme(cat.name);
                const count = agentsCountByCategory.get(cat.id) || 0;
                const CatIcon = theme.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveTab(cat.id);
                      document.getElementById("agentes-section")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`group flex items-center gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 font-semibold text-xs sm:text-sm transition-all duration-300 hover:scale-105 hover:-translate-y-0.5 shadow-sm hover:shadow-lg whitespace-nowrap ${
                      activeTab === cat.id
                        ? "bg-[#434dce] border-[#434dce] text-white shadow-md"
                        : "bg-white/70 border-slate-200/80 text-slate-600 hover:bg-white"
                    }`}
                  >
                    <CatIcon className={`w-4 h-4 ${activeTab === cat.id ? "text-white" : "text-[#434dce]"}`} />
                    <span>{cat.name}</span>
                    <span className={`ml-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                      activeTab === cat.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* CTA Button */}
            <div className="animate-in fade-in-0 slide-in-from-bottom-14 duration-1000 delay-1000">
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-12 py-6 text-xl rounded-2xl shadow-2xl shadow-blue-500/25 transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 group">
                  <span className="flex items-center gap-3">
                    Começar Agora
                    <ArrowRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
                  </span>
                </Button>
              </a>
            </div>

            {/* Badges de confiança */}
            <div className="mt-12 flex flex-wrap justify-center gap-6 animate-in fade-in-0 slide-in-from-bottom-16 duration-1000 delay-1200">
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <Shield className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-slate-700">100% Seguro</span>
              </div>
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <Zap className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-slate-700">IA Avançada</span>
              </div>
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <Users className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium text-slate-700">Suporte 24/7</span>
              </div>
            </div>
          </div>
        </section>

        {/* Seção de Recursos */}
        <section id="recursos-section" className="py-20 px-4 bg-white/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                Por que escolher o FlixPrev I.A?
              </h2>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto">
                Nossa plataforma combina tecnologia de ponta com expertise jurídica para transformar sua advocacia
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Brain,
                  title: "IA Especializada",
                  description: "Algoritmos treinados especificamente para direito previdenciário, trabalhista e tributário"
                },
                {
                  icon: Zap,
                  title: "Análise Rápida",
                  description: "Processe documentos e casos em segundos, não em horas"
                },
                {
                  icon: Shield,
                  title: "Segurança Total",
                  description: "Criptografia de ponta a ponta e conformidade com LGPD"
                },
                {
                  icon: TrendingUp,
                  title: "Resultados Comprovados",
                  description: "Aumente sua taxa de sucesso em até 40% com nossas análises"
                },
                {
                  icon: Users,
                  title: "Suporte Especializado",
                  description: "Equipe de advogados e desenvolvedores disponível 24/7"
                },
                {
                  icon: Smartphone,
                  title: "Acesso Mobile",
                  description: "Trabalhe de qualquer lugar com nossa plataforma responsiva"
                }
              ].map((feature, index) => (
                <Card key={index} className="p-8 bg-white/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 group rounded-2xl">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#434dce] to-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-md shadow-indigo-500/25">
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold mb-4 text-slate-900">{feature.title}</CardTitle>
                  <CardDescription className="text-slate-600 leading-relaxed">{feature.description}</CardDescription>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Seção de Agentes com Tabs por Categoria */}
        <section id="agentes-section" className="py-24 px-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 relative overflow-hidden">
          {/* Elementos decorativos de fundo */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
          </div>

          <div className="max-w-7xl mx-auto relative z-10">
            {/* Header da seção */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 backdrop-blur-sm px-6 py-3 rounded-full border border-indigo-200/50 mb-8">
                <Sparkles className="h-6 w-6 text-indigo-600" />
                <span className="text-indigo-700 font-semibold text-sm uppercase tracking-wider">Inteligência Artificial</span>
              </div>
              
              <h2 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
                <span className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
                  Especialistas por Área Jurídica
                </span>
              </h2>
              
              <p className="text-xl text-slate-600 max-w-4xl mx-auto leading-relaxed mb-10">
                Conheça assistentes de IA especializados para apoiar decisões jurídicas com mais precisão e agilidade
              </p>

              {/* Tabs de Categoria */}
              <div className="flex flex-wrap justify-center gap-3">
                {visibleCategories.map((cat) => {
                  const theme = getCategoryTheme(cat.name);
                  const count = agentsCountByCategory.get(cat.id) || 0;
                  const CatIcon = theme.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-300 border-2 whitespace-nowrap ${
                        activeTab === cat.id
                          ? "bg-[#434dce] border-[#434dce] text-white shadow-md"
                          : "bg-white/70 text-slate-600 border-slate-200 hover:bg-white hover:border-slate-300"
                      }`}
                    >
                      <CatIcon className={`w-4 h-4 ${activeTab === cat.id ? "text-white" : "text-[#434dce]"}`} />
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="relative">
                  <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-200"></div>
                  <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-600 border-t-transparent absolute top-0 left-0"></div>
                </div>
              </div>
            ) : visibleAgentsForTab.length === 0 ? (
              <div className="text-center py-16">
                <Bot className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Nenhum especialista nesta categoria</h3>
                <p className="text-slate-500">Selecione outra categoria para ver os agentes disponíveis.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {visibleAgentsForTab.map((agent) => (
                  <Card key={agent.id} className="group p-3 bg-white/90 backdrop-blur-sm border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl overflow-hidden relative">
                    <div className="relative z-10 flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm shadow-green-500/10 shrink-0">
                        <AgentListIcon className="h-5 w-5 text-green-600" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-slate-900 group-hover:text-green-700 transition-colors duration-300 line-clamp-1 m-0">
                        {normalizeAgentTitle(agent.title, agent.description)}
                      </CardTitle>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CTA Final */}
        <section id="planos-section" className="py-20 px-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Pronto para revolucionar sua advocacia?
            </h2>
            <p className="text-xl mb-10 opacity-90">
              Junte-se aos advogados que já estão usando IA para maximizar seus resultados
            </p>
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-white text-indigo-600 hover:bg-gray-100 font-bold px-12 py-6 text-xl rounded-2xl shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1">
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
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl"></div>
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
                  <Lock className="w-4 h-4 text-indigo-400" />
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
                    className="text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-2 group"
                  >
                    <FileText className="w-4 h-4 group-hover:text-indigo-400" />
                    Política de Privacidade
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/terms" 
                    className="text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-2 group"
                  >
                    <ScrollText className="w-4 h-4 group-hover:text-indigo-400" />
                    Termos de Uso
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/cookie-policy" 
                    className="text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-2 group"
                  >
                    <Cookie className="w-4 h-4 group-hover:text-indigo-400" />
                    Política de Cookies
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/lgpd" 
                    className="text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-2 group"
                  >
                    <Shield className="w-4 h-4 group-hover:text-indigo-400" />
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
                    className="text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-2 group"
                  >
                    <Mail className="w-4 h-4 group-hover:text-indigo-400" />
                    <span className="break-all">contatodireitomastigado@gmail.com</span>
                  </a>
                </li>
                <li>
                  <a 
                    href="tel:+5511932064655" 
                    className="text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-2 group"
                  >
                    <Phone className="w-4 h-4 group-hover:text-indigo-400" />
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
