import React from "react";
import { Input } from "@/components/ui/input";
import { Search, Menu, UserCircle, Settings as SettingsIcon, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/SessionContextProvider";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Profile } from "@/types/app";
import FlixPrevLogo from "@/components/ui/FlixPrevLogo";

interface HeaderProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isSidebarCollapsed: boolean;
  onOpenMobileSidebar: () => void;
  isMobile: boolean;
  profile: Profile | null; // Adicionar prop de perfil
}

const Header: React.FC<HeaderProps> = ({
  searchTerm,
  onSearchChange,
  isSidebarCollapsed,
  onOpenMobileSidebar,
  isMobile,
  profile, // Usar prop de perfil
}) => {
  const { session } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      toast.error("Erro ao sair: " + error.message);
    } else {
      toast.success("Você saiu com sucesso!");
      navigate("/login");
    }
  };

  const handleProfile = () => {
    navigate("/app/profile");
  };

  const handleSettings = () => {
    navigate("/app/settings");
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50",
        "flex items-center justify-between p-4 md:p-6",
        "bg-white/95 backdrop-blur-xl border-b border-gray-200/50 shadow-lg",
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-blue-50/30 before:via-indigo-50/20 before:to-purple-50/30"
      )}
    >
      {/* Botão hambúrguer - apenas em mobile */}
      {isMobile && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onOpenMobileSidebar} 
          className="relative z-10 mr-3 hover:bg-gray-100 text-gray-700 hover:text-gray-900 transition-all duration-300"
        >
          <Menu className="h-6 w-6" />
        </Button>
      )}

      <div
        className={cn(
          "flex items-center gap-4",
          isMobile ? "flex-grow justify-center" : isSidebarCollapsed ? "justify-center md:justify-start" : ""
        )}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <FlixPrevLogo className="h-12 w-12 drop-shadow-sm" />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-xl -z-10"></div>
          </div>
          {!isMobile && !isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="text-2xl font-bold bg-gradient-to-r from-gray-800 via-blue-700 to-indigo-700 bg-clip-text text-transparent">
                FlixPrev I.A
              </span>
              <span className="text-xs text-gray-500 font-medium tracking-wide">
                Plataforma de Agentes IA
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative flex-grow max-w-lg mx-6">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors duration-300" />
          <Input
            type="text"
            placeholder="Pesquisar agentes..."
            className={cn(
              "pl-12 pr-4 py-3 rounded-xl w-full text-base",
              "bg-white border-2 border-gray-200 text-gray-800 placeholder:text-gray-400",
              "focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50",
              "shadow-sm hover:shadow-md transition-all duration-300",
              "group-focus-within:shadow-lg group-focus-within:bg-blue-50/30"
            )}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        </div>
      </div>

      {/* Menu de Perfil */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="relative h-12 w-12 rounded-full hover:bg-gray-100 transition-all duration-300 ring-2 ring-gray-200/50 hover:ring-blue-300/50 shadow-sm hover:shadow-md"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || ""} alt={profile?.first_name || "User"} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-lg font-semibold">
                <UserCircle className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className={cn(
            "w-64 bg-white/95 border-gray-200/50 backdrop-blur-xl",
            "shadow-xl shadow-gray-500/20 rounded-xl"
          )} 
          align="end" 
          forceMount
        >
          <DropdownMenuItem className="flex flex-col items-start space-y-1 text-gray-700 focus:bg-blue-50 p-4">
            <p className="text-base font-semibold leading-none text-gray-800">
              {profile?.first_name || "Usuário"} {profile?.last_name || ""}
            </p>
            <p className="text-sm leading-none text-gray-500">
              {session?.user?.email}
            </p>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-gray-200/50" />
          <DropdownMenuItem 
            onClick={handleProfile} 
            className="cursor-pointer text-gray-700 hover:bg-blue-50 focus:bg-blue-50 p-3"
          >
            <UserCircle className="mr-3 h-5 w-5 text-blue-500" />
            <span className="text-base">Perfil</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={handleSettings} 
            className="cursor-pointer text-gray-700 hover:bg-blue-50 focus:bg-blue-50 p-3"
          >
            <SettingsIcon className="mr-3 h-5 w-5 text-blue-500" />
            <span className="text-base">Configurações</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-gray-200/50" />
          <DropdownMenuItem 
            onClick={handleLogout} 
            className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 p-3"
          >
            <LogOut className="mr-3 h-5 w-5" />
            <span className="text-base">Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};

export default Header;
