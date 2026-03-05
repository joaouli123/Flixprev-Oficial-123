-- Execute este script no SQL Editor do seu painel do Supabase

CREATE TABLE IF NOT EXISTS public.pages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Configurar RLS (Row Level Security)
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
-- Qualquer um pode ler as páginas (já que são públicas pelo slug)
CREATE POLICY "Páginas são públicas para leitura" 
ON public.pages FOR SELECT 
USING (true);

-- Apenas usuários autenticados podem criar páginas
CREATE POLICY "Usuários podem criar páginas" 
ON public.pages FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Apenas o dono da página pode atualizá-la
CREATE POLICY "Usuários podem atualizar suas próprias páginas" 
ON public.pages FOR UPDATE 
USING (auth.uid() = user_id);

-- Apenas o dono da página pode deletá-la
CREATE POLICY "Usuários podem deletar suas próprias páginas" 
ON public.pages FOR DELETE 
USING (auth.uid() = user_id);
