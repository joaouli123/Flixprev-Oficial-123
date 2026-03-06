import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import * as LucideIcons from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { Agent } from "@/types/app";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Edit } from "lucide-react";
import { useSession } from "@/components/SessionContextProvider";
import { normalizeAgentDescription, normalizeAgentTitle } from "@/lib/agentText";

interface AgentCardProps {
  agent: Agent;
  onStartAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onEditAgent: (agent: Agent) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onStartAgent, onDeleteAgent, onEditAgent }) => {
  const { isAdmin } = useSession();
  const IconComponent: LucideIcon = (LucideIcons[agent.icon as keyof typeof LucideIcons] as LucideIcon) || LucideIcons.Bot;
  const BackgroundIconComponent: LucideIcon = (LucideIcons[(agent.background_icon || agent.icon) as keyof typeof LucideIcons] as LucideIcon) || LucideIcons.Bot;
  const displayTitle = normalizeAgentTitle(agent.title, agent.description);
  const description = normalizeAgentDescription(agent.description);
  const isExternalLink = Boolean(agent.link);

  const handleButtonClick = () => {
    if (agent.link) {
      window.open(agent.link, "_blank");
    } else {
      onStartAgent(agent.id);
    }
  };

  return (
    <Card className="group relative flex min-h-[188px] min-w-[260px] self-start flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-lg hover:shadow-purple-500/10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-50/70 via-white to-purple-50/40 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      
      {/* Ícone de fundo (Marca d'água) */}
      <div className="pointer-events-none absolute -bottom-4 -right-4 z-0 opacity-[0.03] transition-transform duration-500 group-hover:scale-110 group-hover:opacity-[0.05]">
        <BackgroundIconComponent className="h-28 w-28 text-purple-900" />
      </div>

      <CardHeader className="relative z-10 px-4 pb-1 pt-4">
        <div className="mb-2 flex items-start justify-between">
          <div className="rounded-lg bg-gradient-to-br from-[#434dce] to-indigo-600 p-2 text-white shadow-sm shadow-indigo-500/25 transition-transform duration-300 group-hover:scale-105">
            <IconComponent className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-600">
              {isExternalLink ? "LINK" : "ESPECIALISTA"}
            </span>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-500 hover:bg-purple-100 hover:text-purple-700">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl border-slate-200 shadow-lg">
                  <DropdownMenuItem onClick={() => onEditAgent(agent)} className="cursor-pointer hover:bg-purple-50 focus:bg-purple-50">
                    <Edit className="mr-2 h-4 w-4 text-purple-600" />
                    <span className="font-medium">Editar</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeleteAgent(agent.id)} className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50">
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span className="font-medium">Remover</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <CardTitle className="line-clamp-1 text-base font-bold text-slate-900 transition-colors duration-300 group-hover:text-purple-700">
          {displayTitle}
        </CardTitle>
        {agent.role && (
          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 line-clamp-2">
            {agent.role}
          </div>
        )}
        <CardDescription className="mt-1 min-h-[24px] text-xs leading-relaxed text-slate-500 line-clamp-2">
          {description}
        </CardDescription>
      </CardHeader>
      <CardFooter className="relative z-10 flex justify-end px-4 pb-3 pt-1.5">
        <Button 
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-900 transition-all duration-300" 
          onClick={handleButtonClick}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default React.memo(AgentCard);
