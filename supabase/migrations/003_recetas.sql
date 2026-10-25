-- =====================================================================
-- FitFood v4: recetario
-- Correr en Supabase > SQL Editor ANTES de publicar la versión nueva.
-- Se puede correr más de una vez sin problema.
-- =====================================================================

create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  servings      int not null default 1 check (servings > 0),
  prep_minutes  int,
  ingredients   jsonb not null default '[]'::jsonb,  -- [{ name, quantity, grams, kcal_100, protein_100, carbs_100, fat_100 }]
  steps         jsonb not null default '[]'::jsonb,  -- ["Paso 1", "Paso 2"]
  tags          text[] not null default '{}',
  meal_types    text[] not null default '{}',        -- desayuno, almuerzo, merienda, cena, snack
  style         text check (style is null or style in ('completo','lowcarb')),
  -- totales por porción (se recalculan en la app al editar)
  kcal          numeric default 0,
  protein       numeric default 0,
  carbs         numeric default 0,
  fat           numeric default 0,
  notes         text,
  source        text,                                 -- texto, foto, idea, manual
  favorite      boolean not null default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);

alter table public.recipes enable row level security;
drop policy if exists "recetas propias" on public.recipes;
create policy "recetas propias" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
