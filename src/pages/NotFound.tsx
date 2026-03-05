import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/50 p-4">
      <div className="text-center max-w-md w-full bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-xl p-10 animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <AlertCircle className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-6xl font-bold text-slate-900 mb-2 tracking-tight">404</h1>
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">Página não encontrada</h2>
        <p className="text-slate-500 mb-8 text-lg">
          Desculpe, não conseguimos encontrar a página que você está procurando.
        </p>
        <Link to="/">
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12 text-lg shadow-md shadow-blue-500/20 transition-all hover:-translate-y-0.5">
            <Home className="mr-2 h-5 w-5" />
            Voltar para o Início
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
