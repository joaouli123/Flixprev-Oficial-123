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
