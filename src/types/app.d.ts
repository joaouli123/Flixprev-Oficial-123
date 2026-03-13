export type Category = {
  id: string;
  name: string;
  userId: string;
  created_at: string;
};

export type Agent = {
  id: string;
  icon: string; // Nome do ícone do Lucide
  background_icon?: string; // Ícone de fundo do card
  category_ids: string[]; // Corrigido para snake_case
  title: string;
  role?: string; // Função do agente
  description: string;
  link?: string; // Novo: link para onde o agente redireciona
  extra_links?: { label: string; url: string }[];
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
  nome_completo?: string | null;
  email?: string | null;
  documento?: string | null;
  telefone?: string | null;
  ramos_atuacao?: string[] | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  regiao?: string | null;
  sexo?: string | null;
  idade?: number | null;
  data_nascimento?: string | null;
  origem_cadastro?: string | null;
  cadastro_finalizado_em?: string | null;
  status_da_assinatura?: string | null;
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
  documento: string | null;
  telefone: string | null;
  ramos_atuacao: string[] | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  regiao: string | null;
  sexo: string | null;
  idade: number | null;
  data_nascimento: string | null;
  origem_cadastro: string | null;
  cadastro_finalizado_em: string | null;
  plan_type: string | null;
  subscription_expires_at: string | null;
  nome_completo: string | null;
};

export type CustomLink = {
  id: string;
  user_id: string | null; // Alterado para ser opcional
  title: string;
  url: string;
  display_order: number;
  created_at: string;
};
