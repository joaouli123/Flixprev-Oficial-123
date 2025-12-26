import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Category } from "@/types/app";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TopCategoryBarProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

const TopCategoryBar: React.FC<TopCategoryBarProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // A opção "Todos" será gerenciada externamente (pelo Sidebar dropdown)
  // Este componente agora renderiza apenas as categorias que recebe.
  const categoriesToDisplay = categories.filter(cat => cat.id !== "all");

  // Função para verificar se pode fazer scroll
  const checkScrollability = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // Função para fazer scroll para a esquerda
  const handleScrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  // Função para fazer scroll para a direita
  const handleScrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  // Verificar scrollability quando o componente monta e quando as categorias mudam
  useEffect(() => {
    checkScrollability();
    const handleResize = () => checkScrollability();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [categories]);

  return (
    <div className="mb-6 relative">
      {/* Seta esquerda */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScrollLeft}
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 p-0 rounded-full",
          "bg-white/90 hover:bg-blue-50 shadow-lg border border-blue-200/50",
          "transition-all duration-200 hover:border-blue-300/50",
          canScrollLeft 
            ? "opacity-100 pointer-events-auto" 
            : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronLeft className="h-4 w-4 text-blue-600 hover:text-blue-700" />
      </Button>

      {/* Container das categorias */}
      <div className="mx-10">
        <div 
          ref={scrollRef}
          className="flex items-center gap-3 overflow-x-auto scrollbar-hide scroll-smooth"
          onScroll={checkScrollability}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categoriesToDisplay.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <Button
                key={cat.id}
                size="sm"
                variant="ghost"
                onClick={() => onSelectCategory(cat.id)}
                className={cn(
                  "rounded-full px-6 py-2 whitespace-nowrap font-medium transition-all duration-300 relative overflow-hidden flex-shrink-0",
                  "border backdrop-blur-sm shadow-lg",
                  isActive 
                    ? [
                        "bg-gradient-to-r from-blue-500 to-blue-600 text-white",
                        "border-blue-400/50 shadow-blue-500/25",
                        "hover:from-blue-600 hover:to-blue-700 hover:shadow-blue-500/40",
                        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/20 before:to-transparent",
                        "before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700"
                      ]
                    : [
                        "bg-white/90 text-gray-700 border-gray-200/50",
                        "hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100",
                        "hover:text-gray-800 hover:border-gray-300/50 hover:shadow-gray-300/20",
                        "hover:scale-105"
                      ]
                )}
              >
                <span className="relative z-10">{cat.name}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Seta direita */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScrollRight}
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 p-0 rounded-full",
          "bg-white/90 hover:bg-blue-50 shadow-lg border border-blue-200/50",
          "transition-all duration-200 hover:border-blue-300/50",
          canScrollRight 
            ? "opacity-100 pointer-events-auto" 
            : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronRight className="h-4 w-4 text-blue-600 hover:text-blue-700" />
      </Button>
    </div>
  );
};

export default TopCategoryBar;
