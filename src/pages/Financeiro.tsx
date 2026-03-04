import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/SessionContextProvider";
import { neon as supabase } from "@/lib/neon";

type UsuarioFinanceiro = {
  id?: string;
  user_id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  status_da_assinatura?: string | null;
  updated_at?: string | null;
  plan_type?: string | null;
};

type SubscriptionFinanceiro = {
  user_id?: string | null;
  plan_type?: string | null;
};

const normalizeStatus = (status?: string | null) => (status || "").trim().toLowerCase();

const isActiveSubscription = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  return ["ativo", "active", "paid", "premium", "approved"].includes(normalized);
};

const Financeiro: React.FC = () => {
  const { isAdmin, session } = useSession();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<UsuarioFinanceiro[]>([]);
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const load = async () => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, user_id, nome_completo, email, status_da_assinatura, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200)
        .execute();

      const { data: subscriptionsData } = await supabase
        .from("subscriptions")
        .select("user_id, plan_type")
        .limit(500)
        .execute();

      if (error) {
        toast.error("Erro ao carregar dados financeiros: " + error.message);
        setUsuarios([]);
      } else {
        const subscriptionsByUser = new Map<string, string>();
        ((subscriptionsData as SubscriptionFinanceiro[]) || []).forEach((subscription) => {
          const key = (subscription.user_id || "").toString().trim();
          if (key && !subscriptionsByUser.has(key)) {
            subscriptionsByUser.set(key, (subscription.plan_type || "").toString());
          }
        });

        const merged = ((data as UsuarioFinanceiro[]) || []).map((usuario) => {
          const userKey = (usuario.user_id || "").toString().trim();
          return {
            ...usuario,
            plan_type: subscriptionsByUser.get(userKey) || "basic",
          };
        });

        setUsuarios(merged);
      }

      setLoading(false);
    };

    load();
  }, [isAdmin]);

  const filteredUsuarios = useMemo(() => {
    return usuarios.filter((usuario) => {
      const status = normalizeStatus(usuario.status_da_assinatura);
      const plan = (usuario.plan_type || "basic").toString().toLowerCase();
      const updatedAt = usuario.updated_at ? new Date(usuario.updated_at) : null;

      const statusMatches = statusFilter === "all" || status === statusFilter;
      const planMatches = planFilter === "all" || plan === planFilter;

      let periodMatches = true;
      if (periodFilter !== "all" && updatedAt && !Number.isNaN(updatedAt.getTime())) {
        const days = Number(periodFilter);
        if (Number.isFinite(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          periodMatches = updatedAt >= cutoff;
        }
      }

      if (periodFilter !== "all" && !updatedAt) {
        periodMatches = false;
      }

      return statusMatches && planMatches && periodMatches;
    });
  }, [usuarios, periodFilter, statusFilter, planFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    usuarios.forEach((usuario) => {
      const status = normalizeStatus(usuario.status_da_assinatura);
      if (status) set.add(status);
    });
    return Array.from(set).sort();
  }, [usuarios]);

  const planOptions = useMemo(() => {
    const set = new Set<string>();
    usuarios.forEach((usuario) => {
      const plan = (usuario.plan_type || "basic").toString().toLowerCase();
      if (plan) set.add(plan);
    });
    return Array.from(set).sort();
  }, [usuarios]);

  const stats = useMemo(() => {
    const total = filteredUsuarios.length;
    const ativos = filteredUsuarios.filter((u) => isActiveSubscription(u.status_da_assinatura)).length;
    const inativos = Math.max(total - ativos, 0);
    return { total, ativos, inativos };
  }, [filteredUsuarios]);

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando dados financeiros...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Financeiro</h1>
        <p className="text-gray-500">Resumo de assinaturas e situação de clientes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-indigo-50/50 border-b border-indigo-100/50">
            <CardTitle className="text-sm font-semibold text-indigo-800">Total de Clientes</CardTitle>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Base monitorada</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-emerald-50/50 border-b border-emerald-100/50">
            <CardTitle className="text-sm font-semibold text-emerald-800">Assinaturas Ativas</CardTitle>
            <div className="p-2 bg-emerald-100 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{stats.ativos}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Status ativos</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-amber-50/50 border-b border-amber-100/50">
            <CardTitle className="text-sm font-semibold text-amber-800">Assinaturas Inativas</CardTitle>
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{stats.inativos}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Status inativos</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-slate-800"
            >
              <option value="all">Todo o período</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-slate-800"
            >
              <option value="all">Todos os status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-slate-800"
            >
              <option value="all">Todos os planos</option>
              {planOptions.map((plan) => (
                <option key={plan} value={plan}>
                  {plan.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Wallet className="h-5 w-5 text-gray-700" />
          </div>
          <CardTitle className="text-xl font-bold text-gray-900">Últimas atualizações</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Atualizado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsuarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsuarios.map((usuario) => (
                  <TableRow key={usuario.id || `${usuario.email}-${usuario.updated_at}`}>
                    <TableCell className="font-medium">{usuario.nome_completo || "Sem nome"}</TableCell>
                    <TableCell>{usuario.email || "—"}</TableCell>
                    <TableCell>{usuario.status_da_assinatura || "—"}</TableCell>
                    <TableCell>{(usuario.plan_type || "basic").toString().toUpperCase()}</TableCell>
                    <TableCell>{usuario.updated_at ? new Date(usuario.updated_at).toLocaleString("pt-BR") : "—"}</TableCell>
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

export default Financeiro;
