import React, { useEffect, useState } from "react";
// import { Button } from "@/components/ui/button"; // Removido: não é mais usado
// import { useNavigate } from "react-router-dom"; // Removido: não é mais usado
import { Youtube } from "lucide-react";
import { neon as supabase } from "@/lib/neon"
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Tutorial {
  id: string;
  title: string;
  url: string;
  display_order: number;
}

const HowToUse: React.FC = () => {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTutorials = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tutorials')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        toast.error("Erro ao carregar tutoriais: " + error.message);
        console.error("Erro ao carregar tutoriais:", error);
      } else {
        setTutorials(data as Tutorial[]);
      }
      setLoading(false);
    };

    fetchTutorials();
  }, []);

  const getYouTubeEmbedUrl = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube.com/embed/${match[2]}`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-indigo-200 border-t-blue-600 animate-spin"></div>
          <p className="text-slate-500 font-medium">Carregando tutoriais...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50/50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-red-100 text-red-600 rounded-2xl mb-2 shadow-sm">
            <Youtube className="h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            Como Usar a Plataforma
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Aprenda a extrair o máximo de valor dos nossos agentes de IA com estes tutoriais em vídeo.
          </p>
        </div>

        {tutorials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl shadow-sm">
            <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Youtube className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Nenhum tutorial disponível</h3>
            <p className="text-slate-500 max-w-sm">
              Em breve adicionaremos vídeos explicativos para ajudar você a usar a plataforma.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {tutorials.map((tutorial) => {
              const embedUrl = getYouTubeEmbedUrl(tutorial.url);
              return (
                <Card key={tutorial.id} className="bg-white/80 backdrop-blur-sm border-gray-200/60 shadow-sm rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                  <CardHeader className="border-b border-gray-100/50 bg-slate-50/30 px-6 py-4">
                    <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-indigo-500"></div>
                      {tutorial.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {embedUrl ? (
                      <div className="relative w-full rounded-xl overflow-hidden shadow-inner bg-slate-900" style={{ paddingBottom: '56.25%' /* 16:9 Aspect Ratio */ }}>
                        <iframe
                          className="absolute top-0 left-0 w-full h-full"
                          src={embedUrl}
                          title={tutorial.title}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                        <Youtube className="h-8 w-8 mb-2 opacity-50" />
                        <span>URL de vídeo inválida</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HowToUse;
