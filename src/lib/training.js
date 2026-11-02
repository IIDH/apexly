// Lógica de entrenamiento: fechas locales, qué toca cada día, cumplimiento,
// rachas y niveles. Las fechas se manejan como texto 'YYYY-MM-DD' en hora local.

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // la semana parte el lunes
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Un mes cuenta para la racha si se completó al menos este porcentaje de lo programado. */
export const MONTH_THRESHOLD = 0.8
/** Días hacia atrás en que todavía se pueden marcar ejercicios (igual que la regla de la base). */
export const EDIT_WINDOW_DAYS = 3

export const ROUTINE_COLORS = ['#ff5e1a', '#ffb020', '#1baf7a', '#0aa5ff', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b']

// ------------------------------------------------------------ fechas
const pad = (n) => String(n).padStart(2, '0')
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayISO = () => toISO(new Date())
export const addDays = (iso, n) => {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const weekdayOf = (iso) => fromISO(iso).getDay()
export const monthKey = (iso) => iso.slice(0, 7)
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate()
export const monthStart = (year, month) => `${year}-${pad(month)}-01`
export const monthEnd = (year, month) => `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`
export const shiftMonth = ({ year, month }, delta) => {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}
export const monthLabel = ({ year, month }) => `${MONTHS[month - 1]} ${year}`
export const monthShortLabel = ({ year, month }) => `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`
export const longDate = (iso) => {
  const d = fromISO(iso)
  const w = WEEKDAYS_LONG[d.getDay()]
  return `${w[0].toUpperCase()}${w.slice(1)} ${d.getDate()} de ${MONTHS[d.getMonth()]}`
}

export function canEditDate(iso, today = todayISO()) {
  return iso <= today && iso >= addDays(today, -EDIT_WINDOW_DAYS)
}

// ------------------------------------------------------------ qué toca cada día
/** Días de la semana vigentes de una rutina en una fecha (null si no está activa). */
export function weekdaysOn(routine, iso) {
  if (iso < routine.start_date) return null
  if (routine.archived_on && iso >= routine.archived_on) return null
  let current = null
  for (const s of routine.schedules) {
    if (s.valid_from <= iso && (!current || s.valid_from > current.valid_from)) current = s
  }
  return current?.weekdays ?? null
}

export const currentWeekdays = (routine) => {
  const sorted = [...routine.schedules].sort((a, b) => b.valid_from.localeCompare(a.valid_from))
  return sorted[0]?.weekdays ?? []
}

export const itemActiveOn = (item, iso) => item.created_on <= iso && (!item.archived_on || iso < item.archived_on)

/** Rutinas y ejercicios programados en una fecha: [{ routine, items }]. */
export function planFor(routines, iso) {
  const wd = weekdayOf(iso)
  const plan = []
  for (const r of routines) {
    const days = weekdaysOn(r, iso)
    if (!days?.includes(wd)) continue
    const items = r.items.filter((i) => itemActiveOn(i, iso)).sort((a, b) => a.position - b.position)
    if (items.length) plan.push({ routine: r, items })
  }
  return plan
}

/** doneSet: Set de `${item_id}|${fecha}`. */
export const doneKey = (itemId, iso) => `${itemId}|${iso}`

export function dayStats(routines, doneSet, iso) {
  const plan = planFor(routines, iso)
  let total = 0
  let done = 0
  for (const { items } of plan) {
    for (const i of items) {
      total++
      if (doneSet.has(doneKey(i.id, iso))) done++
    }
  }
  return { plan, total, done }
}

/** Estado visual de un día en el calendario. */
export function dayStatus(stats, iso, today = todayISO()) {
  if (!stats.total) return 'rest'
  if (stats.done === stats.total) return 'complete'
  if (iso > today) return 'planned'
  if (stats.done > 0) return 'partial'
  return iso === today ? 'pending' : 'missed'
}

// ------------------------------------------------------------ cumplimiento por mes
/** Cumplimiento de un mes hasta `upto` (incluido). */
export function monthStats(routines, doneSet, year, month, upto = todayISO()) {
  const last = monthEnd(year, month) < upto ? monthEnd(year, month) : upto
  let scheduled = 0
  let done = 0
  let daysScheduled = 0
  let daysComplete = 0
  for (let iso = monthStart(year, month); iso <= last; iso = addDays(iso, 1)) {
    const s = dayStats(routines, doneSet, iso)
    if (!s.total) continue
    scheduled += s.total
    done += s.done
    daysScheduled++
    if (s.done === s.total) daysComplete++
  }
  return { year, month, scheduled, done, daysScheduled, daysComplete, ratio: scheduled ? done / scheduled : null }
}

export function earliestStart(routines) {
  return routines.reduce((min, r) => (!min || r.start_date < min ? r.start_date : min), null)
}

/**
 * Historial mensual desde la primera rutina hasta el mes actual (incluido, parcial).
 * Cada mes cerrado con ≥ 80 % suma a la racha; uno bajo el 80 % la reinicia;
 * un mes sin nada programado no suma ni corta.
 */
export function progressHistory(routines, doneSet, today = todayISO()) {
  const first = earliestStart(routines)
  if (!first) return { months: [], streak: 0, best: 0, current: null }
  const [fy, fm] = first.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  const months = []
  let streak = 0
  let best = 0
  for (let p = { year: fy, month: fm }; p.year * 12 + p.month <= ty * 12 + tm; p = shiftMonth(p, 1)) {
    const s = monthStats(routines, doneSet, p.year, p.month, today)
    const inProgress = p.year === ty && p.month === tm
    const met = s.ratio !== null && s.ratio >= MONTH_THRESHOLD
    if (!inProgress && s.ratio !== null) {
      streak = met ? streak + 1 : 0
      best = Math.max(best, streak)
    }
    months.push({ ...s, inProgress, met })
  }
  return { months, streak, best, current: months[months.length - 1] }
}

// ------------------------------------------------------------ niveles
const TITLES = [
  [12, 'Apex'],
  [9, 'Leyenda'],
  [6, 'Élite'],
  [4, 'Imparable'],
  [3, 'Disciplinado'],
  [2, 'Constante'],
  [1, 'Iniciado'],
  [0, 'Sin racha']
]
/** Nivel = meses seguidos cumplidos. */
export const levelTitle = (level) => TITLES.find(([min]) => level >= min)[1]

/** Ejercicios que faltan marcar este mes para llegar al 80 % de todo lo programado. */
export function remainingToMeet(stats, routines) {
  const full = monthStats(routines, new Set(), stats.year, stats.month, monthEnd(stats.year, stats.month))
  const needed = Math.ceil(full.scheduled * MONTH_THRESHOLD) - stats.done
  return { needed: Math.max(0, needed), totalMonth: full.scheduled }
}

// ------------------------------------------------------------ actividades extra
// No cuentan para el cumplimiento ni la racha: tienen sus propios hitos.
export const EXTRA_PRESETS = ['Fútbol', 'Pádel', 'Tenis', 'Ciclismo', 'Trekking', 'Natación', 'Running', 'Básquetbol']
export const EXTRA_MILESTONES = [1, 5, 10, 25, 50, 100]

export const extrasOn = (extras, iso) => extras.filter((e) => e.done_on === iso)

/** Hito alcanzado justo al llegar a `count` actividades (o null). */
export const extraMilestoneAt = (count) => (EXTRA_MILESTONES.includes(count) ? count : null)
