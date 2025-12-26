import React from "react";

interface FlixPrevLogoProps {
  className?: string;
  size?: number;
}

const FlixPrevLogo: React.FC<FlixPrevLogoProps> = ({ className = "", size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Definindo gradientes */}
      <defs>
        <linearGradient id="primaryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="50%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="secondaryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#3730a3" />
        </linearGradient>
        <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>

      {/* Círculo de fundo com gradiente */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="url(#primaryGradient)"
        className="drop-shadow-lg"
      />

      {/* Elemento central - representando IA/Tecnologia */}
      <g transform="translate(50, 50)">
        {/* Núcleo central */}
        <circle
          cx="0"
          cy="0"
          r="12"
          fill="url(#secondaryGradient)"
          className="animate-pulse"
        />
        
        {/* Anéis orbitais representando IA */}
        <circle
          cx="0"
          cy="0"
          r="20"
          fill="none"
          stroke="url(#accentGradient)"
          strokeWidth="2"
          strokeDasharray="8 4"
          className="animate-spin"
          style={{ animationDuration: "8s" }}
        />
        
        <circle
          cx="0"
          cy="0"
          r="28"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          className="animate-spin"
          style={{ animationDuration: "12s", animationDirection: "reverse" }}
        />

        {/* Pontos de conexão representando dados/análise */}
        <g className="animate-pulse">
          <circle cx="0" cy="-18" r="2" fill="white" opacity="0.9" />
          <circle cx="13" cy="-13" r="2" fill="white" opacity="0.8" />
          <circle cx="18" cy="0" r="2" fill="white" opacity="0.9" />
          <circle cx="13" cy="13" r="2" fill="white" opacity="0.8" />
          <circle cx="0" cy="18" r="2" fill="white" opacity="0.9" />
          <circle cx="-13" cy="13" r="2" fill="white" opacity="0.8" />
          <circle cx="-18" cy="0" r="2" fill="white" opacity="0.9" />
          <circle cx="-13" cy="-13" r="2" fill="white" opacity="0.8" />
        </g>

        {/* Linhas de conexão representando análise jurídica */}
        <g stroke="rgba(255,255,255,0.3)" strokeWidth="1" className="animate-pulse">
          <line x1="0" y1="-18" x2="13" y2="-13" />
          <line x1="13" y1="-13" x2="18" y2="0" />
          <line x1="18" y1="0" x2="13" y2="13" />
          <line x1="13" y1="13" x2="0" y2="18" />
          <line x1="0" y1="18" x2="-13" y2="13" />
          <line x1="-13" y1="13" x2="-18" y2="0" />
          <line x1="-18" y1="0" x2="-13" y2="-13" />
          <line x1="-13" y1="-13" x2="0" y2="-18" />
        </g>

        {/* Símbolo de justiça/lei estilizado */}
        <g transform="scale(0.6)" fill="white" opacity="0.9">
          <rect x="-2" y="-8" width="4" height="16" rx="2" />
          <rect x="-8" y="-2" width="16" height="4" rx="2" />
        </g>
      </g>

      {/* Brilho externo */}
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke="url(#accentGradient)"
        strokeWidth="1"
        opacity="0.5"
        className="animate-pulse"
      />
    </svg>
  );
};

export default FlixPrevLogo;
