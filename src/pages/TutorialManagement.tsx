import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CreateTutorialDialog from "@/components/admin/CreateTutorialDialog";
import EditTutorialDialog from "@/components/admin/EditTutorialDialog";
import { createTutorial, deleteTutorial, fetchTutorials, Tutorial, updateTutorial } from "@/lib/tutorials";

const TutorialManagement: React.FC = () => {
  const { isAdmin, session } = useSession();
  const navigate = useNavigate();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateTutorialDialogOpen, setIsCreateTutorialDialogOpen] = useState(false);
  const [isEditTutorialDialogOpen, setIsEditTutorialDialogOpen] = useState(false);
  const [tutorialToEdit, setTutorialToEdit] = useState<Tutorial | null>(null);
  const [isDeleteTutorialDialogOpen, setIsDeleteTutorialDialogOpen] = useState(false);
  const [tutorialToDeleteId, setTutorialToDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }
    if (!isAdmin) {
      toast.error("Acesso negado. Você não tem permissão de administrador.");
      navigate("/app");
    }
  }, [isAdmin, session, navigate]);

  const loadTutorials = useCallback(async () => {
    setLoading(true);
    if (!isAdmin || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      const tutorialsData = await fetchTutorials();
      setTutorials(tutorialsData);
    } catch (error: any) {
      console.error("Erro ao carregar tutoriais:", error);
      toast.error("Erro ao carregar tutoriais: " + (error?.message || "falha desconhecida"));
    }
    setLoading(false);
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (isAdmin) {
      loadTutorials();
    }
  }, [isAdmin, loadTutorials]);

  const handleCreateTutorial = async (title: string, description: string, url: string, order: number) => {
    if (!user?.id) {
      toast.error("Usuário administrador não identificado.");
      return;
    }

    try {
      await createTutorial(user.id, { title, description, url, display_order: order });
      toast.success(`Tutorial '${title}' criado com sucesso!`);
      loadTutorials();
    } catch (error: any) {
      toast.error("Erro ao criar tutorial: " + (error?.message || "falha desconhecida"));
      console.error("Erro ao criar tutorial:", error);
    }
  };

  const handleEditTutorial = async (tutorialId: string, title: string, description: string, url: string, order: number) => {
    if (!user?.id) {
      toast.error("Usuário administrador não identificado.");
      return;
    }

    try {
      await updateTutorial(user.id, tutorialId, { title, description, url, display_order: order });
      toast.success(`Tutorial '${title}' atualizado com sucesso!`);
      loadTutorials();
    } catch (error: any) {
      toast.error("Erro ao atualizar tutorial: " + (error?.message || "falha desconhecida"));
      console.error("Erro ao atualizar tutorial:", error);
    }
  };

  const confirmDeleteTutorial = (tutorial: Tutorial) => {
    setTutorialToDeleteId(tutorial.id);
    setIsDeleteTutorialDialogOpen(true);
  };

  const handleDeleteTutorial = async () => {
    if (!tutorialToDeleteId) return;

    if (!user?.id) {
      toast.error("Usuário administrador não identificado.");
      return;
    }

    try {
      await deleteTutorial(user.id, tutorialToDeleteId);
      toast.success("Tutorial removido com sucesso!");
      loadTutorials();
    } catch (error: any) {
      toast.error("Erro ao remover tutorial: " + (error?.message || "falha desconhecida"));
      console.error("Erro ao remover tutorial:", error);
    }
    setIsDeleteTutorialDialogOpen(false);
    setTutorialToDeleteId(null);
  };

  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-foreground">Carregando gerenciamento de tutoriais...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50/50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                <BookOpen className="h-6 w-6" />
              </div>
              Gerenciamento de Tutoriais
            </h1>
            <p className="text-slate-500 mt-2 text-lg">
              Visualize e gerencie todos os tutoriais da plataforma.
            </p>
          </div>
          <Button 
            onClick={() => setIsCreateTutorialDialogOpen(true)} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-xl px-6 h-11"
          >
            <Plus className="h-5 w-5 mr-2" />
            Adicionar Tutorial
          </Button>
        </div>

        {/* Main Content Card */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-200/60 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            {tutorials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <BookOpen className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-1">Nenhum tutorial encontrado</h3>
                <p className="text-slate-500 max-w-sm">
                  Você ainda não adicionou nenhum tutorial. Clique no botão acima para criar o primeiro.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b border-gray-100">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-slate-700 h-12">Título</TableHead>
                      <TableHead className="font-semibold text-slate-700 h-12">URL</TableHead>
                      <TableHead className="font-semibold text-slate-700 h-12 w-24 text-center">Ordem</TableHead>
                      <TableHead className="font-semibold text-slate-700 h-12 text-right pr-6">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tutorials.map((tutorial) => (
                      <TableRow 
                        key={tutorial.id}
                        className="hover:bg-slate-50/50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <TableCell className="font-medium text-slate-900 py-4">
                          <div className="space-y-1">
                            <div>{tutorial.title}</div>
                            <div className="max-w-xl truncate text-sm font-normal text-slate-500">
                              {tutorial.description || "Sem descrição cadastrada"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <a 
                            href={tutorial.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-indigo-600 hover:text-indigo-800 hover:underline truncate max-w-[300px] block transition-colors"
                          >
                            {tutorial.url}
                          </a>
                        </TableCell>
                        <TableCell className="py-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-medium text-sm">
                            {tutorial.display_order}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right pr-6">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => { setTutorialToEdit(tutorial); setIsEditTutorialDialogOpen(true); }}
                              className="h-9 px-3 rounded-lg border-gray-200 hover:bg-slate-50 hover:text-slate-900"
                            >
                              <Edit className="h-4 w-4 mr-2 text-slate-500" /> 
                              Editar
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => confirmDeleteTutorial(tutorial)}
                              className="h-9 px-3 rounded-lg border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> 
                              Remover
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <CreateTutorialDialog
          isOpen={isCreateTutorialDialogOpen}
          onClose={() => setIsCreateTutorialDialogOpen(false)}
          onSave={handleCreateTutorial}
        />

        <EditTutorialDialog
          isOpen={isEditTutorialDialogOpen}
          onClose={() => { setIsEditTutorialDialogOpen(false); setTutorialToEdit(null); }}
          onSave={handleEditTutorial}
          tutorialToEdit={tutorialToEdit}
        />

        <AlertDialog open={isDeleteTutorialDialogOpen} onOpenChange={setIsDeleteTutorialDialogOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">Tem certeza?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-500">
                Esta ação não pode ser desfeita. Isso removerá permanentemente o tutorial.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteTutorial}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default TutorialManagement;
