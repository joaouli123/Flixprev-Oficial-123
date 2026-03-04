import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Users, Wallet } from "lucide-react";

type ReferralHistory = {
  id: string;
  referral_code: string;
  indicated_nome: string;
  referred_email: string | null;
  plan: string | null;
  status: string;
  credit_units: number;
  valor_compra: number;
  comissao_percent: number;
  comissao_valor: number;
  created_at: string;
};

type ReferralResponse = {
  code: string;
  referral_url: string;
  summary: {
    total_indicacoes: number;
    total_creditos: number;
    total_comissao: number;
  };
  history: ReferralHistory[];
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const Indicacoes: React.FC = () => {
  const { session, user } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralResponse | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("/login");
    }
  }, [session, navigate]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch("/api/referrals/me", {
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
        setData(payload as ReferralResponse);
      } catch (error: any) {
        toast.error("Erro ao carregar indicações: " + (error?.message || "falha desconhecida"));
        setData({
          code: "",
          referral_url: "",
          summary: { total_indicacoes: 0, total_creditos: 0, total_comissao: 0 },
          history: [],
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const summary = useMemo(() => {
    return (
      data?.summary || {
        total_indicacoes: 0,
        total_creditos: 0,
        total_comissao: 0,
      }
    );
  }, [data]);

  const copyReferralUrl = async () => {
    if (!data?.referral_url) return;
    await navigator.clipboard.writeText(data.referral_url);
    toast.success("Link de indicação copiado!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando indicações...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-indigo-600">Sistema de Indicações</h1>
          <p className="text-gray-500">Compartilhe seu link e acompanhe suas conversões</p>
        </div>
      </div>

      <Card className="border-gray-200/80 bg-white">
        <CardHeader>
          <CardTitle className="text-slate-800">Seu link de indicação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm text-slate-500">Código: <span className="font-semibold text-indigo-600">{data?.code || "—"}</span></div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-700 overflow-hidden text-ellipsis whitespace-nowrap">
              {data?.referral_url || "Sem link disponível"}
            </div>
            <Button onClick={copyReferralUrl} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Copy className="h-4 w-4 mr-2" />
              Copiar link
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase flex items-center gap-2">
              <Users className="h-4 w-4" />
              Indicações confirmadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-indigo-600">{summary.total_indicacoes}</div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Créditos acumulados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-amber-600">{summary.total_creditos}</div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Comissão total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-emerald-600">{money.format(Number(summary.total_comissao || 0))}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/80 bg-white overflow-hidden">
        <CardHeader>
          <CardTitle>Histórico de Indicações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>INDICADO</TableHead>
                <TableHead>PLANO</TableHead>
                <TableHead>VALOR</TableHead>
                <TableHead>COMISSÃO</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead>DATA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.history?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-10">
                    Nenhuma indicação confirmada até agora.
                  </TableCell>
                </TableRow>
              ) : (
                data.history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{row.indicated_nome || "Usuário indicado"}</div>
                      <div className="text-sm text-slate-500">{row.referred_email || "—"}</div>
                    </TableCell>
                    <TableCell>{row.plan || "—"}</TableCell>
                    <TableCell>{money.format(Number(row.valor_compra || 0))}</TableCell>
                    <TableCell>
                      {money.format(Number(row.comissao_valor || 0))}
                      <span className="text-xs text-slate-500 ml-2">({Number(row.comissao_percent || 0)}%)</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell>{row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—"}</TableCell>
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

export default Indicacoes;
