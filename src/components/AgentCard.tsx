import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import * as LucideIcons from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { Agent } from "@/types/app";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Edit } from "lucide-react";
import { useSession } from "@/components/SessionContextProvider";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
  onStartAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onEditAgent: (agent: Agent) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onStartAgent, onDeleteAgent, onEditAgent }) => {
  const { isAdmin } = useSession();
  const IconComponent: LucideIcon = (LucideIcons[agent.icon as keyof typeof LucideIcons] as LucideIcon) || LucideIcons.Bot;

  const handleButtonClick = () => {
    if (agent.link) {
      window.open(agent.link, "_blank");
    } else {
      onStartAgent(agent.id);
    }
  };

  return (
    <Card 
      className={cn(
        "flex flex-col h-full min-w-[280px] group relative overflow-hidden",
        "bg-white/80 backdrop-blur-sm border border-gray-200/50",
        "shadow-lg shadow-gray-500/10 hover:shadow-xl hover:shadow-gray-500/20",
        "hover:border-gray-300/60 transition-all duration-300 hover:scale-[1.02]",
        "before:absolute before:inset-0 before:bg-gradient-to-br before:from-blue-50/30 before:via-indigo-50/20 before:to-purple-50/30",
        "before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100"
      )}
    >
      <CardHeader className="flex-grow relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-100/40 to-indigo-100/40 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <IconComponent className="h-8 w-8 text-blue-600 relative z-10 group-hover:text-blue-700 transition-colors duration-300" />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-medium px-3 py-1 rounded-full transition-all duration-300",
              "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700",
              "border border-blue-200/50 backdrop-blur-sm",
              "group-hover:from-blue-100 group-hover:to-indigo-100 group-hover:text-blue-800"
            )}>
              AGENTE IA
            </span>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-600 hover:text-gray-800 hover:bg-gray-100/80 transition-all duration-300"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end"
                  className="bg-white/95 border-gray-200/50 backdrop-blur-xl shadow-xl shadow-gray-500/20"
                >
                  <DropdownMenuItem 
                    className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 focus:bg-blue-50" 
                    onClick={() => onEditAgent(agent)}
                  >
                    <Edit className="h-4 w-4 text-blue-600" />
                    Editar Agente
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="flex items-center gap-2 text-red-600 hover:bg-red-50 focus:bg-red-50" 
                    onClick={() => onDeleteAgent(agent.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover Agente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <CardTitle className="text-lg font-semibold text-gray-800 group-hover:text-gray-900 transition-colors duration-300">
          {agent.title}
        </CardTitle>
        <CardDescription className="text-sm text-gray-600 mt-2 break-words group-hover:text-gray-700 transition-colors duration-300">
          {agent.description}
        </CardDescription>
      </CardHeader>
      <CardFooter className="pt-4 relative z-10">
        <Button 
          className={cn(
            "w-full transition-all duration-300 relative overflow-hidden",
            "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700",
            "text-white font-medium shadow-lg shadow-blue-500/25",
            "hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02]",
            "before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/20 before:to-transparent",
            "before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700"
          )}
          onClick={handleButtonClick}
        >
          <span className="relative z-10">Iniciar agente</span>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AgentCard;
