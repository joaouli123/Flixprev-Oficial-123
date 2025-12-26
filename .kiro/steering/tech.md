# Stack Tecnológica

## Frontend

- **React 18.3** - Biblioteca UI
- **TypeScript 5.5** - Linguagem tipada
- **Vite 6.3** - Build tool e dev server
- **React Router DOM 6.26** - Roteamento
- **TailwindCSS 3.4** - Estilização utility-first
- **shadcn/ui** - Componentes UI baseados em Radix UI
- **Radix UI** - Componentes primitivos acessíveis

## Estado e Dados

- **TanStack Query (React Query) 5.56** - Gerenciamento de estado servidor
- **React Hook Form 7.53** - Gerenciamento de formulários
- **Zod 3.23** - Validação de schemas

## Backend/Infraestrutura

- **Supabase** - Backend as a Service (BaaS)
  - Autenticação e autorização
  - Banco de dados PostgreSQL
  - Edge Functions (Deno)
  - Row Level Security (RLS)
- **Supabase Edge Functions** - Funções serverless para operações administrativas

## Bibliotecas Auxiliares

- **Lucide React** - Ícones
- **Sonner** - Toast notifications
- **date-fns** - Manipulação de datas
- **clsx + tailwind-merge** - Utilitário para classes CSS (função `cn`)
- **next-themes** - Gerenciamento de temas

## PWA

- **vite-plugin-pwa** - Configuração de Progressive Web App
- Service Worker com estratégia autoUpdate
- Suporte offline para assets estáticos

## Ferramentas de Desenvolvimento

- **ESLint 9** - Linting
- **TypeScript ESLint** - Regras TypeScript
- **Autoprefixer** - PostCSS plugin
- **@vitejs/plugin-react-swc** - Fast Refresh com SWC

## Comandos Comuns

```bash
# Desenvolvimento
npm run dev              # Inicia servidor dev na porta 8080

# Build
npm run build            # Build de produção
npm run build:dev        # Build em modo desenvolvimento

# Qualidade de Código
npm run lint             # Executa ESLint

# Preview
npm run preview          # Preview do build de produção
```

## Configurações Importantes

- **Alias de importação**: `@/*` mapeia para `./src/*`
- **Porta dev**: 8080
- **Host**: `::` (IPv6, aceita todas as conexões)
- **TypeScript**: strict mode desabilitado, noImplicitAny: false
