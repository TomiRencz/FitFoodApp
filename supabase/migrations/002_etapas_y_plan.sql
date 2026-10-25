-- =====================================================================
-- FitFood v2: contexto de etapa + plan de la nutricionista
-- Correr en Supabase > SQL Editor ANTES de publicar la versión nueva.
-- Se puede correr más de una vez sin problema.
-- =====================================================================

alter table public.profiles
  add column if not exists phase_planned_weeks int,          -- duración planificada de la etapa actual
  add column if not exists next_phase text,                  -- etapa que sigue
  add column if not exists next_phase_weeks int,             -- duración planificada de la siguiente
  add column if not exists training_experience text,         -- hace cuánto entrena
  add column if not exists plan_summary text,                -- resumen del plan de la nutricionista (contexto para la IA)
  add column if not exists plan_source text,                 -- nombre del archivo subido
  add column if not exists plan_uploaded_at timestamptz;

alter table public.profiles drop constraint if exists profiles_next_phase_check;
alter table public.profiles add constraint profiles_next_phase_check
  check (next_phase is null or next_phase in ('volumen','definicion','mantenimiento'));
