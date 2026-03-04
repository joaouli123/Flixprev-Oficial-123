import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Users, Search, Download, Ban } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import CreateUserDialog from "@/components/admin/CreateUserDialog";
import EditUserRoleDialog from "@/components/admin/EditUserRoleDialog";
import { AdminUser } from "@/types/app";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const UserManagement: React.FC = () => {
  const { isAdmin, session } = useSession();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isDeleteUserDialogOpen, setIsDeleteUserDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isEditUserRoleDialogOpen, setIsEditUserRoleDialogOpen] = useState(false);
  const [userToEditRole, setUserToEditRole] = useState<AdminUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [planFilter, setPlanFilter] = useState("todos");

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-list-users`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch users from Edge Function");
      }

      const data: AdminUser[] = await response.json();
      setUsers(data);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários: " + error.message);
      logger.error("Erro ao carregar usuários da Edge Function:", error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, session?.access_token, SUPABASE_URL]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  const handleCreateUser = async (email: string, firstName: string, lastName: string, role: "user" | "admin", password: string) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, first_name: firstName, last_name: lastName, role, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create user via Edge Function");
      }

      const responseData = await response.json();
      toast.success(responseData.message || "Usuário criado com sucesso!");
      fetchUsers();
    } catch (error: any) {
      toast.error("Erro ao criar usuário: " + error.message);
      logger.error("Erro ao criar usuário via Edge Function:", error);
    }
  };

  const confirmDeleteUser = (user: AdminUser) => {
    setUserToDelete(user);
    setIsDeleteUserDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-transfer-and-delete-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: userToDelete.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete user via Edge Function");
      }

      toast.success("Usuário removido com sucesso!");
      fetchUsers();
    } catch (error: any) {
      toast.error("Erro ao remover usuário: " + error.message);
      logger.error("Erro ao remover usuário via Edge Function:", error);
    } finally {
      setIsDeleteUserDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleEditUserRole = (user: AdminUser) => {
    setUserToEditRole(user);
    setIsEditUserRoleDialogOpen(true);
  };

  const handleUpdateUserRole = async (userId: string, newRole: "user" | "admin") => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-user-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update user role via Edge Function");
      }

      toast.success("Papel do usuário atualizado com sucesso!");
      fetchUsers();
    } catch (error: any) {
      toast.error("Erro ao atualizar papel do usuário: " + error.message);
      logger.error("Erro ao atualizar papel do usuário via Edge Function:", error);
    } finally {
      setIsEditUserRoleDialogOpen(false);
      setUserToEditRole(null);
    }
  };

  const handleSubscriptionStatusChange = async (user: AdminUser, isChecked: boolean) => {
    const newStatus = isChecked ? "ativo" : "desativado";
    const originalStatus = user.status_da_assinatura;

    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status_da_assinatura: newStatus } : u)));

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-subscription-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: user.id, newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update status");
      }

      toast.success(`Status de ${user.email} atualizado para ${newStatus}.`);
    } catch (error: any) {
      toast.error("Erro ao atualizar status: " + error.message);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status_da_assinatura: originalStatus } : u)));
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim().toLowerCase();
      const nomeCompleto = (user.nome_completo || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const documento = (user.documento || "").toLowerCase();
      const telefone = (user.telefone || "").toLowerCase();
      const status = (user.status_da_assinatura || "").toLowerCase();
      const plano = (user.plan_type || "").toLowerCase();

      const matchQuery =
        !query ||
        fullName.includes(query) ||
        nomeCompleto.includes(query) ||
        email.includes(query) ||
        documento.includes(query) ||
        telefone.includes(query);

      const matchStatus = statusFilter === "todos" || status === statusFilter;
      const matchPlan = planFilter === "todos" || plano === planFilter;

      return matchQuery && matchStatus && matchPlan;
    });
  }, [users, searchQuery, statusFilter, planFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const ativos = users.filter((u) => (u.status_da_assinatura || "").toLowerCase() === "ativo").length;
    const assinantes = users.filter((u) => (u.plan_type || "").toLowerCase() !== "basic").length;
    const administradores = users.filter((u) => u.role === "admin").length;
    return { total, ativos, assinantes, administradores };
  }, [users]);

  const exportToCsv = () => {
    const headers = ["nome", "email", "cpf", "telefone", "status", "plano", "cadastro"];
    const lines = filteredUsers.map((user) => {
      const nome = user.nome_completo || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Sem nome";
      const cadastro = user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "-";
      return [
        nome,
        user.email || "",
        user.documento || "",
        user.telefone || "",
        user.status_da_assinatura || "",
        user.plan_type || "",
        cadastro,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `usuarios_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando gerenciamento de usuários...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-indigo-600">Gestão de Usuários</h1>
          <p className="text-gray-500">Gerencie todos os usuários da plataforma</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateUserDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Cadastrar Usuário
          </Button>
          <Button onClick={exportToCsv} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-indigo-600">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase">Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-emerald-600">{stats.ativos}</div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase">Assinantes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-indigo-600">{stats.assinantes}</div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 uppercase">Administradores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-amber-600">{stats.administradores}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/80 bg-white">
        <CardContent className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, email ou CPF..."
              className="pl-10"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-slate-800"
          >
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="desativado">Inativo</option>
            <option value="inativo">Inativo (legado)</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-slate-800"
          >
            <option value="todos">Todos os planos</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow>
              <TableHead>USUÁRIO</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>TELEFONE</TableHead>
              <TableHead>STATUS</TableHead>
              <TableHead>PLANO</TableHead>
              <TableHead>CADASTRO</TableHead>
              <TableHead className="text-right">AÇÕES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500 py-12">
                  Nenhum usuário encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const nome = user.nome_completo || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Sem nome";
                const status = (user.status_da_assinatura || "").toLowerCase();
                const cadastro = user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "-";

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{nome}</div>
                      <div className="text-sm text-slate-500">{user.email || "-"}</div>
                    </TableCell>
                    <TableCell>{user.documento || "-"}</TableCell>
                    <TableCell>{user.telefone || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={status === "ativo"}
                          onCheckedChange={(checked) => handleSubscriptionStatusChange(user, checked)}
                          id={`status-${user.id}`}
                        />
                        <Label
                          htmlFor={`status-${user.id}`}
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                            status === "ativo"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          )}
                        >
                          {status === "ativo" ? "Ativo" : "Inativo"}
                        </Label>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {(user.plan_type || "basic").toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>{cadastro}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditUserRole(user)} className="text-indigo-600 hover:bg-indigo-50">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSubscriptionStatusChange(user, status !== "ativo")}
                          className="text-amber-600 hover:bg-amber-50"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => confirmDeleteUser(user)} className="text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <CreateUserDialog
        isOpen={isCreateUserDialogOpen}
        onClose={() => setIsCreateUserDialogOpen(false)}
        onSave={handleCreateUser}
      />

      <EditUserRoleDialog
        isOpen={isEditUserRoleDialogOpen}
        onClose={() => setIsEditUserRoleDialogOpen(false)}
        onSave={handleUpdateUserRole}
        userToEdit={userToEditRole}
      />

      <AlertDialog open={isDeleteUserDialogOpen} onOpenChange={setIsDeleteUserDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente o usuário{" "}
              <span className="font-semibold">{userToDelete?.email}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
