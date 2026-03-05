import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Menu, UserCircle, Settings as SettingsIcon, LogOut, Bell, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/SessionContextProvider";
import { useNavigate } from "react-router-dom";
import { logout } from "@/lib/auth";
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
  profile: Profile | null;
}

const Header: React.FC<HeaderProps> = ({
  searchTerm,
  onSearchChange,
  isSidebarCollapsed,
  onOpenMobileSidebar,
  isMobile,
  profile,
}) => {
  const { session } = useSession();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);

  useEffect(() => {
    // Load local storage last read 
    const saved = localStorage.getItem("lastUnreadNotifications");
    if (saved) setLastReadTimestamp(parseInt(saved, 10));

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (err) {
        console.error("Erro ao carregar notificações", err);
      }
    };
    fetchNotifications();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const hasUnread = notifications.some(n => new Date(n.created_at).getTime() > lastReadTimestamp);

  const handleOpenNotifications = () => {
    const now = Date.now();
    setLastReadTimestamp(now);
    localStorage.setItem("lastUnreadNotifications", now.toString());
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Você saiu com sucesso!");
    navigate("/login");
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
        "sticky top-0 z-40",
        "flex items-center justify-between px-6 py-3",
        "bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm"
      )}
    >
      {/* Botão hambúrguer - apenas em mobile */}
      {isMobile && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onOpenMobileSidebar} 
          className="relative z-10 mr-3 hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-all duration-300 rounded-xl"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {isMobile ? (
        <div className="flex-1 flex justify-center items-center gap-2 cursor-pointer" onClick={() => navigate("/app")}>
          <FlixPrevLogo className="h-6 w-6 drop-shadow-sm" />
          <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
            FlixPrev I.A
          </span>
        </div>
      ) : (
        <div className="flex-1"></div>
      )}

      <div className="flex items-center gap-3">
        <DropdownMenu onOpenChange={(open) => { if(open) handleOpenNotifications() }}>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative h-10 w-10 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-all duration-300"
            >
              <Bell className="h-5 w-5" />
              {hasUnread && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-80 bg-white/95 border-slate-200/60 backdrop-blur-xl shadow-xl shadow-slate-500/10 rounded-2xl p-2 mt-2" 
            align="end"
          >
            <div className="px-3 py-2 border-b border-slate-100 mb-1 flex justify-between items-center bg-white/50 rounded-t-xl">
              <span className="font-semibold text-slate-800 text-sm">Notificações</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma notificação no momento.
                </div>
              ) : (
                notifications.map((notif) => (
                  <DropdownMenuItem key={notif.id} className="flex flex-col items-start gap-1 p-3 mb-1 cursor-default hover:bg-slate-50 focus:bg-slate-50 rounded-xl transition-colors outline-none">
                    <div className="flex items-center gap-2 w-full">
                      <div className="h-2 w-2 rounded-full bg-[#434dce] flex-shrink-0" />
                      <span className="font-semibold text-sm text-slate-800">{notif.title}</span>
                    </div>
                    <span className="text-xs text-slate-600 line-clamp-2 pl-4">
                      {notif.message}
                    </span>
                    <span className="text-[10px] text-slate-400 pl-4 mt-1">
                      {new Date(notif.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Menu de Perfil */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative h-10 w-10 rounded-xl hover:bg-slate-100 transition-all duration-300 ring-2 ring-transparent hover:ring-indigo-100 p-0 overflow-hidden"
            >
              <Avatar className="h-10 w-10 border border-slate-200/60">
                <AvatarImage src={profile?.avatar_url || ""} alt={profile?.first_name || "User"} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 text-sm font-bold">
                  {profile?.first_name?.charAt(0) || <UserCircle className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className={cn(
              "w-72 bg-white/95 border-slate-200/60 backdrop-blur-xl",
              "shadow-xl shadow-slate-500/10 rounded-2xl p-2 mt-2"
            )} 
            align="end" 
            forceMount
          >
            <DropdownMenuItem className="flex flex-col items-start space-y-1.5 text-slate-700 focus:bg-transparent p-3 cursor-default">
              <div className="flex items-center gap-3 w-full">
                <Avatar className="h-12 w-12 border border-slate-200/60">
                  <AvatarImage src={profile?.avatar_url || ""} alt={profile?.first_name || "User"} className="object-cover" />
                  <AvatarFallback className="bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 text-sm font-bold">
                    {profile?.first_name?.charAt(0) || <UserCircle className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-bold leading-none text-slate-900">
                    {profile?.first_name || "Usuário"} {profile?.last_name || ""}
                  </p>
                  <p className="text-xs leading-none text-slate-500 mt-1.5">
                    {session?.user?.email}
                  </p>
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-100 my-1" />
            <DropdownMenuItem 
              onClick={handleProfile} 
              className="cursor-pointer text-slate-700 hover:bg-slate-50 focus:bg-slate-50 p-2.5 rounded-xl transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 mr-3">
                <UserCircle className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Meu Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={handleSettings} 
              className="cursor-pointer text-slate-700 hover:bg-slate-50 focus:bg-slate-50 p-2.5 rounded-xl transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 mr-3">
                <SettingsIcon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Configurações</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-100 my-1" />
            <DropdownMenuItem 
              onClick={handleLogout} 
              className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 p-2.5 rounded-xl transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600 mr-3">
                <LogOut className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Sair da conta</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
