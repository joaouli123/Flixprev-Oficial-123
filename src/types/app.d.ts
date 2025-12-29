export type Category = {
  id: string;
  name: string;
  userId: string;
  created_at: string;
};

export type Agent = {
  id: string;
  icon: string; // Nome do ícone do Lucide
  category_ids: string[]; // Corrigido para snake_case
  title: string;
  description: string;
  link?: string; // Novo: link para onde o agente redireciona
  shortcuts?: string[]; // Novo: atalhos personalizados para o agente
  instructions?: string; // Instruções do sistema
  attachments?: string[]; // Caminhos dos arquivos anexados
  userId: string;
  created_at: string;
};

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin'; // Adicionado o papel do usuário
  updated_at: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  first_name: string | null;
  last_name: string | null;
  role: 'user' | 'admin';
  avatar_url: string | null;
  status_da_assinatura: string | null;
};

export type CustomLink = {
  id: string;
  user_id: string | null; // Alterado para ser opcional
  title: string;
  url: string;
  display_order: number;
  created_at: string;
};