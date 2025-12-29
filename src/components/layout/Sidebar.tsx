import React from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, BookOpen, Bot, Settings, LogOut, Shield, MoreVertical, Edit, Trash2, Home, Users, Video, Link as LinkIcon, Plus } from "lucide-react";
import { Category, CustomLink } from "@/types/app";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/SessionContextProvider";
import { useNavigate, useLocation } from "react-router-dom";
import { neon as supabase } from '@/lib/neon';
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  // Novas props para gerenciamento de categoria
  onEditCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
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
}) => {
  const { isAdmin } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSettings = () => {
    navigate("/app/settings");
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      toast.error("Erro ao sair: " + error.message);
      console.error("Logout error:", error);
    } else {
      toast.success("Você saiu com sucesso!");
      navigate("/login");
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
    iconColorClass: string = "text-gray-700"
  ) => (
    <TooltipProvider key={label}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={onClick}
            className={cn(
              "justify-start w-full transition-all duration-300 group sidebar-item",
              "hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]",
              isCollapsed ? "h-10 w-10 p-0" : "h-10 px-3",
              isActive 
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-800 hover:from-blue-200 hover:to-blue-100 shadow-md shadow-blue-500/20 border border-blue-200/50" 
                : "text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:text-gray-800 hover:border-gray-200/30",
              isDestructive && "text-red-600 hover:text-red-700 hover:from-red-50 hover:to-red-100 hover:border-red-200/30"
            )}
          >
            <div className={cn(
              "flex items-center justify-center transition-all duration-200",
              isActive && "drop-shadow-sm",
              !isCollapsed && "mr-3"
            )}>
              {React.createElement(icon, { 
                className: cn(
                  "h-4 w-4 transition-all duration-200",
                  iconColorClass,
                  isActive && "drop-shadow-sm scale-110",
                  "group-hover:scale-110"
                ) 
              })}
            </div>
            {!isCollapsed && (
              <span className={cn(
                "truncate max-w-[calc(100%-3rem)] block font-medium transition-all duration-200",
                isActive && "font-semibold",
                forceTooltip && "block"
              )}>
                {label}
              </span>
            )}
            {isActive && !isCollapsed && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            )}
          </Button>
        </TooltipTrigger>
        {(isCollapsed || forceTooltip) && (
          <TooltipContent 
            side="right" 
            className="bg-white/95 border-gray-200/50 text-gray-800 backdrop-blur-xl shadow-xl font-medium"
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
        "sticky top-0 h-[calc(100vh-4rem)] overflow-y-auto",
        "flex flex-col p-3 border-r transition-all duration-200 ease-in-out",
        "bg-white/95 backdrop-blur-sm border border-gray-200/50",
        "shadow-lg shadow-gray-500/10",
        "before:absolute before:inset-0 before:bg-gradient-to-b before:from-blue-50/20 before:via-indigo-50/10 before:to-purple-50/20",
        isCollapsed ? "w-16 items-center" : "w-full"
      )}
    >
      <nav className="flex flex-col flex-1 min-h-0 space-y-4 relative z-10">
        {/* Navegação principal */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 pr-1">
          {/* Seção Início */}
          <div className="flex flex-col gap-1">
            {!isCollapsed && (
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-gradient-to-r from-blue-200 to-transparent flex-1"></div>
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2">Navegação</h2>
                <div className="h-px bg-gradient-to-l from-blue-200 to-transparent flex-1"></div>
              </div>
            )}
            {renderButton(Home, "Início", onGoHome, isCurrentPath("/app"), false, false, "text-blue-600")}
          </div>
      
          {/* Seção Meus Links */}
          {customLinks.length > 0 && (
            <div className="flex flex-col gap-1">
              {!isCollapsed && (
                <div className="flex items-center gap-2 mb-2 mt-4">
                  <div className="h-px bg-gradient-to-r from-green-200 to-transparent flex-1"></div>
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2">Meus Links</h2>
                  <div className="h-px bg-gradient-to-l from-green-200 to-transparent flex-1"></div>
                </div>
              )}
              <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 transition-colors">
                {customLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between group">
                    <Button
                      variant="ghost"
                      onClick={() => window.open(link.url, '_blank')}
                      className={cn(
                        "justify-start flex-1 transition-all duration-300 hover:bg-green-50 hover:text-green-700",
                        isCollapsed ? "h-10 w-10 p-0" : "h-9 text-sm"
                      )}
                    >
                      {isCollapsed ? (
                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <LinkIcon className="h-4 w-4 text-green-600" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="bg-white/95 border-gray-200/50 text-gray-800 backdrop-blur-xl shadow-xl font-medium">
                              {link.title}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <>
                          <LinkIcon className="h-4 w-4 mr-2 text-green-600" />
                          <span className="flex-1 truncate text-left">{link.title}</span>
                        </>
                      )}
                    </Button>
                    {isAdmin && !isCollapsed && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-gray-100"
                          >
                            <MoreVertical className="h-3 w-3 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white/95 border-gray-200/50 backdrop-blur-xl shadow-xl">
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 focus:bg-blue-50 transition-colors" 
                            onClick={() => onEditCustomLink(link)}
                          >
                            <Edit className="h-4 w-4 text-blue-600" />
                            Editar Link
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-red-600 hover:bg-red-50 focus:bg-red-50 transition-colors" 
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
                  className="justify-start w-full mt-2 text-green-600 hover:text-green-700 hover:bg-green-50 transition-all duration-300 text-sm h-9"
                >
                  <Plus className="h-4 w-4 mr-2" /> Adicionar Link
                </Button>
              )}
            </div>
          )}
      
          {/* Seção de Categorias */}
          <div className="flex flex-col gap-1 mt-4">
            {!isCollapsed && (
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-gradient-to-r from-purple-200 to-transparent flex-1"></div>
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2">Categorias</h2>
                <div className="h-px bg-gradient-to-l from-purple-200 to-transparent flex-1"></div>
              </div>
            )}
            <div className="space-y-1">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between group">
                  <Button
                    variant="ghost"
                    onClick={() => onSelectCategory(category.id)}
                    className={cn(
                      "justify-start flex-1 transition-all duration-300 hover:shadow-sm",
                      isCollapsed ? "h-10 w-10 p-0" : "h-10",
                      selectedCategory === category.id 
                        ? "bg-purple-100 text-purple-800 hover:bg-purple-200 shadow-sm" 
                        : "text-gray-700 hover:bg-purple-50 hover:text-purple-700",
                      "hover:scale-[1.02] active:scale-[0.98]"
                    )}
                  >
                    {isCollapsed ? (
                      <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center w-full h-full relative">
                              <Bot className="h-4 w-4 text-purple-600" />
                              {selectedCategory === category.id && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="bg-white/95 border-gray-200/50 text-gray-800 backdrop-blur-xl">
                            {category.name}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <div className="flex items-center gap-3 w-full">
                        <div className={cn(
                          "w-2 h-2 rounded-full transition-colors duration-200",
                          selectedCategory === category.id ? "bg-purple-600" : "bg-gray-300"
                        )} />
                        <Bot className="h-4 w-4 text-purple-600" />
                        <span className="flex-1 truncate font-medium text-left">{category.name}</span>
                        {selectedCategory === category.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                        )}
                      </div>
                    )}
                  </Button>
                  {isAdmin && !isCollapsed && category.id !== "all" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-gray-100"
                        >
                          <MoreVertical className="h-3 w-3 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white/95 border-gray-200/50 backdrop-blur-xl shadow-xl">
                        <DropdownMenuItem 
                          className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 focus:bg-blue-50 transition-colors" 
                          onClick={() => onEditCategory(category)}
                        >
                          <Edit className="h-4 w-4 text-blue-600" />
                          Editar Categoria
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="flex items-center gap-2 text-red-600 hover:bg-red-50 focus:bg-red-50 transition-colors" 
                          onClick={() => onDeleteCategory(category.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover Categoria
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rodapé fixo no fundo */}
        <div className={cn(
          "mt-auto flex flex-col gap-3 pt-4 border-t border-gradient-to-r from-gray-200 via-gray-100 to-gray-200 shrink-0 relative z-10 bg-gradient-to-b from-transparent to-gray-50/50 transition-all duration-200",
          isCollapsed ? "items-center px-2" : "px-0"
        )}>
          {/* Seção de Administração (apenas para admins) */}
          {isAdmin && (
            <div className={cn(
              "flex flex-col gap-1 w-full transition-all duration-200",
              isCollapsed ? "items-center" : ""
            )}>
              {!isCollapsed && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="h-px bg-gradient-to-r from-orange-200 to-transparent flex-1 min-w-0"></div>
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2 whitespace-nowrap">Administração</h2>
                  <div className="h-px bg-gradient-to-l from-orange-200 to-transparent flex-1 min-w-0"></div>
                </div>
              )}
              <div className={cn(
                "space-y-1 w-full",
                isCollapsed ? "flex flex-col items-center" : ""
              )}>
                {renderButton(PlusCircle, "Nova Categoria", onAddCategory, false, false, false, "text-green-600")}
                {renderButton(Sparkles, "Adicionar novo agente (novo)", onAddAgent, false, false, false, "text-blue-600")}
                {renderButton(Shield, "Painel Admin", () => navigate("/app/admin"), isCurrentPath("/app/admin"), false, false, "text-yellow-600")}
                {renderButton(Users, "Gerenciar Usuários", () => navigate("/app/users"), isCurrentPath("/app/users"), false, false, "text-cyan-600")}
                {renderButton(Video, "Gerenciar Tutoriais", () => navigate("/app/tutorials"), isCurrentPath("/app/tutorials"), false, false, "text-pink-600")}
              </div>
            </div>
          )}

          {/* Seção de Ações Gerais */}
          <div className={cn(
            "flex flex-col gap-1 transition-all duration-200",
            isCollapsed ? "items-center" : ""
          )}>
            {!isCollapsed && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 min-w-0"></div>
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2 whitespace-nowrap">Conta</h2>
                <div className="h-px bg-gradient-to-l from-gray-300 to-transparent flex-1 min-w-0"></div>
              </div>
            )}
            <div className={cn(
              "space-y-1 w-full",
              isCollapsed ? "flex flex-col items-center" : ""
            )}>
              {!isAdmin && renderButton(BookOpen, "Como Usar a Plataforma", onHowToUse, isCurrentPath("/app/how-to-use"), false, false, "text-orange-600")}
              {renderButton(Settings, "Configurações", handleSettings, isCurrentPath("/app/settings"), false, false, "text-gray-600")}
              {renderButton(LogOut, "Sair", handleLogout, false, true, false, "text-red-600")}
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;