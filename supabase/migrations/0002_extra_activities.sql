-- ==========================================================================
-- Apexly — actividades extra (fútbol, pádel, trekking…)
-- Se registran aparte de las rutinas: NO suman ni restan al cumplimiento,
-- la racha ni el nivel. Tienen sus propios hitos.
-- Ejecutar en Supabase → SQL Editor después de 0001_init.sql.
-- ==========================================================================

create table if not exists public.extra_activities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  done_on       date not null default current_date check (done_on >= date '2000-01-01' and done_on <= current_date + 1),
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  duration_min  int  check (duration_min between 1 and 1440),
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index if not exists extra_activities_user_date_idx on public.extra_activities (user_id, done_on);

drop trigger if exists extra_activities_limit on public.extra_activities;
create trigger extra_activities_limit before insert on public.extra_activities
  for each row execute function public.enforce_row_limit('5000');

alter table public.extra_activities enable row level security;

drop policy if exists "extra_activities_own" on public.extra_activities;
create policy "extra_activities_own" on public.extra_activities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.extra_activities from anon;
