import React, { useEffect, useState } from "react";
// import { Button } from "@/components/ui/button"; // Removido: não é mais usado
// import { useNavigate } from "react-router-dom"; // Removido: não é mais usado
import { Youtube } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-foreground">Carregando tutoriais...</p>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground p-6 min-h-full">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 flex items-center justify-center gap-2 text-center"> {/* Adicionado justify-center e text-center */}
          <Youtube className="h-8 w-8 text-red-500" />
          Como Usar a Plataforma
        </h1>

        {tutorials.length === 0 ? (
          <p className="text-muted-foreground text-center mt-10">
            Nenhum tutorial disponível no momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {tutorials.map((tutorial) => {
              const embedUrl = getYouTubeEmbedUrl(tutorial.url);
              return (
                <Card key={tutorial.id} className="bg-white dark:bg-gray-800 shadow-md w-full max-w-4xl mx-auto">
                  <CardHeader className="text-center">
                    <CardTitle className="text-lg">{tutorial.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {embedUrl ? (
                      <div className="relative w-full" style={{ paddingBottom: '56.25%' /* 16:9 Aspect Ratio */ }}>
                        <iframe
                          className="absolute top-0 left-0 w-full h-full rounded-md"
                          src={embedUrl}
                          title={tutorial.title}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-40 bg-gray-200 dark:bg-gray-700 rounded-md text-muted-foreground">
                        URL de vídeo inválida
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
