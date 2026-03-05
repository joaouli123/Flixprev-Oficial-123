import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, DollarSign, Sigma, AlertCircle, RefreshCcw, Zap } from "lucide-react";
import { useSession } from "@/components/SessionContextProvider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type UsageRequestRow = {
  id: number;
  created_at: string;
  usuario: string;
  tipo: string;
  tokens: number;
  cost_usd: number;
  status: string;
};

type UsageUserRow = {
  user_id: string;
  nome: string;
  email: string;
  requests: number;
  total_tokens: number;
  total_cost_usd: number;
  ultima_atividade: string | null;
};

type UsageResponse = {
  range_days: number;
  summary: {
    tokens_today: number;
    cost_today: number;
    requests: number;
    errors: number;
    error_rate: number;
    tokens_month: number;
    cost_month: number;
    total_tokens_range: number;
    total_cost_range: number;
  };
  by_user: UsageUserRow[];
  requests: UsageRequestRow[];
};

const formatUsd = (value: number) => `$${Number(value || 0).toFixed(6)}`;

const AILogs: React.FC = () => {
  const { isAdmin, session, user } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }

    if (!isAdmin) {
      toast.error("Acesso negado. Você não tem permissão de administrador.");
      navigate("/app");
    }
  }, [isAdmin, navigate, session]);

  const loadLogs = async () => {
    if (!isAdmin || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/ai-usage?days=${days}`, {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const payload = await response.json();
      setData(payload as UsageResponse);
    } catch (error: any) {
      toast.error("Erro ao carregar logs de IA: " + (error?.message || "falha desconhecida"));
      setData({
        range_days: days,
        summary: {
          tokens_today: 0,
          cost_today: 0,
          requests: 0,
          errors: 0,
          error_rate: 0,
          tokens_month: 0,
          cost_month: 0,
          total_tokens_range: 0,
          total_cost_range: 0,
        },
        by_user: [],
        requests: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [isAdmin, user?.id, days]);

  const summary = useMemo(() => {
    return (
      data?.summary || {
        tokens_today: 0,
        cost_today: 0,
        requests: 0,
        errors: 0,
        error_rate: 0,
        tokens_month: 0,
        cost_month: 0,
        total_tokens_range: 0,
        total_cost_range: 0,
      }
    );
  }, [data]);

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando logs de IA...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Logs de IA</h1>
          <p className="text-gray-500">Monitore uso e custos da IA (USD)</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-slate-800"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <Button variant="outline" onClick={loadLogs} className="h-10">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-indigo-50/50 border-b border-indigo-100/50">
            <CardTitle className="text-sm font-semibold text-indigo-800">Tokens Hoje</CardTitle>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Sigma className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{summary.tokens_today}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Consumo no dia</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-emerald-50/50 border-b border-emerald-100/50">
            <CardTitle className="text-sm font-semibold text-emerald-800">Custo Hoje</CardTitle>
            <div className="p-2 bg-emerald-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{formatUsd(summary.cost_today)}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Valor no dia</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-blue-50/50 border-b border-blue-100/50">
            <CardTitle className="text-sm font-semibold text-blue-800">Requests</CardTitle>
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{summary.requests}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">No período selecionado</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-red-50/50 border-b border-red-100/50">
            <CardTitle className="text-sm font-semibold text-red-800">Taxa de Erro</CardTitle>
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{summary.error_rate}%</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Falhas no período</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-violet-50/50 border-b border-violet-100/50">
            <CardTitle className="text-sm font-semibold text-violet-800">Tokens Este Mês</CardTitle>
            <div className="p-2 bg-violet-100 rounded-lg">
              <Zap className="h-4 w-4 text-violet-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{summary.tokens_month}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Acumulado mensal</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-green-50/50 border-b border-green-100/50">
            <CardTitle className="text-sm font-semibold text-green-800">Custo Este Mês</CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{formatUsd(summary.cost_month)}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Acumulado mensal</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-gray-900">Histórico de Requisições</CardTitle>
          <span className="text-slate-400 text-sm">{data?.requests?.length || 0} logs</span>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DATA/HORA</TableHead>
                <TableHead>USUÁRIO</TableHead>
                <TableHead>TIPO</TableHead>
                <TableHead className="text-right">TOKENS</TableHead>
                <TableHead className="text-right">CUSTO (USD)</TableHead>
                <TableHead>STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.requests?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    Sem requisições registradas no período.
                  </TableCell>
                </TableRow>
              ) : (
                data.requests.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—"}</TableCell>
                    <TableCell>{row.usuario || "Sem identificação"}</TableCell>
                    <TableCell>{row.tipo || "chat_completion"}</TableCell>
                    <TableCell className="text-right">{Number(row.tokens || 0)}</TableCell>
                    <TableCell className="text-right text-emerald-600 font-semibold">{formatUsd(Number(row.cost_usd || 0))}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "error" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {row.status || "success"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AILogs;
