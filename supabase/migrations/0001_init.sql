-- ==========================================================================
-- Apexly — esquema inicial
-- Ejecutar completo en Supabase → SQL Editor (es idempotente).
--
-- Modelo:
--   routines           rutina (nombre, color) — se programa por días de la semana
--   routine_schedules  historial de días programados (al cambiar los días se agrega
--                      una fila nueva desde hoy, así el pasado no se reescribe)
--   routine_items      ejercicios/tareas de la rutina (checklist). Al quitarlos se
--                      archivan desde hoy para conservar el historial
--   completions        un check = un ejercicio hecho en una fecha
--   goals / goal_entries  metas y sus mediciones (para los gráficos)
-- ==========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- perfiles
create table if not exists public.profiles (
  id                uuid primary key references auth.users on delete cascade,
  full_name         text check (char_length(full_name) <= 80),
  timezone          text not null default 'America/Santiago' check (char_length(timezone) <= 60),
  celebrated_level  int  not null default 0 check (celebrated_level between 0 and 1000),
  created_at        timestamptz not null default now()
);
-- Si "profiles" ya existía (creada antes en este proyecto), agrega las columnas que faltan
alter table public.profiles add column if not exists full_name        text;
alter table public.profiles add column if not exists timezone         text not null default 'America/Santiago';
alter table public.profiles add column if not exists celebrated_level int  not null default 0;
alter table public.profiles add column if not exists created_at       timestamptz not null default now();

-- ---------------------------------------------------------------- rutinas
create table if not exists public.routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  color        text not null default '#ff7a1a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  start_date   date not null default current_date,
  archived_on  date,  -- deja de programarse desde esta fecha (inclusive)
  created_at   timestamptz not null default now(),
  check (archived_on is null or archived_on >= start_date)
);
create index if not exists routines_user_idx on public.routines (user_id);

create table if not exists public.routine_schedules (
  routine_id  uuid not null references public.routines on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  valid_from  date not null default current_date,
  weekdays    smallint[] not null check (
                cardinality(weekdays) between 1 and 7
                and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]   -- 0 = domingo … 6 = sábado
              ),
  primary key (routine_id, valid_from)
);
create index if not exists routine_schedules_user_idx on public.routine_schedules (user_id);

create table if not exists public.routine_items (
  id           uuid primary key default gen_random_uuid(),
  routine_id   uuid not null references public.routines on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  detail       text check (char_length(detail) <= 80),   -- ej. "4 × 12 · 40 kg"
  position     int  not null default 0,
  created_on   date not null default current_date,
  archived_on  date,
  created_at   timestamptz not null default now(),
  check (archived_on is null or archived_on >= created_on)
);
create index if not exists routine_items_routine_idx on public.routine_items (routine_id);
create index if not exists routine_items_user_idx on public.routine_items (user_id);

create table if not exists public.completions (
  item_id     uuid not null references public.routine_items on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  done_on     date not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, done_on)
);
create index if not exists completions_user_date_idx on public.completions (user_id, done_on);

-- ---------------------------------------------------------------- metas
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  -- consistencia: % mensual de cumplimiento · sesiones: días completos al mes · medida: valor con registros
  kind         text not null check (kind in ('consistencia', 'sesiones', 'medida')),
  target       numeric(12,2) not null check (target > 0 and target < 1e9),
  unit         text check (char_length(unit) <= 16),
  direction    text not null default 'subir' check (direction in ('subir', 'bajar')),
  start_value  numeric(12,2) check (start_value >= 0 and start_value < 1e9),
  deadline     date,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

create table if not exists public.goal_entries (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  measured_on  date not null default current_date,
  value        numeric(12,2) not null check (value >= 0 and value < 1e9),
  created_at   timestamptz not null default now(),
  unique (goal_id, measured_on)
);
create index if not exists goal_entries_user_idx on public.goal_entries (user_id);

-- ---------------------------------------------------------------- perfil al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 80))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- reglas de negocio
-- Los checks solo se pueden marcar/desmarcar desde hace 3 días hasta hoy
-- (holgura de ±1 día por zona horaria: current_date en Supabase es UTC).
create or replace function public.guard_completion_date()
returns trigger language plpgsql as $$
declare
  v_date date := coalesce(new.done_on, old.done_on);
begin
  -- Borrados en cascada (eliminar rutina o cuenta) no pasan por la regla
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if v_date < current_date - 4 or v_date > current_date + 1 then
    raise exception 'Solo puedes marcar ejercicios de hoy o de los últimos 3 días.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists completions_guard_date on public.completions;
create trigger completions_guard_date
  before insert or update or delete on public.completions
  for each row execute function public.guard_completion_date();

-- Límite de filas por usuario (evita abuso del almacenamiento)
create or replace function public.enforce_row_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max   int := tg_argv[0]::int;
  v_count int;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
    into v_count using new.user_id;
  if v_count >= v_max then
    raise exception 'Alcanzaste el máximo permitido (%).', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists routines_limit on public.routines;
create trigger routines_limit before insert on public.routines
  for each row execute function public.enforce_row_limit('60');
drop trigger if exists routine_items_limit on public.routine_items;
create trigger routine_items_limit before insert on public.routine_items
  for each row execute function public.enforce_row_limit('1000');
drop trigger if exists routine_schedules_limit on public.routine_schedules;
create trigger routine_schedules_limit before insert on public.routine_schedules
  for each row execute function public.enforce_row_limit('1000');
drop trigger if exists goals_limit on public.goals;
create trigger goals_limit before insert on public.goals
  for each row execute function public.enforce_row_limit('50');
drop trigger if exists goal_entries_limit on public.goal_entries;
create trigger goal_entries_limit before insert on public.goal_entries
  for each row execute function public.enforce_row_limit('5000');

-- ---------------------------------------------------------------- RLS
alter table public.profiles          enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_schedules enable row level security;
alter table public.routine_items     enable row level security;
alter table public.completions       enable row level security;
alter table public.goals             enable row level security;
alter table public.goal_entries      enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "routines_own" on public.routines;
create policy "routines_own" on public.routines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Las tablas hijas además exigen que el padre sea del mismo usuario
drop policy if exists "schedules_own" on public.routine_schedules;
create policy "schedules_own" on public.routine_schedules for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));

drop policy if exists "items_own" on public.routine_items;
create policy "items_own" on public.routine_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));

drop policy if exists "completions_own" on public.completions;
create policy "completions_own" on public.completions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.routine_items i where i.id = item_id and i.user_id = (select auth.uid())));

drop policy if exists "goals_own" on public.goals;
create policy "goals_own" on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "goal_entries_own" on public.goal_entries;
create policy "goal_entries_own" on public.goal_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));

-- Sin acceso anónimo a ninguna tabla
revoke all on public.profiles, public.routines, public.routine_schedules, public.routine_items,
  public.completions, public.goals, public.goal_entries from anon;

-- ---------------------------------------------------------------- límite de peticiones a /api
create table if not exists public.api_rate_limits (
  user_id       uuid not null references auth.users on delete cascade,
  bucket        text not null,
  window_start  timestamptz not null default now(),
  hits          int not null default 0,
  primary key (user_id, bucket)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_hits int;
begin
  if v_uid is null then return false; end if;
  insert into public.api_rate_limits as l (user_id, bucket, window_start, hits)
  values (v_uid, left(p_bucket, 40), now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when l.window_start < now() - make_interval(secs => p_window_seconds) then 1 else l.hits + 1 end,
    window_start = case when l.window_start < now() - make_interval(secs => p_window_seconds) then now() else l.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon;
grant execute on function public.hit_rate_limit(text, int, int) to authenticated;

revoke all on function public.enforce_row_limit() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
