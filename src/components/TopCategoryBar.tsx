import React from "react";
import { Category } from "@/types/app";

interface TopCategoryBarProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

const TopCategoryBar: React.FC<TopCategoryBarProps> = () => {
  return null; // Removido conforme o novo design
};

export default TopCategoryBar;
                        "bg-indigo-600 text-white",
                        "border-indigo-600 shadow-blue-500/30 shadow-md",
                        "hover:bg-indigo-700 hover:border-indigo-700",
                        "scale-105"
                      ]
                    : [
                        "bg-white text-gray-600",
                        "border-gray-200/80 hover:border-indigo-200",
                        "hover:bg-indigo-50/50 hover:text-indigo-600 hover:shadow-md",
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
        size="icon"
        onClick={handleScrollRight}
        className={cn(
          "absolute -right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full",
          "bg-white/95 hover:bg-indigo-50 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] border border-gray-100",
          "transition-all duration-300 hover:scale-105",
          canScrollRight 
            ? "opacity-100 translate-x-0 pointer-events-auto" 
            : "opacity-0 -translate-x-2 pointer-events-none"
        )}
      >
        <ChevronRight className="h-5 w-5 text-gray-600 hover:text-indigo-600" />
      </Button>
    </div>
  );
};

export default TopCategoryBar;
