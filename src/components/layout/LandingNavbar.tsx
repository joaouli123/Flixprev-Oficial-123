import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FlixPrevLogo from "@/components/ui/FlixPrevLogo";

const LandingNavbar: React.FC = () => {
  const navigate = useNavigate();

  const handleLoginClick = () => {
    navigate("/login");
  };

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-xl shadow-sm border-b border-slate-200/60 relative z-20">
      <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate("/")}>
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-indigo-100/50 shadow-sm group-hover:shadow-md transition-all duration-300">
          <FlixPrevLogo className="h-6 w-6 drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
            FlixPrev I.A
          </span>
          <span className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase">
            Plataforma de Agentes
          </span>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-6">
        {/* Links de navegação removidos para uma landing page minimalista */}
      </div>
      <Button 
        onClick={handleLoginClick}
        className="relative bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transform transition-all duration-300 hover:-translate-y-0.5 overflow-hidden group"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
        <span className="relative z-10 flex items-center gap-2">
          Entrar
          <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </span>
      </Button>
    </nav>
  );
};

export default LandingNavbar;
