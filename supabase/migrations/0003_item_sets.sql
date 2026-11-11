-- Apexly — series por ejercicio (para el contador de series)
-- Ejecutar en Supabase → SQL Editor después de 0002
--
-- Opcional: si un ejercicio tiene series, en el día aparece un contador que se
-- toca una vez por serie y marca el ejercicio al completar la última.
alter table public.routine_items add column if not exists sets smallint
  check (sets is null or sets between 1 and 20);
