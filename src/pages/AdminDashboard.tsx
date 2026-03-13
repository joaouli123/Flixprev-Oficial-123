import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Users, BarChart, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { neon as supabase } from "@/lib/neon"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import FacebookSettingsCard from "@/components/admin/FacebookSettingsCard"; // Importar novo componente
import { buildApiUrl } from "@/lib/api";

interface AppSettings {
  facebook_pixel_id: string | null;
  facebook_capi_token: string | null;
}

const AdminDashboard: React.FC = () => {
  const { isAdmin, session } = useSession();
  const navigate = useNavigate();
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalAgents, setTotalAgents] = useState<number | null>(null);
  const [totalCategories, setTotalCategories] = useState<number | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
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
  }, [isAdmin, session, navigate]);

  const fetchAppSettings = useCallback(async () => {
    if (!session?.user?.id) {
      setAppSettings({ facebook_pixel_id: null, facebook_capi_token: null });
      return;
    }

    try {
      const response = await fetch(buildApiUrl('/api/admin/app-settings'), {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': session.user.id,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const payload = await response.json();
      setAppSettings((payload?.settings || { facebook_pixel_id: null, facebook_capi_token: null }) as AppSettings);
    } catch (error: any) {
      console.error("Erro ao carregar configurações do app:", error.message || error);
      setAppSettings({ facebook_pixel_id: null, facebook_capi_token: null });
    }
  }, [session?.user?.id]);

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    // Fetch counts
    const { count: usersCount, error: usersCountError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' });

    if (usersCountError) {
      console.error("Erro ao carregar contagem de usuários:", usersCountError.message);
    } else {
      setTotalUsers(usersCount);
    }

    const { count: agentsCount, error: agentsCountError } = await supabase
      .from('agents')
      .select('id', { count: 'exact' });

    if (agentsCountError) {
      console.error("Erro ao carregar contagem de agentes:", agentsCountError.message);
    } else {
      setTotalAgents(agentsCount);
    }

    const { count: categoriesCount, error: categoriesCountError } = await supabase
      .from('categories')
      .select('id', { count: 'exact' });

    if (categoriesCountError) {
      console.error("Erro ao carregar contagem de categorias:", categoriesCountError.message);
    } else {
      setTotalCategories(categoriesCount);
    }

    // Fetch app settings
    await fetchAppSettings();

    setLoading(false);
  }, [isAdmin, fetchAppSettings]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin, fetchAdminData]);

  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando painel de administração...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Painel de Administração</h1>
        <p className="text-gray-500">Visão geral e configurações do sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-indigo-50/50 border-b border-indigo-100/50">
            <CardTitle className="text-sm font-semibold text-indigo-800">Total de Usuários</CardTitle>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{totalUsers !== null ? totalUsers : '...'}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Usuários registrados</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-indigo-50/50 border-b border-indigo-100/50">
            <CardTitle className="text-sm font-semibold text-indigo-800">Total de Agentes</CardTitle>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{totalAgents !== null ? totalAgents : '...'}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Agentes criados</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-purple-50/50 border-b border-purple-100/50">
            <CardTitle className="text-sm font-semibold text-purple-800">Total de Categorias</CardTitle>
            <div className="p-2 bg-purple-100 rounded-lg">
              <BarChart className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-900">{totalCategories !== null ? totalCategories : '...'}</div>
            <p className="text-sm text-gray-500 mt-1 font-medium">Categorias criadas</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Seção de Configurações do Facebook */}
      <div className="mt-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-100 rounded-lg">
            <SettingsIcon className="h-5 w-5 text-gray-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Configurações do Aplicativo</h2>
        </div>
        <FacebookSettingsCard 
          initialSettings={appSettings} 
          onSettingsSaved={fetchAppSettings} 
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
