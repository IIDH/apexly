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
/** Cada actividad extra suma este porcentaje al cumplimiento del mes… */
export const EXTRA_BONUS = 0.05
/** …con este tope por mes (la rutina sigue siendo lo principal). */
export const EXTRA_BONUS_MAX = 0.1
/** Racha semanal: hitos (en semanas) que se festejan. */
export const STREAK_MILESTONES = [2, 4, 8, 12, 26, 52, 104]

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

// ------------------------------------------------------------ pausas (lesión, enfermedad, vacaciones)
export const PAUSE_REASONS = {
  lesion: { label: 'Lesión', emoji: '🩹' },
  enfermedad: { label: 'Enfermedad', emoji: '🤒' },
  vacaciones: { label: 'Vacaciones', emoji: '🌴' },
  otro: { label: 'Otro motivo', emoji: '⏸️' }
}
/** La pausa cubre la fecha (end_on es el último día de pausa; null = sin fecha de alta). */
export const pauseCovers = (p, iso) => p.start_on <= iso && (!p.end_on || iso <= p.end_on)
/** Pausas que dejan fuera la rutina completa en esa fecha. */
const routinePausedBy = (r, iso) => (r.pauses ?? []).find((p) => pauseCovers(p, iso) && (p.scope === 'total' || p.routine_ids?.includes(r.id)))
const itemPausedBy = (r, item, iso) => (r.pauses ?? []).find((p) => pauseCovers(p, iso) && p.scope === 'parcial' && p.item_ids?.includes(item.id))

/**
 * Rutinas y ejercicios programados en una fecha: [{ routine, items }].
 * Lo que está en pausa no se programa (no cuenta para cumplimiento ni racha),
 * salvo con { ignorePauses: true }.
 */
export function planFor(routines, iso, { ignorePauses = false } = {}) {
  const wd = weekdayOf(iso)
  const plan = []
  for (const r of routines) {
    const days = weekdaysOn(r, iso)
    if (!days?.includes(wd)) continue
    if (!ignorePauses && routinePausedBy(r, iso)) continue
    const items = r.items
      .filter((i) => itemActiveOn(i, iso) && (ignorePauses || !itemPausedBy(r, i, iso)))
      .sort((a, b) => a.position - b.position)
    if (items.length) plan.push({ routine: r, items })
  }
  return plan
}

/** Ejercicios que tocaban ese día pero quedaron en pausa, con la pausa que los cubre. */
export function pausedOn(routines, iso) {
  const out = []
  for (const { routine, items } of planFor(routines, iso, { ignorePauses: true })) {
    const whole = routinePausedBy(routine, iso)
    for (const i of items) {
      const p = whole ?? itemPausedBy(routine, i, iso)
      if (p) out.push({ routine, item: i, pause: p })
    }
  }
  return out
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
  // Lo que tocaba pero quedó en pausa (solo para mostrarlo; no cuenta)
  const paused = routines.some((r) => r.pauses?.length) ? pausedOn(routines, iso) : []
  return { plan, total, done, paused }
}

/** Estado visual de un día en el calendario (hasExtra: hubo actividad extra ese día). */
export function dayStatus(stats, iso, today = todayISO(), hasExtra = false) {
  if (!stats.total) return stats.paused?.length ? 'paused' : 'rest'
  if (stats.done === stats.total) return 'complete'
  if (iso > today) return 'planned'
  if (hasExtra) return 'rescued'
  if (stats.done > 0) return 'partial'
  return iso === today ? 'pending' : 'missed'
}

// ------------------------------------------------------------ cumplimiento por mes
/** Bonus de actividades extra para un mes: +5 % c/u, tope +10 %. */
export function extraBonus(extras, year, month, upto = todayISO()) {
  const from = monthStart(year, month)
  const count = (extras ?? []).filter((e) => e.done_on >= from && e.done_on <= upto && e.done_on.slice(0, 7) === from.slice(0, 7)).length
  return { count, bonus: Math.min(count * EXTRA_BONUS, EXTRA_BONUS_MAX) }
}

/**
 * Cumplimiento de un mes hasta `upto` (incluido). `ratio` incluye el bonus de
 * actividades extra (tope +10 %); `base` es solo lo de las rutinas.
 */
export function monthStats(routines, doneSet, year, month, upto = todayISO(), extras = []) {
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
  const base = scheduled ? done / scheduled : null
  const { count: extrasCount, bonus } = scheduled ? extraBonus(extras, year, month, upto) : { count: 0, bonus: 0 }
  return { year, month, scheduled, done, daysScheduled, daysComplete, base, bonus, extrasCount, ratio: base === null ? null : Math.min(1, base + bonus) }
}

export function earliestStart(routines) {
  return routines.reduce((min, r) => (!min || r.start_date < min ? r.start_date : min), null)
}

/**
 * Historial mensual desde la primera rutina hasta el mes actual (incluido, parcial).
 * Cada mes cerrado con ≥ 80 % suma a la racha; uno bajo el 80 % la reinicia;
 * un mes sin nada programado no suma ni corta.
 */
export function progressHistory(routines, doneSet, today = todayISO(), extras = []) {
  const first = earliestStart(routines)
  const weekly = weekStreak(routines, doneSet, extras, today)
  if (!first) return { months: [], streak: 0, best: 0, current: null, weekly }
  const [fy, fm] = first.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  const months = []
  let streak = 0
  let best = 0
  for (let p = { year: fy, month: fm }; p.year * 12 + p.month <= ty * 12 + tm; p = shiftMonth(p, 1)) {
    const s = monthStats(routines, doneSet, p.year, p.month, today, extras)
    const inProgress = p.year === ty && p.month === tm
    const met = s.ratio !== null && s.ratio >= MONTH_THRESHOLD
    if (!inProgress && s.ratio !== null) {
      streak = met ? streak + 1 : 0
      best = Math.max(best, streak)
    }
    months.push({ ...s, inProgress, met })
  }
  return { months, streak, best, current: months[months.length - 1], weekly }
}

/** Lunes de la semana de una fecha (la semana parte el lunes). */
export const weekStart = (iso) => addDays(iso, -((weekdayOf(iso) + 6) % 7))

/**
 * Racha semanal. Una semana cumple si completas todos sus días de rutina
 * (un día sin completar pero con actividad extra cuenta como salvado). Semanas
 * sin rutina o en pausa no suman ni cortan. Se corta cuando un día de rutina
 * queda sin completar y ya pasó el plazo para marcarlo.
 * La racha se "enciende" con el primer día entrenado: la semana en curso queda
 * encendida aunque aún no termine.
 *
 * También cuenta días entrenados (al menos un ejercicio hecho): en la racha,
 * este mes, este año y en total.
 */
export function weekStreak(routines, doneSet, extras = [], today = todayISO()) {
  const out = {
    weeks: 0, best: 0, lit: false, startedOn: null, days: 0, rescued: 0,
    thisWeek: { done: 0, planned: 0, rescued: 0 },
    totals: { month: 0, year: 0, all: 0 }
  }
  const first = earliestStart(routines)
  if (!first) return out
  const extraDays = new Set((extras ?? []).map((e) => e.done_on))
  const grace = addDays(today, -EDIT_WINDOW_DAYS)
  const thisMonday = weekStart(today)
  let open = false // la semana actual (no cerrada) ya tiene actividad

  for (let monday = weekStart(first); monday <= thisMonday; monday = addDays(monday, 7)) {
    let planned = 0, complete = 0, trained = 0, rescued = 0, failed = false
    for (let d = 0; d < 7; d++) {
      const iso = addDays(monday, d)
      if (iso < first) continue
      const s = dayStats(routines, doneSet, iso)
      if (iso <= today && s.done > 0) {
        trained++
        out.totals.all++
        if (iso.slice(0, 4) === today.slice(0, 4)) out.totals.year++
        if (iso.slice(0, 7) === today.slice(0, 7)) out.totals.month++
      }
      if (!s.total) continue
      planned++
      if (s.done === s.total) complete++
      else if (iso <= today && extraDays.has(iso)) rescued++
      else if (iso < grace) failed = true
    }
    if (monday === thisMonday) out.thisWeek = { done: complete, planned, rescued }
    if (!planned) continue
    if (failed) {
      Object.assign(out, { weeks: 0, startedOn: null, days: 0, rescued: 0 })
      open = false
      continue
    }
    const met = complete + rescued === planned
    if (met || trained > 0) {
      if (!out.startedOn) out.startedOn = monday
      out.days += trained
      out.rescued += rescued
    }
    if (met) {
      out.weeks++
      out.best = Math.max(out.best, out.weeks)
      open = false
    } else open = trained > 0 || rescued > 0
  }
  out.lit = out.weeks > 0 || open
  return out
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

/** Ejercicios que faltan marcar este mes para llegar al 80 % (descontando el bonus de extras). */
export function remainingToMeet(stats, routines) {
  const full = monthStats(routines, new Set(), stats.year, stats.month, monthEnd(stats.year, stats.month))
  const needed = Math.ceil(full.scheduled * Math.max(MONTH_THRESHOLD - (stats.bonus ?? 0), 0)) - stats.done
  return { needed: Math.max(0, needed), totalMonth: full.scheduled }
}

// ------------------------------------------------------------ actividades extra
// Suman +5 % al cumplimiento del mes (tope +10 %) y salvan la racha de días
// cuando ese día tocaba rutina y no se completó.
export const EXTRA_PRESETS = ['Fútbol', 'Pádel', 'Tenis', 'Ciclismo', 'Trekking', 'Natación', 'Running', 'Básquetbol']

export const extrasOn = (extras, iso) => extras.filter((e) => e.done_on === iso)

// ------------------------------------------------------------ planes
/** Plan vigente o próximo (el activo que aún no se termina). */
export function currentPlan(plans, today = todayISO()) {
  const open = (plans ?? []).filter((p) => !p.ended_on).sort((a, b) => a.start_on.localeCompare(b.start_on))
  return open.find((p) => p.start_on <= today) ?? open[0] ?? null
}

/** Semana del plan (1, 2, …) y total de semanas si tiene término. */
export function planWeek(plan, today = todayISO()) {
  if (today < plan.start_on) return null
  const days = Math.round((fromISO(today) - fromISO(plan.start_on)) / 86400000)
  const total = plan.end_on ? Math.ceil((Math.round((fromISO(plan.end_on) - fromISO(plan.start_on)) / 86400000) + 1) / 7) : null
  return { week: Math.floor(days / 7) + 1, total }
}

/** Resumen de un plan entre su inicio y `upto`: cumplimiento, días completos, ejercicios. */
export function planSummary(plan, routines, doneSet, upto = todayISO()) {
  const own = routines.filter((r) => r.plan_id === plan.id)
  const last = plan.end_on && plan.end_on < upto ? plan.end_on : upto
  let scheduled = 0
  let done = 0
  let daysScheduled = 0
  let daysComplete = 0
  let pausedDays = 0
  for (let iso = plan.start_on; iso <= last; iso = addDays(iso, 1)) {
    const s = dayStats(own, doneSet, iso)
    if (!s.total) {
      if (s.paused.length) pausedDays++
      continue
    }
    scheduled += s.total
    done += s.done
    daysScheduled++
    if (s.done === s.total) daysComplete++
  }
  const days = last >= plan.start_on ? Math.round((fromISO(last) - fromISO(plan.start_on)) / 86400000) + 1 : 0
  return { routines: own.length, scheduled, done, daysScheduled, daysComplete, pausedDays, days, weeks: Math.max(1, Math.ceil(days / 7)), ratio: scheduled ? done / scheduled : null }
}

/** Próximo lunes (o hoy si es lunes) como fecha de inicio sugerida. */
export function nextMonday(today = todayISO()) {
  const wd = weekdayOf(today)
  return wd === 1 ? today : addDays(today, (8 - wd) % 7)
}

// ------------------------------------------------------------ montaña de niveles
/** Las 7 cumbres de la cordillera: el nivel (meses seguidos) en que se conquista cada una. */
export const PEAK_LEVELS = [1, 2, 3, 4, 6, 9, 12]
export const APEX_LEVEL = 12

/**
 * Dónde va el escalador en la cordillera.
 * - leg: tramo actual (0 = del campamento base a Iniciado … 6 = hacia Apex)
 * - frac: avance dentro del tramo (meses cumplidos + el mes en curso hacia el 80 %)
 * - secured: el mes en curso ya llegó al 80 % (la cumbre se conquista al cerrar el mes)
 * - atApex / monthsAtTop: en la cima y cuántos meses lleva manteniéndola
 */
export function climbState(level, monthRatio, best = 0) {
  const recordPeaks = PEAK_LEVELS.filter((l) => l <= best).length
  const f = monthRatio == null ? 0 : Math.min(monthRatio / MONTH_THRESHOLD, 1)
  if (level >= APEX_LEVEL) {
    return { atApex: true, leg: PEAK_LEVELS.length - 1, frac: 1, conquered: PEAK_LEVELS.length, next: null, nextTitle: null, secured: f >= 1, monthFrac: f, monthsAtTop: level - APEX_LEVEL, recordPeaks }
  }
  const leg = PEAK_LEVELS.findIndex((l) => l > level)
  const prev = leg === 0 ? 0 : PEAK_LEVELS[leg - 1]
  const next = PEAK_LEVELS[leg]
  // Justo antes de la cumbre se queda a un paso: se conquista al cerrar el mes
  const month = level + 1 === next ? Math.min(f, 0.94) : f
  const frac = Math.min((level - prev + month) / (next - prev), 0.97)
  return { atApex: false, leg, frac, conquered: leg, next, nextTitle: levelTitle(next), secured: f >= 1, monthFrac: f, monthsAtTop: 0, recordPeaks }
}
