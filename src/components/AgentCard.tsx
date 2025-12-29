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
        "shadow-lg shadow-gray-500/10",
        "before:absolute before:inset-0 before:bg-gradient-to-br before:from-blue-50/30 before:via-indigo-50/20 before:to-purple-50/30",
        "before:opacity-0"
      )}
    >
      <CardHeader className="flex-grow relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="relative">
            <IconComponent className="h-8 w-8 text-blue-600 relative z-10" />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-medium px-3 py-1 rounded-full",
              "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700",
              "border border-blue-200/50 backdrop-blur-sm"
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
        <CardTitle className="text-lg font-semibold text-gray-800">
          {agent.title}
        </CardTitle>
        <CardDescription className="text-sm text-gray-600 mt-2 break-words">
          {agent.description}
        </CardDescription>
      </CardHeader>
      <CardFooter className="pt-4 relative z-10">
        <Button 
          className={cn(
            "w-full relative overflow-hidden",
            "bg-gradient-to-r from-blue-600 to-indigo-600",
            "text-white font-medium shadow-lg shadow-blue-500/25"
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
