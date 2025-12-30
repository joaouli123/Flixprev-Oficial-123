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
    <Card className="flex flex-col h-full min-w-[280px]">
      <CardHeader className="flex-grow">
        <div className="flex items-center justify-between mb-2">
          <IconComponent className="h-8 w-8 text-blue-600" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-blue-100 text-blue-700">
              AGENTE IA
            </span>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditAgent(agent)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeleteAgent(agent.id)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <CardTitle className="text-lg font-semibold">
          {agent.title}
        </CardTitle>
        <CardDescription className="text-sm mt-2 line-clamp-2">
          {agent.description}
        </CardDescription>
      </CardHeader>
      <CardFooter className="pt-4">
        <Button className="w-full" onClick={handleButtonClick}>
          Iniciar agente
        </Button>
      </CardFooter>
    </Card>
  );
};

export default React.memo(AgentCard);
