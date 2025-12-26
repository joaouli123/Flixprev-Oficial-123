import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { neon as supabase } from "@/lib/neon"
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

interface Tutorial {
  id: string;
  title: string;
  url: string;
  display_order: number;
}

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

  const fetchTutorials = useCallback(async () => {
    setLoading(true);
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const { data: tutorialsData, error: tutorialsError } = await supabase
      .from('tutorials')
      .select('*')
      .order('display_order', { ascending: true });

    if (tutorialsError) {
      console.error("Erro ao carregar tutoriais:", tutorialsError.message);
      toast.error("Erro ao carregar tutoriais: " + tutorialsError.message);
    } else {
      setTutorials(tutorialsData as Tutorial[]);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchTutorials();
    }
  }, [isAdmin, fetchTutorials]);

  const handleCreateTutorial = async (title: string, url: string, order: number) => {
    const { error } = await supabase
      .from('tutorials')
      .insert({ title, url, display_order: order })
      .select();

    if (error) {
      toast.error("Erro ao criar tutorial: " + error.message);
      console.error("Erro ao criar tutorial:", error);
    } else {
      toast.success(`Tutorial '${title}' criado com sucesso!`);
      fetchTutorials();
    }
  };

  const handleEditTutorial = async (tutorialId: string, title: string, url: string, order: number) => {
    const { error } = await supabase
      .from('tutorials')
      .update({ title, url, display_order: order })
      .eq('id', tutorialId)
      .select();

    if (error) {
      toast.error("Erro ao atualizar tutorial: " + error.message);
      console.error("Erro ao atualizar tutorial:", error);
    } else {
      toast.success(`Tutorial '${title}' atualizado com sucesso!`);
      fetchTutorials();
    }
  };

  const confirmDeleteTutorial = (tutorial: Tutorial) => {
    setTutorialToDeleteId(tutorial.id);
    setIsDeleteTutorialDialogOpen(true);
  };

  const handleDeleteTutorial = async () => {
    if (!tutorialToDeleteId) return;

    const { error } = await supabase
      .from('tutorials')
      .delete()
      .eq('id', tutorialToDeleteId);

    if (error) {
      toast.error("Erro ao remover tutorial: " + error.message);
      console.error("Erro ao remover tutorial:", error);
    } else {
      toast.success("Tutorial removido com sucesso!");
      fetchTutorials();
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
    <div className="bg-background text-foreground p-6 min-h-full">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <BookOpen className="h-8 w-8" /> Gerenciamento de Tutoriais
        </h1>

        <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <CardHeader className="p-0 mb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-semibold">Lista de Tutoriais</CardTitle>
              <Button onClick={() => setIsCreateTutorialDialogOpen(true)} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Tutorial
              </Button>
            </div>
            <CardDescription className="text-muted-foreground">
              Visualize e gerencie todos os tutoriais da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {tutorials.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum tutorial encontrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tutorials.map((tutorial) => (
                    <TableRow key={tutorial.id}>
                      <TableCell className="font-medium">{tutorial.title}</TableCell>
                      <TableCell>
                        <a href={tutorial.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate max-w-[200px] block">
                          {tutorial.url}
                        </a>
                      </TableCell>
                      <TableCell>{tutorial.display_order}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setTutorialToEdit(tutorial); setIsEditTutorialDialogOpen(true); }}>
                            <Edit className="h-4 w-4 mr-2" /> Editar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => confirmDeleteTutorial(tutorial)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Remover
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso removerá permanentemente o tutorial.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTutorial}>Remover</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default TutorialManagement;
