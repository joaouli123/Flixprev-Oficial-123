# FlixPrev I.A

## Overview

FlixPrev I.A is a Portuguese-language SaaS platform providing AI-powered tools for social security law professionals (advocacia previdenciária). The application features a React frontend with an Express backend, user authentication, admin dashboard, subscription management, and integration with AI agents. The platform is designed as a Progressive Web App (PWA) with offline support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6 with SWC for fast refresh
- **Routing**: React Router DOM 6 with lazy loading for all pages
- **State Management**: TanStack Query (React Query) for server state, React Context for auth/session
- **Styling**: TailwindCSS with shadcn/ui component library (Radix UI primitives)
- **Forms**: React Hook Form with Zod validation schemas

### Backend Architecture
- **Server**: Express.js running on port 5000
- **API Routes**: Located in `server/` directory
  - `auth-routes.ts` - Authentication endpoints (`/api/login`, `/api/health`)
  - `db-routes.ts` - Database operations proxy (`/api/db`)
- **Development**: Vite dev server with Express middleware integration via `start.ts`

### Authentication Flow
- Custom authentication system with local session storage
- Session managed via `SessionContextProvider` component
- Profile and role information stored in PostgreSQL
- Admin role verification for protected routes
- Subscription status checking with expired subscription dialogs

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts`
- **Migrations**: Output to `./migrations` directory
- **Client**: Custom Neon client wrapper in `src/lib/neon.ts` that provides Supabase-like query builder API

### Code Organization
```
src/
├── components/     # React components
│   ├── admin/      # Admin-specific components
│   ├── layout/     # Layout components (Header, Sidebar, AppLayout)
│   └── ui/         # shadcn/ui primitives (do not modify)
├── hooks/          # Custom React hooks
├── lib/            # Core libraries (auth, neon client, validations)
├── pages/          # Route page components
├── types/          # TypeScript type definitions
└── utils/          # Utility functions

server/
├── auth-routes.ts  # Authentication API
├── db-routes.ts    # Database operations API
└── index.ts        # Express app setup
```

### Security Implementation
- Zod validation schemas for all form inputs (`src/lib/validations.ts`)
- Client-side rate limiting (`src/lib/rate-limit.ts`)
- Content Security Policy headers configured
- Row Level Security (RLS) policies on database tables
- Environment variables for all sensitive credentials

## External Dependencies

### Database
- **PostgreSQL** via Neon serverless or standard connection
- Connection string via `DATABASE_URL` environment variable
- Drizzle ORM for schema management and migrations

### Authentication & Backend Services
- **Supabase** (legacy/optional) - Auth UI components still reference Supabase
- Custom Express API for authentication currently active
- Edge Functions referenced but may need migration

### Frontend Libraries
- **@tanstack/react-query** - Server state management
- **lucide-react** - Icon library
- **date-fns** - Date manipulation
- **zod** - Schema validation
- **sonner** - Toast notifications

### Analytics & Tracking
- **Facebook Pixel** - Client-side tracking
- **Facebook CAPI** - Server-side conversion API (via Edge Functions)

### Deployment
- **Vercel** - Frontend deployment with SPA rewrites configured in `vercel.json`
- Security headers configured for production

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `VITE_SUPABASE_URL` - Supabase project URL (if using Supabase features)
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (if using Supabase features)