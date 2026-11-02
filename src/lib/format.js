export const pct = (v, digits = 0) => `${((Number(v) || 0) * 100).toFixed(digits)}%`

const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
export const num = (v) => numFmt.format(Number(v) || 0)

/** Convierte lo que escribe el usuario ("72,5", "1.000") en número. */
export function parseNumber(input) {
  const s = String(input ?? '').trim().replace(/\s/g, '')
  if (!s) return NaN
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

export function friendlyError(err) {
  const msg = err?.message || String(err)
  if (/schema cache|does not exist|column .* of/i.test(msg)) return 'Falta preparar la base de datos: ejecuta en Supabase el SQL de supabase/migrations.'
  if (/duplicate key|unique/i.test(msg)) return 'Ya existe un registro para esa fecha.'
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirma tu email antes de ingresar.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.'
  return msg
}
