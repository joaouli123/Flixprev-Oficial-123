import React, { useEffect, useState } from "react";
import { ArrowUpRight, ListVideo, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchTutorials, getYouTubeEmbedUrl, Tutorial } from "@/lib/tutorials";

const HowToUse: React.FC = () => {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTutorials = async () => {
      setLoading(true);
      try {
        const data = await fetchTutorials();
        setTutorials(data);
      } catch (error: any) {
        toast.error("Erro ao carregar tutoriais: " + (error?.message || "falha desconhecida"));
        console.error("Erro ao carregar tutoriais:", error);
      }
      setLoading(false);
    };

    loadTutorials();
  }, []);

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
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(67,77,206,0.18),_transparent_42%),linear-gradient(135deg,_#ffffff_0%,_#f8faff_55%,_#eef2ff_100%)] px-6 py-8 shadow-sm md:px-10 md:py-10">
          <div className="absolute -right-12 top-4 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="absolute left-0 top-0 h-24 w-24 rounded-br-[32px] bg-[#434dce]/10" />
          <div className="relative grid gap-6 md:grid-cols-[1.3fr_0.9fr] md:items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#434dce]/15 bg-white/80 px-4 py-2 text-sm font-medium text-[#434dce] backdrop-blur-sm">
                <ListVideo className="h-4 w-4" />
                Biblioteca de vídeos
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                  Como Usar a Plataforma
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                  Assista os vídeos em sequência, entenda cada etapa do fluxo e acelere o uso dos agentes com orientações diretas.
                </p>
              </div>
            </div>
            <div className="grid gap-3 rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_-30px_rgba(67,77,206,0.5)] backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                  <Youtube className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Tutoriais em vídeo</div>
                  <div className="text-sm text-slate-500">Conteúdo prático para navegação, busca e uso dos agentes.</div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {tutorials.length} vídeo{tutorials.length === 1 ? "" : "s"} disponível{tutorials.length === 1 ? "" : "is"} nesta área.
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Vídeos disponíveis</h2>
              <p className="text-slate-500">Lista completa com vídeo, resumo e atalho direto para assistir.</p>
            </div>
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
          <div className="grid grid-cols-1 gap-6">
            {tutorials.map((tutorial) => {
              const embedUrl = getYouTubeEmbedUrl(tutorial.url);
              return (
                <Card key={tutorial.id} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                  <CardContent className="grid gap-0 p-0 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="border-b border-slate-100 bg-slate-950 lg:border-b-0 lg:border-r lg:border-slate-100">
                      {embedUrl ? (
                        <div className="relative w-full bg-slate-950" style={{ paddingBottom: '56.25%' }}>
                          <iframe
                            className="absolute top-0 left-0 h-full w-full"
                            src={embedUrl}
                            title={tutorial.title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                          <Youtube className="h-8 w-8 opacity-50" />
                          <span>URL de vídeo inválida</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-between gap-5 p-6 md:p-8">
                      <div className="space-y-4">
                        <div className="inline-flex w-fit items-center rounded-full bg-[#434dce]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#434dce]">
                          Tutorial {tutorial.display_order + 1}
                        </div>
                        <CardHeader className="space-y-3 p-0">
                          <CardTitle className="text-2xl leading-tight text-slate-900">
                            {tutorial.title}
                          </CardTitle>
                        </CardHeader>
                        <p className="text-base leading-7 text-slate-600">
                          {tutorial.description?.trim() || "Tutorial em vídeo para orientar o uso da plataforma e acelerar sua rotina dentro do sistema."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-slate-500">
                          Assista aqui ou abra o vídeo diretamente no YouTube.
                        </div>
                        <Button asChild className="h-11 rounded-xl bg-[#434dce] px-5 text-white hover:bg-[#343db0]">
                          <a href={tutorial.url} target="_blank" rel="noopener noreferrer">
                            Assistir
                            <ArrowUpRight className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default HowToUse;
