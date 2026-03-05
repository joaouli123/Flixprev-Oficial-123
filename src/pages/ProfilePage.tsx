import React from "react";
import { useSession } from "@/components/SessionContextProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";

const ProfilePage: React.FC = () => {
  const { session, profile } = useSession();

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Carregando perfil...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-3xl mx-auto w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Meu Perfil</h1>
        <p className="text-gray-500">Gerencie suas informações pessoais e preferências.</p>
      </div>

      <Card className="overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="h-32 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
        <CardHeader className="relative px-8 pb-0 pt-0">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 -mt-12 mb-6">
            <Avatar className="h-24 w-24 border-4 border-white shadow-lg bg-white">
              <AvatarImage src={profile.avatar_url || ""} alt={profile.first_name || "User"} />
              <AvatarFallback className="bg-indigo-50 text-indigo-600">
                <UserCircle className="h-12 w-12" />
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left pb-2">
              <CardTitle className="text-2xl font-bold text-gray-900">
                {profile.first_name || "Usuário"} {profile.last_name || ""}
              </CardTitle>
              <CardDescription className="text-base text-gray-500 mt-1">
                {session.user.email}
              </CardDescription>
            </div>
            <div className="sm:ml-auto pb-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                {profile.role === 'admin' ? 'Administrador' : 'Usuário'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 py-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">ID do Usuário</p>
              <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded-md border border-gray-100 break-all">
                {profile.id}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">Membro desde</p>
              <p className="text-sm text-gray-900 p-2">
                {new Date(session.user.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
            {profile.updated_at && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-500">Última atualização</p>
                <p className="text-sm text-gray-900 p-2">
                  {new Date(profile.updated_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
