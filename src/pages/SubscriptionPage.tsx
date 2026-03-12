import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { logout } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CreditCard, History, ShieldX, WalletCards } from "lucide-react";

type SubscriptionCurrent = {
  id: string | null;
  status: string | null;
  user_status: string | null;
  plan_type: string | null;
  provider: string | null;
  starts_at: string | null;
  expires_at: string | null;
  updated_at: string | null;
  updated_by_webhook_at: string | null;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  product_name: string | null;
  offer_name: string | null;
  amount: number | null;
  currency: string | null;
  payment_method: string | null;
  purchase_date: string | null;
  due_date: string | null;
  next_charge_at: string | null;
  subscription_period: string | null;
  order_reference: string | null;
  card_brand: string | null;
  card_last_digits: string | null;
  cancellation_reason: string | null;
  provider_sync_status: string | null;
};

type SubscriptionHistoryItem = {
  id: string;
  provider: string | null;
  event_id: string | null;
  event_type: string | null;
  label: string;
  processing_status: string;
  occurred_at: string | null;
  created_at: string | null;
  status: string | null;
  plan_type: string | null;
  product_name: string | null;
  offer_name: string | null;
  amount: number | null;
  currency: string | null;
  payment_method: string | null;
  purchase_date: string | null;
  due_date: string | null;
  next_charge_at: string | null;
  expires_at: string | null;
  subscription_period: string | null;
  order_reference: string | null;
  card_brand: string | null;
  card_last_digits: string | null;
  cancellation_reason: string | null;
  provider_sync_status: string | null;
};

type SubscriptionCapabilities = {
  can_cancel: boolean;
  remote_sync_available: boolean;
  remote_sync_reason: string | null;
};

type SubscriptionResponse = {
  current: SubscriptionCurrent | null;
  history: SubscriptionHistoryItem[];
  capabilities: SubscriptionCapabilities;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const formatMoney = (amount?: number | null, currency?: string | null) => {
  if (amount === null || amount === undefined) {
    return "—";
  }

  if (currency && currency !== "BRL") {
    return `${amount.toFixed(2)} ${currency}`;
  }

  return money.format(amount);
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (value?: string | null) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const prettifyPlan = (plan?: string | null) => {
  const normalized = String(plan || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    basic: "Plano básico",
    premium: "Plano premium",
    enterprise: "Plano enterprise",
  };

  return labels[normalized] || (normalized ? normalized : "Plano não identificado");
};

const prettifyProvider = (provider?: string | null) => {
  const normalized = String(provider || "").trim().toLowerCase();
  if (!normalized) {
    return "—";
  }

  if (normalized === "cakto") {
    return "Cakto";
  }

  if (normalized === "manual") {
    return "Manual";
  }

  return normalized;
};

const prettifyPeriod = (period?: string | null, nextChargeAt?: string | null, expiresAt?: string | null) => {
  const normalized = String(period || "").trim().toLowerCase();
  if (normalized) {
    return normalized.replace(/_/g, " ");
  }

  if (nextChargeAt || expiresAt) {
    return "Recorrente";
  }

  return "Não informado";
};

const statusBadgeClassName = (status?: string | null) => {
  const normalized = String(status || "").trim().toLowerCase();

  if (["active", "ativo", "approved", "paid"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["cancelled", "canceled", "inativo", "inactive"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (["expired", "past_due", "unpaid"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
};

const remoteSyncMessage = (capabilities?: SubscriptionCapabilities | null) => {
  const reason = capabilities?.remote_sync_reason || null;

  if (!reason) {
    return null;
  }

  if (reason === "provider_api_not_configured") {
    return "O bloqueio no FlixPrev é imediato. O cancelamento automático no Cakto ainda depende da configuração da API do provedor.";
  }

  if (reason === "missing_provider_subscription_id") {
    return "Este registro não trouxe o identificador de assinatura do Cakto, então o bloqueio no FlixPrev é imediato, mas a baixa automática no provedor pode exigir ajuste da integração.";
  }

  if (reason === "provider_not_supported") {
    return "Esta assinatura não está vinculada a um provedor com cancelamento remoto configurado.";
  }

  return null;
};

const SubscriptionPage: React.FC = () => {
  const { session, user, profile, refreshProfile } = useSession();
  const navigate = useNavigate();
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  const [loading, setLoading] = useState(true);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  useEffect(() => {
    if (!session) {
      navigate("/login");
    }
  }, [navigate, session]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`${apiBaseUrl}/api/account/subscription`, {
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
        setData(payload as SubscriptionResponse);
      } catch (error: any) {
        const message = error?.message || "falha desconhecida";
        setLoadError(message);
        toast.error("Erro ao carregar assinatura: " + message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [apiBaseUrl, user?.id]);

  const current = data?.current || null;
  const capabilities = data?.capabilities || { can_cancel: false, remote_sync_available: false, remote_sync_reason: null };
  const syncWarning = useMemo(() => remoteSyncMessage(capabilities), [capabilities]);

  const handleCancelSubscription = async () => {
    if (!user?.id) {
      return;
    }

    setSubmittingCancel(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/account/subscription/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          email: profile?.email || user.email || null,
          reason: "user_requested_cancellation",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const payload = await response.json();
      const remoteSync = payload?.cancellation?.remote_sync;
      const successMessage = remoteSync?.ok
        ? "Assinatura cancelada. O acesso foi bloqueado e o cancelamento foi sincronizado com o provedor."
        : "Assinatura cancelada. O acesso foi bloqueado imediatamente no FlixPrev.";

      toast.success(successMessage);
      await refreshProfile();
      await logout();
      navigate("/login", { replace: true });
    } catch (error: any) {
      const message = error?.message || "falha desconhecida";
      toast.error("Erro ao cancelar assinatura: " + message);
    } finally {
      setSubmittingCancel(false);
      setConfirmCancelOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando assinatura...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Assinatura</h1>
          <p className="text-slate-500">Acompanhe plano, ciclo, vencimento, compras e o status do seu acesso.</p>
        </div>
        <Badge variant="outline" className={`rounded-full px-3 py-1 text-sm ${statusBadgeClassName(current?.status || current?.user_status)}`}>
          {current?.status || current?.user_status || "Sem status"}
        </Badge>
      </div>

      {loadError ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha ao atualizar a assinatura</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {syncWarning ? (
        <Alert className="border-slate-200 bg-slate-50 text-slate-800">
          <ShieldX className="h-4 w-4" />
          <AlertTitle>Cancelamento no provedor</AlertTitle>
          <AlertDescription>{syncWarning}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500 flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Plano atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{prettifyPlan(current?.plan_type)}</div>
            <p className="mt-1 text-sm text-slate-500">{current?.product_name || current?.offer_name || "Produto não informado"}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500 flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Ciclo e vencimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{prettifyPeriod(current?.subscription_period, current?.next_charge_at, current?.expires_at)}</div>
            <p className="mt-1 text-sm text-slate-500">Próxima cobrança: {formatShortDate(current?.next_charge_at || current?.expires_at || current?.due_date)}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500 flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Última cobrança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatMoney(current?.amount, current?.currency)}</div>
            <p className="mt-1 text-sm text-slate-500">{current?.payment_method || "Forma de pagamento não informada"}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500 flex items-center gap-2">
              <History className="h-4 w-4" />
              Última atualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatShortDate(current?.updated_by_webhook_at || current?.updated_at)}</div>
            <p className="mt-1 text-sm text-slate-500">Via {prettifyProvider(current?.provider)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <Card className="border-slate-200/80 bg-white">
              <CardHeader>
                <CardTitle>Resumo da assinatura</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status do acesso</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{current?.user_status || current?.status || "Não identificado"}</div>
                  <div className="mt-1 text-sm text-slate-500">Seu bloqueio/liberação é controlado por esse status.</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data da compra</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{formatShortDate(current?.purchase_date || current?.starts_at)}</div>
                  <div className="mt-1 text-sm text-slate-500">Pedido: {current?.order_reference || "—"}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Próxima renovação</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{formatShortDate(current?.next_charge_at || current?.expires_at || current?.due_date)}</div>
                  <div className="mt-1 text-sm text-slate-500">Expira em: {formatDateTime(current?.expires_at)}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamento</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{current?.payment_method || "Não informado"}</div>
                  <div className="mt-1 text-sm text-slate-500">{current?.card_brand ? `${current.card_brand.toUpperCase()} •••• ${current.card_last_digits || "--"}` : "Sem cartão identificado"}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-rose-200/80 bg-white">
              <CardHeader>
                <CardTitle className="text-rose-700">Cancelar assinatura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-600">
                  Ao cancelar, o acesso à plataforma é bloqueado imediatamente. O sistema também tenta sincronizar o cancelamento com o provedor quando essa integração estiver disponível para o seu registro.
                </p>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
                  {capabilities.can_cancel
                    ? "Essa ação é imediata e remove o acesso da conta assim que confirmada."
                    : "Não há uma assinatura ativa cancelável neste momento."}
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={!capabilities.can_cancel || submittingCancel}
                  onClick={() => setConfirmCancelOpen(true)}
                >
                  {submittingCancel ? "Cancelando..." : "Cancelar assinatura agora"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="border-slate-200/80 bg-white overflow-hidden">
            <CardHeader>
              <CardTitle>Histórico de compras e eventos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/90">
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Ciclo</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data?.history?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                        Nenhum evento de assinatura encontrado até agora.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{item.label}</div>
                          <div className="text-sm text-slate-500">{item.product_name || item.offer_name || prettifyProvider(item.provider)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`rounded-full ${statusBadgeClassName(item.status || item.processing_status)}`}>
                            {item.status || item.processing_status}
                          </Badge>
                        </TableCell>
                        <TableCell>{prettifyPlan(item.plan_type)}</TableCell>
                        <TableCell>{formatMoney(item.amount, item.currency)}</TableCell>
                        <TableCell>{prettifyPeriod(item.subscription_period, item.next_charge_at, item.expires_at)}</TableCell>
                        <TableCell>{formatDateTime(item.occurred_at || item.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação bloqueia seu acesso imediatamente. Se a integração do provedor estiver pronta para o seu registro, o sistema também tenta cancelar a recorrência no Cakto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingCancel}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={submittingCancel} onClick={(event) => {
              event.preventDefault();
              void handleCancelSubscription();
            }}>
              {submittingCancel ? "Cancelando..." : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubscriptionPage;