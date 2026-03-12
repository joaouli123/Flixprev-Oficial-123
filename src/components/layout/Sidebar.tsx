import React from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, BookOpen, Bot, Settings, LogOut, Shield, MoreVertical, Edit, Trash2, Home, Users, Video, Link as LinkIcon, Plus, Sparkles, ChevronLeft, ChevronRight, Wallet, Activity, HandCoins, CreditCard } from "lucide-react";
import { Category, CustomLink } from "@/types/app";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/SessionContextProvider";
import { useNavigate, useLocation } from "react-router-dom";
import { logout } from "@/lib/auth";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import FlixPrevLogo from "@/components/ui/FlixPrevLogo";

interface SidebarProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
  onAddAgent: () => void;
  onHowToUse: () => void;
  onGoHome: () => void;
  isCollapsed: boolean;
  customLinks: CustomLink[];
  onAddCustomLink: () => void;
  onEditCustomLink: (link: CustomLink) => void;
  onDeleteCustomLink: (linkId: string) => void;
  onEditCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  onAddAgent,
  onHowToUse,
  onGoHome,
  isCollapsed,
  customLinks,
  onAddCustomLink,
  onEditCustomLink,
  onDeleteCustomLink,
  onEditCategory,
  onDeleteCategory,
  onToggleCollapse,
}) => {
  const { isAdmin } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSettings = () => {
    navigate("/app/settings");
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Você saiu com sucesso!");
      navigate("/login");
    } catch {
      toast.error("Erro ao sair da conta.");
    }
  };

  const isCurrentPath = (path: string) => location.pathname === path;

  const renderButton = (
    icon: React.ElementType,
    label: string,
    onClick: () => void,
    isActive: boolean,
    isDestructive: boolean = false,
    forceTooltip: boolean = false,
    iconColorClass: string = "text-slate-500"
  ) => (
    <TooltipProvider key={label}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={onClick}
            className={cn(
              "justify-start w-full transition-all duration-300 group relative",
              isCollapsed ? "h-12 w-12 p-0 justify-center rounded-xl mx-auto" : "h-11 px-3 rounded-xl overflow-hidden",
              isActive 
                ? "bg-white shadow-sm border border-slate-200/60 text-slate-900 font-medium" 
                : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent",
              isDestructive && "text-red-600 hover:bg-red-50 hover:text-red-700"
            )}
          >
            {isActive && (
              <div className={cn(
                "absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full",
                isCollapsed ? "-left-4" : "left-0"
              )} />
            )}
            <div className={cn(
              "flex items-center justify-center transition-transform duration-300",
              !isCollapsed && "mr-3",
              isActive && !isCollapsed && "ml-1"
            )}>
              {React.createElement(icon, { 
                className: cn(
                  "h-5 w-5 transition-colors duration-300",
                  isActive ? "text-indigo-600" : iconColorClass,
                  isDestructive && "text-red-500",
                  "group-hover:scale-110"
                ) 
              })}
            </div>
            {!isCollapsed && (
              <span className={cn(
                "truncate max-w-[calc(100%-3rem)] block transition-all duration-300 text-sm",
                isActive ? "font-semibold text-slate-900" : "font-medium",
                forceTooltip && "block"
              )}>
                {label}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        {(isCollapsed || forceTooltip) && (
          <TooltipContent 
            side="right" 
            sideOffset={20}
            className="bg-slate-900 text-white border-none shadow-xl font-medium text-xs py-1.5 px-3 rounded-lg z-[100]"
          >
            {label}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div
      className={cn(
        "h-full flex flex-col p-4 transition-all duration-300 ease-in-out",
        "bg-slate-50/50 backdrop-blur-xl border-r border-slate-200/60",
        "relative z-40",
        isCollapsed ? "w-20 items-center" : "w-72"
      )}
    >
      {/* Logo Section */}
      <div className={cn(
        "flex items-center gap-3 mb-8 group cursor-pointer transition-all duration-300",
        isCollapsed ? "justify-center" : "px-2"
      )} onClick={() => navigate("/app")}>
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100/50 shadow-sm group-hover:shadow-md transition-all duration-300 shrink-0">
          <FlixPrevLogo className="h-6 w-6 drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col overflow-hidden pr-6">
            <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight truncate">
              FlixPrev I.A
            </span>
            <span className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase truncate">
              Plataforma de Agentes
            </span>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      {onToggleCollapse && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="absolute -right-3.5 top-6 z-[100] h-7 w-7 rounded-full bg-white border border-slate-200/60 shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-all hidden md:flex items-center justify-center text-slate-400"
          style={{ zIndex: 9999 }}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      )}
      
      <nav className="flex flex-col flex-1 min-h-0 space-y-6 relative z-10 w-full">
        {/* Navegação principal */}
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pr-1">
          
          {/* Seção Início */}
          <div className="flex flex-col gap-1.5">
            {!isCollapsed && (
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">Navegação</h2>
            )}
            {renderButton(Home, "Início", onGoHome, isCurrentPath("/app") && selectedCategory === "all", false, false, "text-slate-500")}
          </div>
      
          {/* Seção Meus Links */}
          {customLinks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {!isCollapsed && (
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">Meus Links</h2>
              )}
              <div className="flex flex-col gap-1">
                {customLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between group relative">
                    <Button
                      variant="ghost"
                      onClick={() => window.open(link.url, '_blank')}
                      className={cn(
                        "justify-start flex-1 transition-all duration-300 hover:bg-white hover:shadow-sm hover:border-slate-200/60 border border-transparent",
                        isCollapsed ? "h-12 w-12 p-0 rounded-xl justify-center mx-auto" : "h-10 text-sm rounded-xl px-3"
                      )}
                    >
                      {isCollapsed ? (
                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <LinkIcon className="h-4 w-4 text-slate-500 group-hover:text-slate-900 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={20} className="bg-slate-900 text-white border-none shadow-xl font-medium text-xs py-1.5 px-3 rounded-lg z-[100]">
                              {link.title}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <>
                          <LinkIcon className="h-4 w-4 mr-3 text-slate-500 group-hover:text-slate-900 transition-colors" />
                          <span className="flex-1 truncate text-left font-medium text-slate-600 group-hover:text-slate-900">{link.title}</span>
                        </>
                      )}
                    </Button>
                    {isAdmin && !isCollapsed && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="absolute right-1 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-slate-100 rounded-lg"
                          >
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white/95 border-slate-200/60 backdrop-blur-xl shadow-xl rounded-xl p-1">
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-slate-700 hover:bg-slate-50 focus:bg-slate-50 rounded-lg cursor-pointer" 
                            onClick={() => onEditCustomLink(link)}
                          >
                            <Edit className="h-4 w-4 text-indigo-500" />
                            Editar Link
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-red-600 hover:bg-red-50 focus:bg-red-50 rounded-lg cursor-pointer" 
                            onClick={() => onDeleteCustomLink(link.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover Link
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && !isCollapsed && (
                <Button 
                  variant="ghost" 
                  onClick={onAddCustomLink} 
                  className="justify-start w-full mt-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 transition-all duration-300 text-sm h-10 rounded-xl px-3 font-medium"
                >
                  <Plus className="h-4 w-4 mr-3" /> Adicionar Link
                </Button>
              )}
            </div>
          )}
      
          {/* Seção de Categorias */}
          <div className="flex flex-col gap-1.5">
            {!isCollapsed && (
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">Categorias</h2>
            )}
            <div className="flex flex-col gap-1">
              {categories.map((category) => {
                const isActive = selectedCategory === category.id;
                return (
                  <div key={category.id} className="flex items-center justify-between group relative">
                    <Button
                      variant="ghost"
                      onClick={() => onSelectCategory(category.id)}
                      className={cn(
                        "justify-start flex-1 transition-all duration-300",
                        isCollapsed ? "h-12 w-12 p-0 rounded-xl justify-center mx-auto" : "h-11 px-3 rounded-xl overflow-hidden",
                        isActive 
                          ? "bg-white shadow-sm border border-slate-200/60 text-slate-900 font-medium" 
                          : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent"
                      )}
                    >
                      {isActive && (
                        <div className={cn(
                          "absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full",
                          isCollapsed ? "-left-4" : "left-0"
                        )} />
                      )}
                      {isCollapsed ? (
                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center w-full h-full relative">
                                <Bot className={cn("h-5 w-5 transition-colors", isActive ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-900")} />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={20} className="bg-slate-900 text-white border-none shadow-xl font-medium text-xs py-1.5 px-3 rounded-lg z-[100]">
                              {category.name}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <div className={cn("flex items-center gap-3 w-full", isActive && "ml-1")}>
                          <Bot className={cn("h-5 w-5 transition-colors", isActive ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-900")} />
                          <span className={cn("flex-1 truncate text-left", isActive ? "font-semibold text-slate-900" : "font-medium")}>{category.name}</span>
                        </div>
                      )}
                    </Button>
                    {isAdmin && !isCollapsed && category.id !== "all" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="absolute right-1 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-slate-100 rounded-lg"
                          >
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white/95 border-slate-200/60 backdrop-blur-xl shadow-xl rounded-xl p-1">
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-slate-700 hover:bg-slate-50 focus:bg-slate-50 rounded-lg cursor-pointer" 
                            onClick={() => onEditCategory(category)}
                          >
                            <Edit className="h-4 w-4 text-indigo-500" />
                            Editar Categoria
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-slate-100" />
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-red-600 hover:bg-red-50 focus:bg-red-50 rounded-lg cursor-pointer" 
                            onClick={() => onDeleteCategory(category.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover Categoria
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé fixo no fundo */}
        <div className={cn(
          "mt-auto flex flex-col gap-6 pt-6 border-t border-slate-200/60 shrink-0 relative z-10",
          isCollapsed ? "items-center" : ""
        )}>
          {/* Seção de Administração (apenas para admins) */}
          {isAdmin && (
            <div className="flex flex-col gap-1.5 w-full">
              {!isCollapsed && (
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">Administração</h2>
              )}
              <div className="flex flex-col gap-1 w-full">
                {renderButton(PlusCircle, "Nova Categoria", onAddCategory, false, false, false, "text-slate-500")}
                {renderButton(Sparkles, "Novo Agente", onAddAgent, false, false, false, "text-slate-500")}
                {renderButton(Shield, "Painel Admin", () => navigate("/app/admin"), isCurrentPath("/app/admin"), false, false, "text-slate-500")}
                {renderButton(Users, "Usuários", () => navigate("/app/users"), isCurrentPath("/app/users"), false, false, "text-slate-500")}
                {renderButton(Video, "Tutoriais", () => navigate("/app/tutorials"), isCurrentPath("/app/tutorials"), false, false, "text-slate-500")}
                {renderButton(Wallet, "Financeiro", () => navigate("/app/financeiro"), isCurrentPath("/app/financeiro"), false, false, "text-slate-500")}
                {renderButton(Activity, "Logs IA", () => navigate("/app/logs-ia"), isCurrentPath("/app/logs-ia"), false, false, "text-slate-500")}
              </div>
            </div>
          )}

          {/* Seção de Ações Gerais */}
          <div className="flex flex-col gap-1.5 w-full">
            {!isCollapsed && (
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">Conta</h2>
            )}
            <div className="flex flex-col gap-1 w-full">
              {renderButton(CreditCard, "Assinatura", () => navigate("/app/assinatura"), isCurrentPath("/app/assinatura") || isCurrentPath("/app/subscription"), false, false, "text-slate-500")}
              {renderButton(HandCoins, "Indicações", () => navigate("/app/indicacoes"), isCurrentPath("/app/indicacoes"), false, false, "text-slate-500")}
              {!isAdmin && renderButton(BookOpen, "Como Usar", onHowToUse, isCurrentPath("/app/how-to-use"), false, false, "text-slate-500")}
              {renderButton(Settings, "Configurações", handleSettings, isCurrentPath("/app/settings"), false, false, "text-slate-500")}
              {renderButton(LogOut, "Sair", handleLogout, false, true, false, "text-red-500")}
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;
