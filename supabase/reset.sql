-- ==========================================================================
-- RESET TOTAL del esquema public (borra TODAS las tablas, vistas y funciones).
-- Úsalo SOLO en el proyecto de Apexly (hqyfpgrkxddgqymrovax). No toca los
-- usuarios de Auth. Después ejecuta migrations/0001_init.sql.
-- ==========================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists public cascade;
create schema public;

-- Permisos por defecto de Supabase sobre el esquema
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
