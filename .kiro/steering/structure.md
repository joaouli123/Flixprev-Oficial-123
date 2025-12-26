# Estrutura do Projeto

## Organização de Diretórios

```
src/
├── components/          # Componentes React reutilizáveis
│   ├── admin/          # Componentes específicos do painel admin
│   ├── layout/         # Componentes de layout (Header, Sidebar, AppLayout)
│   └── ui/             # Componentes UI do shadcn/ui (primitivos)
├── hooks/              # Custom React hooks
├── lib/                # Bibliotecas e configurações
│   ├── supabase.ts    # Cliente Supabase configurado
│   └── utils.ts       # Utilitários (função cn)
├── pages/              # Componentes de página (rotas)
├── types/              # Definições de tipos TypeScript
├── utils/              # Funções utilitárias
├── App.tsx             # Componente raiz com roteamento
├── main.tsx            # Entry point da aplicação
└── index.css           # Estilos globais e variáveis CSS
```

## Convenções de Nomenclatura

- **Componentes**: PascalCase (ex: `AgentCard.tsx`, `CreateUserDialog.tsx`)
- **Hooks**: camelCase com prefixo `use` (ex: `useSubscription.tsx`, `useFacebookTracking.tsx`)
- **Utilitários**: camelCase (ex: `utils.ts`, `toast.ts`)
- **Tipos**: PascalCase em arquivos `.d.ts` (ex: `app.d.ts`)

## Padrões de Componentes

### Páginas
- Localizadas em `src/pages/`
- Uma página por arquivo
- Exportação default
- Geralmente conectadas a rotas no `App.tsx`

### Componentes UI
- Componentes shadcn/ui em `src/components/ui/`
- Não modificar diretamente - usar composição
- Utilizam Radix UI como base
- Estilizados com TailwindCSS e variáveis CSS

### Componentes de Domínio
- Componentes específicos da aplicação em `src/components/`
- Dialogs seguem padrão: `Create*Dialog.tsx`, `Edit*Dialog.tsx`
- Cards seguem padrão: `*Card.tsx`

### Componentes Admin
- Isolados em `src/components/admin/`
- Apenas acessíveis por usuários com role `admin`

## Roteamento

### Rotas Públicas
- `/` - Landing page
- `/login` - Autenticação
- `/esqueci-senha` - Recuperação de senha
- `/reset-password` - Redefinição de senha
- `/privacy`, `/terms`, `/cookie-policy`, `/lgpd` - Páginas legais

### Rotas Protegidas (requerem autenticação)
- `/app` - View principal de agentes
- `/app/settings` - Configurações do usuário
- `/app/profile` - Perfil do usuário
- `/app/how-to-use` - Tutorial de uso

### Rotas Admin (requerem role admin)
- `/app/admin` - Dashboard administrativo
- `/app/users` - Gerenciamento de usuários
- `/app/tutorials` - Gerenciamento de tutoriais

## Providers e Contextos

- **QueryClientProvider**: Envolve toda a aplicação (TanStack Query)
- **TooltipProvider**: Habilita tooltips globalmente
- **SessionContextProvider**: Gerencia sessão e autenticação Supabase
- **AppSettingsProvider**: Configurações da aplicação (dentro de rotas protegidas)
- **BrowserRouter**: Roteamento React Router

## Estilização

- **TailwindCSS**: Utility-first CSS framework
- **CSS Variables**: Definidas em `src/index.css` para temas
- **Função `cn()`**: Combina classes com `clsx` e `tailwind-merge`
- **Temas**: Suporte a dark/light mode via `next-themes`
- **Cores customizadas**: Sistema de design tokens via variáveis HSL

## Integração Supabase

- Cliente configurado em `src/lib/supabase.ts`
- Edge Functions chamadas via fetch para operações admin
- RLS (Row Level Security) protege dados no banco
- Autenticação gerenciada pelo `SessionContextProvider`
