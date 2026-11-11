-- ==========================================================================
-- Apexly — planes de entrenamiento y pausas (lesión, enfermedad, vacaciones)
-- Ejecutar en Supabase → SQL Editor después de 0003_item_sets.sql.
--
-- Plan: agrupa rutinas con fecha de inicio (puede ser futura) y de término
--       opcional. Al terminarlo se archivan sus rutinas; el historial queda.
-- Pausa: días en que no se entrena por un motivo. Total = nada cuenta como
--       programado; parcial = solo las rutinas/ejercicios elegidos. Los días
--       en pausa NO bajan el cumplimiento ni cortan la racha.
-- ==========================================================================

-- ---------------------------------------------------------------- planes
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  start_on    date not null default current_date,
  end_on      date,          -- término previsto (último día del plan), opcional
  ended_on    date,          -- cuándo se terminó de verdad (null = activo)
  created_at  timestamptz not null default now(),
  check (end_on is null or end_on >= start_on),
  check (ended_on is null or ended_on >= start_on)
);
create index if not exists plans_user_idx on public.plans (user_id);

alter table public.routines add column if not exists plan_id uuid references public.plans on delete set null;

drop trigger if exists plans_limit on public.plans;
create trigger plans_limit before insert on public.plans
  for each row execute function public.enforce_row_limit('100');

alter table public.plans enable row level security;
drop policy if exists "plans_own" on public.plans;
create policy "plans_own" on public.plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Una rutina solo puede pertenecer a un plan del mismo usuario
drop policy if exists "routines_own" on public.routines;
create policy "routines_own" on public.routines for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid()))));

-- ---------------------------------------------------------------- pausas
create table if not exists public.pauses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  reason       text not null default 'lesion' check (reason in ('lesion', 'enfermedad', 'vacaciones', 'otro')),
  scope        text not null default 'total' check (scope in ('total', 'parcial')),
  routine_ids  uuid[] not null default '{}',   -- parcial: rutinas completas en pausa
  item_ids     uuid[] not null default '{}',   -- parcial: ejercicios sueltos en pausa
  note         text check (char_length(note) <= 120),
  start_on     date not null default current_date,
  end_on       date,                           -- último día de pausa (null = sin fecha de alta)
  created_at   timestamptz not null default now(),
  check (end_on is null or end_on >= start_on),
  check (scope = 'total' or cardinality(routine_ids) + cardinality(item_ids) > 0)
);
create index if not exists pauses_user_idx on public.pauses (user_id);

drop trigger if exists pauses_limit on public.pauses;
create trigger pauses_limit before insert on public.pauses
  for each row execute function public.enforce_row_limit('300');

alter table public.pauses enable row level security;
drop policy if exists "pauses_own" on public.pauses;
create policy "pauses_own" on public.pauses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.plans, public.pauses from anon;
