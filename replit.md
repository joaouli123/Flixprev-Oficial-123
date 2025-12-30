# FlixPrev I.A

## Overview

FlixPrev I.A is a Portuguese-language SaaS platform providing AI-powered tools for social security law professionals (advocacia previdenciária). The application features a React frontend with an Express backend, user authentication, admin dashboard, subscription management, and integration with AI agents. The platform is designed as a Progressive Web App (PWA) with offline support.

## Recent Changes (December 30, 2025)

### 4-Layer Intelligence System for AI Agents
Implemented a comprehensive 4-layer intelligence system in `server.mjs` to provide natural, ChatGPT-like responses while maintaining 100% accuracy to source documents:

**CAMADA 1 - Inteligência Percebida (Perceived Intelligence)**
- Responses with contextual anchoring phrases ("No documento analisado...", "Com base no conteúdo fornecido...")
- Natural negative responses that acknowledge what was found before explaining the limit
- Example: "O documento trata de treinamento e capacitação, mas não entra nesse ponto específico."

**CAMADA 2 - Resposta Estruturada (Structured Response)**
- Gold-standard response pattern: intro → direct content → lists (when applicable) → conclusion
- Responses formatted to be "scannable" like ChatGPT
- Specific formatting recommendations based on question type
- Better visual hierarchy and information organization

**CAMADA 3 - Inteligência de Intenção (Intention Intelligence)**
- Automatic detection of question types: factual, structural, explanatory
- Adaptive formatting based on question intent (not content variation)
- Different response structures for different question types
- Examples:
  - Factual: Lists items clearly and concisely
  - Structural: Describes location/organization within document
  - Explanatory: Organized in short paragraphs with clear hierarchy

**CAMADA 4 - Feedback de Confiança (Confidence Feedback)**
- Proactive next-step suggestions when information is not found
- Build user trust through transparent limitations
- Offerings like: "If you prefer, I can search for related information in the document"
- No hallucination, just action offers

### Technical Implementation

**New Functions in server.mjs:**
- `detectQuestionType(question)` - Classifies user questions into factual/structural/explanatory/general
- Enhanced `getRandomNegativeResponse(question)` - Returns varied negative responses with confidence feedback
- Improved `formatResponse(answer, hasContext, question)` - Formats all responses with 4-layer intelligence
- Enhanced `buildPrompt()` - Now includes all 4 layers in the global prompt with type-specific instructions
- Updated `validateOutput()` - Passes question context for better feedback

**Tone Variations (Global):**
- Formal (institutional/academic)
- Neutral (professional/human)
- ChatGPT-style (conversational/natural) - default

**Response Variations:**
- 7 unique negative response variations (no repetition)
- 3 confidence feedback suggestions (randomly selected)
- All responses maintain 100% document accuracy

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
- **RAG System**: Semantic search with OpenAI embeddings (text-embedding-3-large)
- **Vector Storage**: PostgreSQL with pgvector extension
- **AI Model**: GPT-4o for responses with temperature=0 for consistency
- **API Routes**: Located in `server.mjs`
  - Chat with RAG context injection
  - Document chunking and embedding generation
  - Conversation management

### AI Agent System
- **Document Processing**: PDF extraction + intelligent chunking (800 chars, 150 overlap)
- **Semantic Search**: Vector similarity matching with top-12 chunk retrieval
- **Smart Re-ranking**: Chapter/section detection for strict term matching
- **Context Injection**: 4-layer intelligent system for natural responses

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
├── mjs             # Express app with RAG + AI agents + 4-layer intelligence
└── vite.ts         # Vite dev server setup
```

### Security Implementation
- Zod validation schemas for all form inputs (`src/lib/validations.ts`)
- Client-side rate limiting (`src/lib/rate-limit.ts`)
- Content Security Policy headers configured
- Row Level Security (RLS) policies on database tables
- Environment variables for all sensitive credentials
- Light validation (anti-hallucination): Only blocks severe patterns like "de acordo com meu conhecimento"

## External Dependencies

### Database
- **PostgreSQL** via Neon serverless or standard connection
- Connection string via `DATABASE_URL` environment variable
- Drizzle ORM for schema management and migrations

### Authentication & Backend Services
- **Supabase** (legacy/optional) - Auth UI components still reference Supabase
- Custom Express API for authentication currently active
- Edge Functions referenced but may need migration

### AI & ML Services
- **OpenAI API**
  - `gpt-4o` model for AI agent responses
  - `text-embedding-3-large` model for semantic search
  - Required: `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_API_KEY`

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
- `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (for alternative providers)
- `VITE_SUPABASE_URL` - Supabase project URL (if using Supabase features)
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (if using Supabase features)
