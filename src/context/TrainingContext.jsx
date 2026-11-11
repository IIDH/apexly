import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { doneKey, earliestStart, progressHistory, todayISO } from '../lib/training'
import { useApp } from './AppContext'

const Ctx = createContext(null)

/** Supabase entrega máximo 1000 filas por consulta: pagina hasta traer todo. */
async function fetchAll(build) {
  const size = 1000
  const rows = []
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < size) return rows
  }
}

export function TrainingProvider({ children }) {
  const { user, notify } = useApp()
  const [routines, setRoutines] = useState(null)
  const [goals, setGoals] = useState(null)
  const [extras, setExtras] = useState(null)
  const [plans, setPlans] = useState([])
  const [pauses, setPauses] = useState([])
  const [done, setDone] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [today, setToday] = useState(todayISO)

  // Si la app queda abierta pasada la medianoche, "hoy" se actualiza al volver
  useEffect(() => {
    const tick = () => setToday(todayISO())
    document.addEventListener('visibilitychange', tick)
    const t = setInterval(tick, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      clearInterval(t)
    }
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [r, s, i, g, e, x, pl, pa] = await Promise.all([
        fetchAll(() => supabase.from('routines').select('*').order('created_at')),
        fetchAll(() => supabase.from('routine_schedules').select('*').order('valid_from')),
        fetchAll(() => supabase.from('routine_items').select('*').order('position')),
        fetchAll(() => supabase.from('goals').select('*').order('created_at')),
        fetchAll(() => supabase.from('goal_entries').select('*').order('measured_on')),
        // Si aún no se ejecutó 0002_extra_activities.sql, la app sigue funcionando sin extras
        fetchAll(() => supabase.from('extra_activities').select('*').order('done_on')).catch(() => []),
        // Planes y pausas (0004_plans_pauses.sql): opcionales hasta correr la migración
        fetchAll(() => supabase.from('plans').select('*').order('start_on')).catch(() => []),
        fetchAll(() => supabase.from('pauses').select('*').order('start_on')).catch(() => [])
      ])
      const list = r.map((x) => ({
        ...x,
        schedules: s.filter((y) => y.routine_id === x.id),
        items: i.filter((y) => y.routine_id === x.id),
        // Cada rutina conoce las pausas para saber qué días no cuentan
        pauses: pa
      }))
      const since = earliestStart(list)
      const c = since
        ? await fetchAll(() => supabase.from('completions').select('item_id, done_on').gte('done_on', since).order('done_on'))
        : []
      setRoutines(list)
      setGoals(g.map((x) => ({ ...x, entries: e.filter((y) => y.goal_id === x.id) })))
      setExtras(x)
      setPlans(pl)
      setPauses(pa)
      setDone(new Set(c.map((x) => doneKey(x.item_id, x.done_on))))
      setError(null)
    } catch (err) {
      setError(friendlyError(err))
      setRoutines((v) => v ?? [])
      setGoals((v) => v ?? [])
      setExtras((v) => v ?? [])
    }
  }, [user])

  useEffect(() => { load() }, [load])

  /** Marca o desmarca un ejercicio (actualiza en pantalla al instante y revierte si falla). */
  const toggle = useCallback(async (itemId, iso) => {
    const key = doneKey(itemId, iso)
    const wasDone = done.has(key)
    setDone((prev) => {
      const next = new Set(prev)
      wasDone ? next.delete(key) : next.add(key)
      return next
    })
    const { error: err } = wasDone
      ? await supabase.from('completions').delete().eq('item_id', itemId).eq('done_on', iso)
      : await supabase.from('completions').upsert({ item_id: itemId, done_on: iso }, { onConflict: 'item_id,done_on', ignoreDuplicates: true })
    if (err) {
      setDone((prev) => {
        const next = new Set(prev)
        wasDone ? next.add(key) : next.delete(key)
        return next
      })
      notify(friendlyError(err), 'error')
      return false
    }
    return true
  }, [done, notify])

  const progress = useMemo(() => (routines ? progressHistory(routines, done, today) : null), [routines, done, today])

  const value = useMemo(
    () => ({ routines, goals, extras, plans, pauses, done, error, today, progress, reload: load, toggle }),
    [routines, goals, extras, plans, pauses, done, error, today, progress, load, toggle]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTraining = () => useContext(Ctx)
