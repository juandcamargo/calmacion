-- Calmación — esquema de base de datos para Supabase
-- Ejecuta este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run

-- Cada registro de la bitácora (episodio, EQ, detonante, felicidad).
-- Los campos que cambian según el tipo de registro (nota, intensidad, herramienta,
-- cierre de episodio, etc.) se guardan en la columna "data" para no tener que
-- migrar el esquema cada vez que la app agregue un campo nuevo.
-- No check constraint on "type": the frontend is the single source of
-- truth for which entry types exist (see WHO_OPTIONS / QuickAddSheet in
-- App.jsx), and a DB-side whitelist here has already caused one silent
-- "can't save" bug when a new type (falsealarm) was added to the app but
-- not to this constraint. Row Level Security below is what actually
-- protects the data — this table just stores whatever the app writes.
create table if not exists entries (
  id text primary key,
  user_id uuid references auth.users not null default auth.uid(),
  type text not null,
  date timestamptz not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists entries_user_id_idx on entries (user_id);
create index if not exists entries_date_idx on entries (date desc);

alter table entries enable row level security;

create policy "Users can view their own entries"
  on entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own entries"
  on entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own entries"
  on entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own entries"
  on entries for delete
  using (auth.uid() = user_id);

-- Una fila por usuario con la fecha de inicio de la bitácora y el último
-- nivel de gamificación que vio (para saber cuándo mostrar la animación
-- de "subiste de nivel").
create table if not exists profiles (
  user_id uuid references auth.users primary key,
  start_date timestamptz not null default now(),
  last_seen_level int not null default 1
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
