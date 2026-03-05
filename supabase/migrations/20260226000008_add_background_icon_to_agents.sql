-- Add background_icon column to agents table
ALTER TABLE IF EXISTS public.agents ADD COLUMN IF NOT EXISTS background_icon text;
