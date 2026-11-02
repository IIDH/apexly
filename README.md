# Apexly

Rutinas de entrenamiento en un calendario: checklist diario, historial, metas con gráficos, rachas y niveles.

**Stack:** React + Vite (PWA) · funciones Node en `/api` (Vercel) · Supabase (Auth + Postgres con RLS).

## Cómo funciona

- **Rutinas:** se asignan a días de la semana y se repiten todas las semanas. Si cambias los días, rigen desde hoy y el historial no se toca.
- **Calendario:** marca el día actual. Al tocar un día ves su checklist: hoy y los últimos 3 días se pueden marcar, los anteriores son historial de solo lectura y los futuros muestran lo programado.
- **Éxito:** al completar todo lo del día aparece "¡Éxito, lo lograste!". Lo mismo al alcanzar una meta.
- **Racha y niveles:** un mes cuenta si completas al menos el 80 % de lo programado. Con 1 mes inicias una racha (nivel 1), con 3 meses seguidos llegas al nivel 3, y así. Un mes bajo el 80 % reinicia la racha; un mes sin nada programado no suma ni corta.
- **Metas:** consistencia mensual (%), días completos al mes o una medida personal con registros (peso, kilos, tiempos…). Cada una tiene su gráfico.

## Puesta en marcha

1. Crea un proyecto **nuevo** en Supabase y ejecuta `supabase/migrations/0001_init.sql` en el SQL Editor.
2. Completa `.env.local` con la URL y la clave publishable (plantilla en `.env.example`).
3. `npm install` y luego `npm run dev`.
4. En Vercel: crea el proyecto, agrega las variables de `.env.example` (la `SUPABASE_SERVICE_ROLE_KEY` solo en Vercel) y despliega.
5. En Supabase → Authentication → URL Configuration, pon la URL de Vercel como Site URL.

Íconos de la PWA: `npx --yes -p sharp node scripts/gen-icons.mjs` (a partir de `public/favicon.svg`).
