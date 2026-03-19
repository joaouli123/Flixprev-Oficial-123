import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Activity, AlertTriangle, DollarSign, RefreshCcw, TrendingUp, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { buildApiUrl } from "@/lib/api";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type DashboardPeriod = "today" | "7d" | "30d" | "all";

interface DashboardChartPoint {
  label: string;
  value: number;
}

interface DashboardSummaryPayload {
  period: DashboardPeriod;
  period_label: string;
  new_users_label: string;
  generated_at: string;
  summary: {
    mrr: number;
    total_users: number;
    active_users: number;
    new_users: number;
    pending_payments: number;
    subscription_status: {
      free: number;
      trial: number;
      active: number;
      cancelled: number;
      expired: number;
    };
    completed_profiles: {
      count: number;
      percent: number;
    };
    quick_summary: {
      conversion_rate: number;
      average_ticket: number;
      inactive_users: number;
    };
    demographics: {
      by_origin: DashboardChartPoint[];
      by_region: DashboardChartPoint[];
      by_sex: DashboardChartPoint[];
      by_profession: DashboardChartPoint[];
      by_age_range: DashboardChartPoint[];
    };
    action_metrics: {
      total_events: number;
      active_users: number;
      by_action: DashboardChartPoint[];
      by_channel: DashboardChartPoint[];
      recent_events: Array<{
        label: string;
        action: string;
        channel: string;
        user_name: string;
        created_at: string | null;
      }>;
    };
  };
  charts: {
    user_growth: DashboardChartPoint[];
    revenue: DashboardChartPoint[];
  };
}

const formatMetricLabel = (value: string) => String(value || "")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const dashboardPeriodOptions: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "all", label: "Todo o período" },
];

const userGrowthChartConfig = {
  value: {
    label: "Usuários",
    color: "#4f46e5",
  },
};

const revenueChartConfig = {
  value: {
    label: "Receita",
    color: "#10b981",
  },
};

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const formatInteger = (value: number) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));

const formatPercent = (value: number) => `${Number(value || 0).toFixed(0)}%`;

const AdminDashboard: React.FC = () => {
  const { isAdmin, session } = useSession();
  const navigate = useNavigate();
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryPayload | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>("all");
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }
    if (!isAdmin) {
      toast.error("Acesso negado. Você não tem permissão de administrador.");
      navigate("/app");
    }
  }, [isAdmin, session, navigate]);

  const fetchDashboardSummary = useCallback(async (period: DashboardPeriod) => {
    if (!session?.user?.id) {
      setDashboardSummary(null);
      setDashboardLoading(false);
      return;
    }

    setDashboardLoading(true);

    try {
      const response = await fetch(buildApiUrl(`/api/admin/dashboard-summary?period=${period}`), {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.user.id,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const payload = await response.json();
      setDashboardSummary(payload as DashboardSummaryPayload);
    } catch (error: any) {
      console.error("Erro ao carregar resumo do dashboard:", error?.message || error);
      toast.error("Erro ao carregar dashboard: " + (error?.message || "falha desconhecida"));
    } finally {
      setDashboardLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (isAdmin) {
      const load = async () => {
        setLoading(true);
        await fetchDashboardSummary(selectedPeriod);
        setLoading(false);
      };

      void load();
    }
  }, [isAdmin, fetchDashboardSummary, selectedPeriod]);

  if (!isAdmin) {
    return null;
  }

  if (loading || (dashboardLoading && !dashboardSummary)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando dashboard...</p>
      </div>
    );
  }

  const summary = dashboardSummary?.summary;
  const completedProfiles = summary?.completed_profiles;
  const quickSummary = summary?.quick_summary;
  const subscriptionStatus = summary?.subscription_status;
  const demographics = summary?.demographics;
  const actionMetrics = summary?.action_metrics;
  const stats = [
    {
      label: "MRR",
      title: "Receita recorrente",
      value: formatCurrency(summary?.mrr ?? 0),
      description: "Estimativa mensal atual",
      icon: DollarSign,
      iconClassName: "bg-emerald-100 text-emerald-600",
    },
    {
      label: "Usuários ativos",
      title: "Engajamento",
      value: formatInteger(summary?.active_users ?? 0),
      description: `de ${formatInteger(summary?.total_users ?? 0)} no total`,
      icon: Users,
      iconClassName: "bg-blue-100 text-blue-600",
    },
    {
      label: "Novos no período",
      title: "Aquisição",
      value: formatInteger(summary?.new_users ?? 0),
      description: dashboardSummary?.new_users_label || "No período selecionado",
      icon: UserPlus,
      iconClassName: "bg-violet-100 text-violet-600",
    },
    {
      label: "Pagamentos pendentes",
      title: "Acompanhamento",
      value: formatInteger(summary?.pending_payments ?? 0),
      description: "Aguardando confirmação",
      icon: AlertTriangle,
      iconClassName: "bg-amber-100 text-amber-600",
    },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Visão geral da plataforma com métricas, evolução e distribuição da base.</p>
        </div>
        <div className="flex items-center gap-3 self-start lg:self-auto">
          <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as DashboardPeriod)}>
            <SelectTrigger className="h-11 w-[220px] rounded-xl border-slate-200 bg-white/80 text-slate-700 shadow-sm">
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              {dashboardPeriodOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl bg-white/80 shadow-sm"
            onClick={() => void fetchDashboardSummary(selectedPeriod)}
            disabled={dashboardLoading}
          >
            <RefreshCcw className={`h-5 w-5 ${dashboardLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
          </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{item.label}</p>
                  <CardTitle className="mt-2 text-base font-semibold text-slate-900">{item.title}</CardTitle>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.iconClassName}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-4xl font-bold tracking-tight text-slate-900">{item.value}</div>
                <p className="mt-2 text-sm text-slate-500">{item.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <CardTitle className="text-xl font-semibold text-gray-900">Resumo da Base</CardTitle>
            <CardDescription className="text-gray-500">
              Conversão, ticket médio e nível de preenchimento do cadastro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Taxa de conversão</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatPercent(quickSummary?.conversion_rate ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Ticket médio</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(quickSummary?.average_ticket ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Usuários inativos</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatInteger(quickSummary?.inactive_users ?? 0)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">Perfis completos</p>
                  <div className="mt-2 text-4xl font-bold text-slate-900">{formatInteger(completedProfiles?.count ?? 0)}</div>
                </div>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {formatPercent(completedProfiles?.percent ?? 0)} da base
                </Badge>
              </div>
              <Progress value={completedProfiles?.percent ?? 0} className="mt-5 h-3 bg-slate-100 [&>div]:bg-indigo-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <CardTitle className="text-xl font-semibold text-gray-900">Status de Assinaturas</CardTitle>
            <CardDescription className="text-gray-500">
              Distribuição atual da base por estágio de assinatura.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 p-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="text-3xl font-bold text-emerald-600">{formatInteger(subscriptionStatus?.active ?? 0)}</div>
              <p className="mt-2 text-sm text-slate-500">Ativos</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="text-3xl font-bold text-sky-600">{formatInteger(subscriptionStatus?.trial ?? 0)}</div>
              <p className="mt-2 text-sm text-slate-500">Trial</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="text-3xl font-bold text-slate-700">{formatInteger(subscriptionStatus?.free ?? 0)}</div>
              <p className="mt-2 text-sm text-slate-500">Free</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{formatInteger(subscriptionStatus?.cancelled ?? 0)}</div>
              <p className="mt-2 text-sm text-slate-500">Cancelados</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="text-3xl font-bold text-rose-600">{formatInteger(subscriptionStatus?.expired ?? 0)}</div>
              <p className="mt-2 text-sm text-slate-500">Expirados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Crescimento de Usuários
            </CardTitle>
            <CardDescription>Entrada de usuários ao longo do recorte selecionado.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 pb-[50px]">
            <ChartContainer config={userGrowthChartConfig} className="h-[320px] w-full">
              <AreaChart data={dashboardSummary?.charts.user_growth || []} margin={{ top: 16, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardUserGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} minTickGap={16} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="url(#dashboardUserGrowth)" strokeWidth={4} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Receita no tempo
            </CardTitle>
            <CardDescription>Evolução da receita associada aos eventos de assinatura do período.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 pb-[50px]">
            <ChartContainer config={revenueChartConfig} className="h-[320px] w-full">
              <AreaChart data={dashboardSummary?.charts.revenue || []} margin={{ top: 16, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenueGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} minTickGap={16} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="url(#dashboardRevenueGrowth)" strokeWidth={4} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <CardTitle className="text-xl font-semibold text-gray-900">Demografia e Cadastro</CardTitle>
            <CardDescription className="text-gray-500">
              Distribuição por profissão, faixa etária, sexo, região e origem.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            {[
              { title: 'Profissões', items: demographics?.by_profession || [] },
              { title: 'Faixa etária', items: demographics?.by_age_range || [] },
              { title: 'Sexo', items: demographics?.by_sex || [] },
              { title: 'Região', items: demographics?.by_region || [] },
              { title: 'Origem', items: demographics?.by_origin || [] },
            ].map((group) => (
              <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{group.title}</p>
                <div className="mt-3 space-y-2">
                  {group.items.length === 0 ? (
                    <p className="text-sm text-slate-500">Sem dados no período.</p>
                  ) : group.items.map((item) => (
                    <div key={`${group.title}-${item.label}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{formatMetricLabel(item.label)}</span>
                      <span className="font-semibold text-slate-900">{formatInteger(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Activity className="h-5 w-5 text-indigo-500" />
              Ações e Compartilhamentos
            </CardTitle>
            <CardDescription className="text-gray-500">
              Eventos da plataforma, canais utilizados e atividade recente registrada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Eventos no período</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatInteger(actionMetrics?.total_events ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Usuários com ação</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatInteger(actionMetrics?.active_users ?? 0)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">Top ações</p>
                <div className="mt-3 space-y-2">
                  {(actionMetrics?.by_action || []).length === 0 ? (
                    <p className="text-sm text-slate-500">Sem ações registradas.</p>
                  ) : (actionMetrics?.by_action || []).map((item) => (
                    <div key={`action-${item.label}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{formatMetricLabel(item.label)}</span>
                      <span className="font-semibold text-slate-900">{formatInteger(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">Canais</p>
                <div className="mt-3 space-y-2">
                  {(actionMetrics?.by_channel || []).length === 0 ? (
                    <p className="text-sm text-slate-500">Sem canais registrados.</p>
                  ) : (actionMetrics?.by_channel || []).map((item) => (
                    <div key={`channel-${item.label}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{formatMetricLabel(item.label)}</span>
                      <span className="font-semibold text-slate-900">{formatInteger(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Ações recentes</p>
              <div className="mt-3 space-y-3">
                {(actionMetrics?.recent_events || []).length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma ação recente registrada.</p>
                ) : (actionMetrics?.recent_events || []).map((event, index) => (
                  <div key={`${event.action}-${event.created_at || index}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{event.user_name}</div>
                      <div className="text-sm text-slate-600">{event.label}</div>
                      <div className="text-xs text-slate-400">{formatMetricLabel(event.action)} via {formatMetricLabel(event.channel)}</div>
                    </div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">
                      {event.created_at ? new Date(event.created_at).toLocaleString("pt-BR") : "-"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
