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
    <div className="bg-background text-foreground p-6 min-h-full">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Meu Perfil</h1>

        <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <CardHeader className="p-0 mb-4 flex flex-row items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile.avatar_url || ""} alt={profile.first_name || "User"} />
              <AvatarFallback>
                <UserCircle className="h-16 w-16 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl font-semibold">
                {profile.first_name || "Usuário"} {profile.last_name || ""}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {session.user.email}
              </CardDescription>
              <p className="text-sm text-muted-foreground mt-1">
                Papel: <span className="font-medium capitalize">{profile.role}</span>
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-4">
            <div className="grid gap-2">
              <p className="text-sm">
                <span className="font-medium">ID do Usuário:</span> {profile.id}
              </p>
              <p className="text-sm">
                <span className="font-medium">Membro desde:</span>{" "}
                {new Date(session.user.created_at).toLocaleDateString()}
              </p>
              {profile.updated_at && (
                <p className="text-sm">
                  <span className="font-medium">Última atualização:</span>{" "}
                  {new Date(profile.updated_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
