-- =====================================================================
-- FitFood App — esquema de Supabase
-- Correr completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Perfil y objetivos (1 fila por usuario) ----------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  name             text,
  sex              text check (sex in ('m','f')),
  age              int,
  height_cm        numeric,
  weight_kg        numeric,
  training_time    text default 'tarde' check (training_time in ('manana','tarde','descanso')),
  phase            text default 'volumen' check (phase in ('volumen','definicion','mantenimiento')),
  phase_started_on date default current_date,
  protein_per_kg   numeric default 2.0,
  meals_per_day    int default 4,
  phase_planned_weeks int,
  next_phase       text check (next_phase is null or next_phase in ('volumen','definicion','mantenimiento')),
  next_phase_weeks int,
  training_experience text,
  plan_summary     text,
  plan_source      text,
  plan_uploaded_at timestamptz,
  kcal_target      int,
  protein_target   int,
  carbs_target     int,
  fat_target       int,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ---------- Comidas ----------
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_at     timestamptz not null default now(),
  meal_type    text not null check (meal_type in ('desayuno','almuerzo','merienda','cena','snack','pre','post')),
  title        text,
  items        jsonb not null default '[]'::jsonb,
  kcal         numeric default 0,
  protein      numeric default 0,
  carbs        numeric default 0,
  fat          numeric default 0,
  photo_path   text,
  ai_feedback  text,
  created_at   timestamptz default now()
);
create index if not exists meals_user_date_idx on public.meals (user_id, eaten_at desc);

-- ---------- Registro de peso ----------
create table if not exists public.weights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on  date not null default current_date,
  kg         numeric not null,
  unique (user_id, logged_on)
);

-- ---------- Seguridad: cada uno ve solo lo suyo ----------
alter table public.profiles enable row level security;
alter table public.meals    enable row level security;
alter table public.weights  enable row level security;

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "comidas propias" on public.meals;
create policy "comidas propias" on public.meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pesos propios" on public.weights;
create policy "pesos propios" on public.weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Fotos (bucket privado, carpeta por usuario) ----------
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "fotos propias - ver" on storage.objects;
create policy "fotos propias - ver" on storage.objects
  for select using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "fotos propias - subir" on storage.objects;
create policy "fotos propias - subir" on storage.objects
  for insert with check (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "fotos propias - borrar" on storage.objects;
create policy "fotos propias - borrar" on storage.objects
  for delete using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);
