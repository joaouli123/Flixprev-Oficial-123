# FlixPrev I.A

## Overview

FlixPrev I.A is a Portuguese-language SaaS platform providing AI-powered tools for social security law professionals (advocacia previdenciária). The application features a React frontend with an Express backend, user authentication, admin dashboard, subscription management, and integration with AI agents. The platform is designed as a Progressive Web App (PWA) with offline support.

## Recent Changes (December 30, 2025)

### ✨ ENTERPRISE AI ARCHITECTURE - 5-Layer Intelligence System
Implemented a complete enterprise-grade AI architecture in `server.mjs` with 5 independent, reusable layers:

#### **LAYER 1 - Response Orchestrator (Camada Final)**
- **Responsibility**: Receives raw response from GPT-4o, applies tone/structure/clarity, guarantees consistency
- **Key Functions**: 
  - `orchestrateResponse()` - Formats response based on question type
  - Auto-adds anchor phrases ("No documento analisado...", "Com base no...")
  - Ensures proper list/paragraph/structural formatting
  - Never changes content, only presentation

#### **LAYER 2 - Advanced Question Classifier (Classificador de Intenção)**
- **Responsibility**: Automatically detects question type before responding
- **Types**:
  - **Factual**: "Liste", "Quem são", "Quantos" → responds with lists
  - **Structural**: "Primeira frase", "Título", "Capítulo 2" → responds with direct location
  - **Explanatory**: "Explique", "Como funciona", "Qual objetivo" → responds with paragraphs
  - **General**: Fallback for natural responses
- **Expanded Terms**: 50+ detection patterns for accuracy

#### **LAYER 3 - Response Patterns (Padrões por Tipo)**
- **Structural**: Direct + location reference
- **Factual**: List format with bullets
- **Explanatory**: Paragraph format with proper sentence grouping
- **General**: Natural conversational format
- **Each includes**:
  - 4 anchor phrase variations (randomly selected)
  - Format specification
  - Example output

#### **LAYER 4 - Quality Telemetry (Observabilidade)**
- **Metrics Tracked**:
  - Total questions answered
  - Success rate (with context vs without)
  - Average context size (characters)
  - Average chunks used per answer
  - Average response time (ms)
  - Question type distribution
  - Repeated question detection
- **Automatic Alerts**:
  - 🚨 High negative rate (>40%)
  - 🚨 Empty context detected
  - 🚨 Response too short
  - 🚨 Repeated questions
- **Access**: `GET /api/telemetry` endpoint (to be added)

#### **LAYER 5 - Internal Style Guide (Padrões ChatGPT)**
- **Allowed**:
  - ✅ Natural, conversational phrases
  - ✅ Neutral-friendly tone, professional
  - ✅ Simple terms, no jargon
  - ✅ Anchor phrases and next-step offers
- **Prohibited**:
  - ❌ "Como uma IA..."
  - ❌ "Não tenho acesso..."
  - ❌ "Baseado no meu treinamento..."
  - ❌ Excessive justifications
  - ❌ Robotic/repetitive responses

### 🎯 Technical Implementation Summary

**New Functions**:
- `detectQuestionType(question)` - Classifies questions (50+ patterns)
- `orchestrateResponse(raw, type, hasContext)` - Final formatting layer
- `ensureProperListFormat(text)` - Converts commas to bullets
- `ensureProperParagraphFormat(text)` - Breaks long paragraphs
- `trimToFirstSentence(text, n)` - Condenses structural responses
- `hasAnchorPhrase(text)` - Checks for existing anchor
- `recordTelemetry(...)` - Logs all metrics
- `getTelemetryReport()` - Returns aggregated stats

**Data Structures**:
- `responsePatterns` - 4 types with anchor phrases & formats
- `telemetryMetrics` - Aggregated quality metrics

**Integration Flow**:
```
User Question
    ↓
detectQuestionType() → Classify intent
    ↓
RAG Search → Find context
    ↓
GPT-4o Response (raw)
    ↓
validateOutput() → Anti-hallucination check
    ↓
orchestrateResponse() → Format by type
    ↓
recordTelemetry() → Log metrics
    ↓
User sees: Beautiful, consistent, ChatGPT-like response
```

**Chat Endpoint Changes**:
- Now calculates: `questionType`, `contextSize`, `chunksUsed`
- Passes all to `validateOutput()` for complete pipeline
- Response time tracked and recorded

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6 with SWC for fast refresh
- **Routing**: React Router DOM 6 with lazy loading
- **State Management**: TanStack Query + React Context
- **Styling**: TailwindCSS with shadcn/ui

### Backend Architecture
- **Server**: Express.js running on port 5000
- **RAG System**: Semantic search with OpenAI embeddings
- **Vector Storage**: PostgreSQL with pgvector (3072 dimensions)
- **AI Model**: GPT-4o with temperature=0
- **5-Layer AI Pipeline**: Question classification → RAG → Response formatting → Telemetry

### AI Agent System
- **Document Processing**: PDF extraction + intelligent chunking (800 chars, 150 overlap)
- **Semantic Search**: Vector similarity with top-12 chunk retrieval
- **Smart Re-ranking**: Chapter/section detection
- **Context Injection**: 5-layer intelligent system
- **Response Quality**: Guaranteed consistency across all agents

### Authentication Flow
- Custom authentication system
- Session management via React Context
- Profile/role in PostgreSQL
- Admin route protection
- Subscription status checking

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL
- **Schema**: `shared/schema.ts`
- **Migrations**: `./migrations`
- **Client**: Custom Neon wrapper

## External Dependencies

### Core Services
- **PostgreSQL** - Data + vector storage
- **OpenAI API**
  - `gpt-4o` - Response generation
  - `text-embedding-3-large` - Semantic search
- **Environment Variables**:
  - `DATABASE_URL`
  - `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_API_KEY`
  - `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Frontend Libraries
- **@tanstack/react-query** - State management
- **lucide-react** - Icons
- **date-fns** - Dates
- **zod** - Validation
- **sonner** - Notifications

## Architecture Excellence

✅ **Scalable**: 5 independent layers, each can be improved without affecting others
✅ **Maintainable**: Clear separation of concerns, well-documented code
✅ **Observable**: Built-in telemetry and quality metrics
✅ **Consistent**: Enforces ChatGPT-like style across all responses
✅ **Reliable**: Light anti-hallucination validation preserves conversational flow
✅ **Production-Ready**: Enterprise patterns throughout

## Next Steps (Optional)

1. Add `/api/telemetry` endpoint to expose quality metrics
2. Add admin dashboard for telemetry visualization
3. Train question classifier on more patterns
4. Implement fallback intelligent search strategies
5. Add response caching for repeated questions
