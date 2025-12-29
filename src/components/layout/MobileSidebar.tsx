import React from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import Sidebar from "./Sidebar";
import { Category, CustomLink } from "@/types/app";
import FlixPrevLogo from "@/components/ui/FlixPrevLogo";
// import { useSession } from "@/components/SessionContextProvider"; // Removido: isAdmin não é usado diretamente aqui

interface MobileSidebarProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
  onAddAgent: () => void;
  onHowToUse: () => void;
  onEditCategory: (category: Category) => void; // Adicionado
  onDeleteCategory: (categoryId: string) => void; // Adicionado
  onGoHome: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  customLinks: CustomLink[];
  onAddCustomLink: () => void;
  onEditCustomLink: (link: CustomLink) => void;
  onDeleteCustomLink: (linkId: string) => void;
}

const MobileSidebar: React.FC<MobileSidebarProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  onAddAgent,
  onHowToUse,
  onEditCategory, // Adicionado
  onDeleteCategory, // Adicionado
  onGoHome,
  isOpen,
  onOpenChange,
  customLinks,
  onAddCustomLink,
  onEditCustomLink,
  onDeleteCustomLink,
}) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-64 flex flex-col bg-gradient-to-b from-slate-900/95 via-blue-900/90 to-indigo-900/95 border-blue-500/20">
        <SheetTitle className="sr-only">Menu Principal</SheetTitle>
        <SheetDescription className="sr-only">Navegação e opções da aplicação.</SheetDescription>

        <div className="flex items-center gap-3 p-4 border-b border-blue-500/20 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
          <FlixPrevLogo className="h-8 w-8" />
          <span className="text-xl font-bold bg-gradient-to-r from-blue-200 via-purple-200 to-indigo-200 bg-clip-text text-transparent">FlixPrev I.A</span>
        </div>
        <Sidebar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={(id) => {
            onSelectCategory(id);
            onOpenChange(false);
          }}
          onAddCategory={() => {
            onAddCategory();
            onOpenChange(false);
          }}
          onAddAgent={() => {
            onAddAgent();
            onOpenChange(false);
          }}
          onAddLegacyAgent={onAddLegacyAgent ? () => {
            onAddLegacyAgent();
            onOpenChange(false);
          } : undefined}
          onHowToUse={() => {
            onHowToUse();
            onOpenChange(false);
          }}
          onEditCategory={(category) => { // Adicionado
            onEditCategory(category);
            onOpenChange(false);
          }}
          onDeleteCategory={(id) => { // Adicionado
            onDeleteCategory(id);
            onOpenChange(false);
          }}
          onGoHome={() => {
            onGoHome();
            onOpenChange(false);
          }}
          isCollapsed={false}
          customLinks={customLinks}
          onAddCustomLink={() => {
            onAddCustomLink();
            onOpenChange(false);
          }}
          onEditCustomLink={(link) => {
            onEditCustomLink(link);
            onOpenChange(false);
          }}
          onDeleteCustomLink={(id) => {
            onDeleteCustomLink(id);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;