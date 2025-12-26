import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
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
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch users from Edge Function');
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

  const handleCreateUser = async (email: string, firstName: string, lastName: string, role: 'user' | 'admin', password: string) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, first_name: firstName, last_name: lastName, role, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user via Edge Function');
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
      // Usar a nova Edge Function que transfere a propriedade dos dados
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-transfer-and-delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: userToDelete.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user via Edge Function');
      }

      const responseData = await response.json();
      
      let successMessage = `Usuário removido com sucesso!`;
      if (responseData.transfer_summary && responseData.transfer_summary.length > 0) {
          const totalTransferred = responseData.transfer_summary.reduce((sum: number, item: { count: number }) => sum + item.count, 0);
          if (totalTransferred > 0) {
              successMessage += ` (${totalTransferred} itens transferidos para o administrador de destino.)`;
          }
      }
      
      toast.success(successMessage);
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

  const handleUpdateUserRole = async (userId: string, newRole: 'user' | 'admin') => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-user-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update user role via Edge Function');
      }

      toast.success("Papel do usuário atualizado com sucesso!");
      fetchUsers();
    } catch (error: any) {
      toast.error("Erro ao atualizar papel do usuário: " + error.message);
      logger.error("Erro ao atualizar papel do usuário via Edge Function:", error);
    } finally{
      setIsEditUserRoleDialogOpen(false);
      setUserToEditRole(null);
    }
  };

  const handleSubscriptionStatusChange = async (user: AdminUser, isChecked: boolean) => {
    // Mudar 'inativo' para 'desativado'
    const newStatus = isChecked ? 'ativo' : 'desativado';
    const originalStatus = user.status_da_assinatura;

    // Optimistic UI update
    setUsers(users.map(u => u.id === user.id ? { ...u, status_da_assinatura: newStatus } : u));

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-subscription-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: user.id, newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }

      toast.success(`Status de ${user.email} atualizado para ${newStatus}.`);
    } catch (error: any) {
      toast.error("Erro ao atualizar status: " + error.message);
      // Revert UI on error
      setUsers(users.map(u => u.id === user.id ? { ...u, status_da_assinatura: originalStatus } : u));
    }
  };

  // Filtrar usuários com base na pesquisa
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users;
    }

    const query = searchQuery.toLowerCase();
    return users.filter((user) => {
      const email = user.email?.toLowerCase() || '';
      const firstName = user.first_name?.toLowerCase() || '';
      const lastName = user.last_name?.toLowerCase() || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const role = user.role?.toLowerCase() || '';

      return (
        email.includes(query) ||
        firstName.includes(query) ||
        lastName.includes(query) ||
        fullName.includes(query) ||
        role.includes(query)
      );
    });
  }, [users, searchQuery]);

  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando gerenciamento de usuários...</p>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground p-6 min-h-full">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <Users className="h-8 w-8" /> Gerenciamento de Usuários
        </h1>

        <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <CardHeader className="p-0 mb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-semibold">Lista de Usuários</CardTitle>
              <Button onClick={() => setIsCreateUserDialogOpen(true)} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Usuário
              </Button>
            </div>
            <CardDescription className="text-muted-foreground">
              Visualize e gerencie todos os usuários registrados na plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Barra de Pesquisa */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Pesquisar por email, nome ou papel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {users.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum usuário encontrado.</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum usuário encontrado com "{searchQuery}".</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status Assinatura</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.first_name || '-'} {user.last_name || ''}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.status_da_assinatura === 'ativo'}
                            onCheckedChange={(isChecked) => handleSubscriptionStatusChange(user, isChecked)}
                            id={`status-${user.id}`}
                          />
                          <Label 
                            htmlFor={`status-${user.id}`} 
                            className={cn(
                              "font-medium",
                              user.status_da_assinatura === 'ativo' ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {user.status_da_assinatura === 'ativo' ? 'Ativo' : 'Desativado'}
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditUserRole(user)}>
                            <Edit className="h-4 w-4 mr-2" /> Editar Papel
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => confirmDeleteUser(user)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Remover
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
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
                <span className="font-semibold">{userToDelete?.email}</span> e todos os dados associados.
                <br />
                <span className="font-bold text-red-600">Atenção:</span> Se este usuário for um administrador, seus dados (agentes, categorias, links) serão transferidos para outro administrador antes da exclusão.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser}>Remover</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default UserManagement;