-- ==========================================================================
-- Apexly — expediciones (temporadas después de conquistar Apex)
-- Ejecutar en Supabase → SQL Editor después de 0004_plans_pauses.sql.
--
-- La montaña de niveles tiene 7 cumbres (Iniciado → Apex, 12 meses). Al llegar
-- a Apex el usuario puede empezar una nueva expedición: otra montaña, los mismos
-- títulos con una estrella de prestigio más.
--   expedition       número de la expedición actual (1 = la primera)
--   expedition_base  nivel (meses seguidos) en que empezó la expedición actual
--   summits          cumbres de Apex conquistadas: [{ "expedition": 1, "on": "2027-11-01" }]
-- ==========================================================================
alter table public.profiles add column if not exists expedition int not null default 1
  check (expedition between 1 and 100);
alter table public.profiles add column if not exists expedition_base int not null default 0
  check (expedition_base >= 0);
alter table public.profiles add column if not exists summits jsonb not null default '[]'::jsonb
  check (jsonb_typeof(summits) = 'array' and jsonb_array_length(summits) <= 100);
