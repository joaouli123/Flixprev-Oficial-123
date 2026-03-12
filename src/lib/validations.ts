import { z } from 'zod';

// Validação de Email
export const emailSchema = z
  .string()
  .min(1, 'Email é obrigatório')
  .email('Email inválido')
  .toLowerCase()
  .trim();

// Validação de Senha
export const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .max(100, 'Senha muito longa')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número');

// Validação de Nome
export const nameSchema = z
  .string()
  .min(2, 'Nome deve ter no mínimo 2 caracteres')
  .max(50, 'Nome muito longo')
  .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome deve conter apenas letras')
  .trim();

export const fullNameSchema = z
  .string()
  .min(3, 'Nome completo é obrigatório')
  .max(120, 'Nome muito longo')
  .trim();

export const documentSchema = z
  .string()
  .min(11, 'CPF é obrigatório')
  .max(18, 'CPF inválido')
  .trim();

export const whatsappSchema = z
  .string()
  .min(10, 'WhatsApp é obrigatório')
  .max(20, 'WhatsApp inválido')
  .trim();

export const cepSchema = z
  .string()
  .min(8, 'CEP é obrigatório')
  .max(9, 'CEP inválido')
  .trim();

export const practiceAreasSchema = z
  .array(z.string().min(2, 'Informe um ramo válido').max(80, 'Ramo muito longo'))
  .min(1, 'Informe pelo menos um ramo de atuação');

export const userProfileDetailsSchema = z.object({
  fullName: fullNameSchema,
  documento: documentSchema,
  telefone: whatsappSchema,
  practiceAreas: practiceAreasSchema,
  cep: cepSchema,
  logradouro: z.string().min(2, 'Endereço é obrigatório').max(120, 'Endereço muito longo').trim(),
  bairro: z.string().min(2, 'Bairro é obrigatório').max(80, 'Bairro muito longo').trim(),
  cidade: z.string().min(2, 'Cidade é obrigatória').max(80, 'Cidade muito longa').trim(),
  estado: z.string().length(2, 'UF inválida').trim().transform((value) => value.toUpperCase()),
  regiao: z.string().min(2, 'Região é obrigatória').max(30, 'Região inválida').trim(),
  sexo: z.enum(['feminino', 'masculino', 'outro', 'prefiro_nao_informar'], {
    errorMap: () => ({ message: 'Sexo inválido' }),
  }),
  dataNascimento: z.string().min(1, 'Data de nascimento é obrigatória').trim(),
  idade: z.number().int().min(0, 'Idade inválida').max(120, 'Idade inválida'),
});

// Schema de Login
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Senha é obrigatória').trim(),
});

// Schema de Criação de Usuário (com senha - para registro normal)
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema.trim(),
  fullName: fullNameSchema,
  role: z.enum(['user', 'admin'], {
    errorMap: () => ({ message: 'Papel inválido' }),
  }),
}).merge(userProfileDetailsSchema);

// Schema de Criação de Usuário pelo Admin (sem senha - envia convite)
export const createUserByAdminSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema.optional(),
  role: z.enum(['user', 'admin'], {
    errorMap: () => ({ message: 'Papel inválido' }),
  }),
});

export const accountProfileSchema = z.object({
  email: emailSchema,
}).merge(userProfileDetailsSchema);

// Schema de Redefinição de Senha
export const resetPasswordSchema = z.object({
  password: passwordSchema.trim(),
  confirmPassword: z.string().trim(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

// Schema de Agente
export const agentSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo').trim(),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  url: z.string().url('URL inválida').trim(),
  category_id: z.string().uuid('Categoria inválida').optional(),
});

// Schema de Categoria
export const categorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(50, 'Nome muito longo').trim(),
  icon: z.string().optional(),
});

// Schema de Link Customizado
export const customLinkSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(100, 'Título muito longo').trim(),
  url: z.string().url('URL inválida').trim(),
  icon: z.string().optional(),
});

// Tipos TypeScript derivados dos schemas
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateUserByAdminInput = z.infer<typeof createUserByAdminSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AccountProfileInput = z.infer<typeof accountProfileSchema>;
export type AgentInput = z.infer<typeof agentSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type CustomLinkInput = z.infer<typeof customLinkSchema>;
