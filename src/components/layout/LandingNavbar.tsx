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
    <nav className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-100 relative z-20">
      <div className="flex items-center gap-3">
        <FlixPrevLogo size={32} className="transform transition-all duration-300 hover:scale-110" />
        <span className="text-xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">FlixPrev I.A</span>
      </div>
      <div className="hidden md:flex items-center gap-6">
        {/* Links de navegação removidos para uma landing page minimalista */}
      </div>
      <Button 
        onClick={handleLoginClick}
        className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-bold text-lg px-8 py-4 rounded-2xl shadow-2xl transform transition-all duration-300 hover:scale-110 hover:-translate-y-2 border-2 border-white/20 backdrop-blur-sm overflow-hidden group"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
        <span className="relative z-10 flex items-center gap-2">
          <svg className="w-5 h-5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Entrar
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
      </Button>
    </nav>
  );
};

export default LandingNavbar;
