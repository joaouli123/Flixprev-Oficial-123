import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Users, BarChart, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import FacebookSettingsCard from "@/components/admin/FacebookSettingsCard"; // Importar novo componente

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
    const { data, error } = await supabase
      .from('app_settings')
      .select('facebook_pixel_id, facebook_capi_token')
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error("Erro ao carregar configurações do app:", error.message);
    } else if (data) {
      setAppSettings(data as AppSettings);
    } else {
      setAppSettings({ facebook_pixel_id: null, facebook_capi_token: null });
    }
  }, []);

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
    <div className="bg-background text-foreground p-6 min-h-full">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Painel de Administração</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers !== null ? totalUsers : '...'}</div>
              <p className="text-xs text-muted-foreground">Usuários registrados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Agentes</CardTitle>
              <BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAgents !== null ? totalAgents : '...'}</div>
              <p className="text-xs text-muted-foreground">Agentes criados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Categorias</CardTitle>
              <BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCategories !== null ? totalCategories : '...'}</div>
              <p className="text-xs text-muted-foreground">Categorias criadas</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Seção de Configurações do Facebook */}
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 mt-8">
          <SettingsIcon className="h-6 w-6 text-gray-600" /> Configurações do Aplicativo
        </h2>
        <FacebookSettingsCard 
          initialSettings={appSettings} 
          onSettingsSaved={fetchAppSettings} 
        />
      </div>
    </div>
  );
};

export default AdminDashboard;