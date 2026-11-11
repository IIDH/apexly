import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { friendlyError, pct } from '../lib/format'
import { supabase } from '../lib/supabase'
import { addDays, currentPlan, doneKey, longDate, nextMonday, planSummary, planWeek } from '../lib/training'
import { useConfirm } from './ConfirmDialog'
import { IconEdit, IconFlag, IconPlus, IconTrophy, IconX } from './Icons'

const shortDate = (iso) => longDate(iso).replace(/^\S+ /, '')
const DURATIONS = [null, 4, 6, 8, 12]

/** Rutinas activas (no archivadas a la fecha). */
const activeRoutines = (routines, today) => routines.filter((r) => !r.archived_on || r.archived_on > today)

/**
 * Archiva rutinas desde `from` (deja de programarse ese día). Las que aún no
 * empiezan a esa fecha se borran (no tienen historial).
 */
async function stopRoutines(list, from) {
  for (const r of list) {
    const res = r.start_date >= from
      ? await supabase.from('routines').delete().eq('id', r.id)
      : r.archived_on && r.archived_on <= from
        ? { error: null }
        : await supabase.from('routines').update({ archived_on: from }).eq('id', r.id)
    if (res.error) throw res.error
  }
}

/** Plan de entrenamiento: inicio, término, resumen y transición al siguiente. */
export default function PlanCard({ onCreateRoutine }) {
  const { plans, routines, done, today, reload } = useTraining()
  const [dialog, setDialog] = useState(null) // 'new' | 'end' | 'edit'
  const [fromPlan, setFromPlan] = useState(null) // plan recién terminado: sus rutinas se pueden copiar
  const plan = currentPlan(plans, today)

  const summary = useMemo(() => (plan && plan.start_on <= today ? planSummary(plan, routines, done, today) : null), [plan, routines, done, today])
  const week = plan ? planWeek(plan, today) : null
  const overdue = plan?.end_on && plan.end_on < today
  const own = plan ? routines.filter((r) => r.plan_id === plan.id) : []

  return (
    <>
      {!plan ? (
        <div className="card plan-card plan-empty">
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span className="plan-icon"><IconFlag size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>Entrena por ciclos</b>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Agrupa tus rutinas en un plan (ej: “Fuerza 8 semanas”), con fecha de inicio y término. Al terminarlo ves tu resumen y armas el siguiente.</p>
            </div>
          </div>
          <button className="btn btn-sm dc-cta" style={{ marginTop: 12 }} onClick={() => setDialog('new')}><IconPlus size={14} /> Crear plan</button>
        </div>
      ) : (
        <div className="card plan-card">
          <div className="card-head" style={{ marginBottom: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div className="dc-mono muted">{plan.start_on > today ? 'Próximo plan' : 'Plan actual'}</div>
              <h3 className="card-title" style={{ marginTop: 2 }}>{plan.name}</h3>
              <p className="card-sub">
                {plan.start_on > today
                  ? `Empieza el ${shortDate(plan.start_on)}`
                  : week?.total ? `Semana ${Math.min(week.week, week.total)} de ${week.total}` : `Semana ${week?.week}`}
                {plan.end_on ? ` · hasta el ${shortDate(plan.end_on)}` : ' · sin fecha de término'}
                {` · ${own.length} rutina${own.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button className="dc-icon-btn" onClick={() => setDialog('edit')} aria-label="Editar plan" title="Editar plan"><IconEdit size={15} /></button>
          </div>
          {summary?.ratio != null && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Cumplimiento del plan</span>
                <b className="num">{pct(summary.ratio)}</b>
              </div>
              <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, summary.ratio * 100)}%` }} /></div>
            </>
          )}
          {overdue && <div className="alert alert-warn" style={{ marginTop: 12, fontSize: 13 }}><IconFlag size={16} /><div>Tu plan terminó el {shortDate(plan.end_on)}. Termínalo para ver tu resumen, o extiéndelo.</div></div>}
          {!own.length && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Este plan aún no tiene rutinas. <button className="link-btn" onClick={onCreateRoutine}>Crea la primera</button>.</p>}
          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {plan.start_on <= today && <button className="btn btn-sm dc-cta" onClick={() => setDialog('end')}><IconTrophy size={14} /> Terminar plan</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => setDialog('new')}><IconPlus size={14} /> Nuevo plan</button>
          </div>
        </div>
      )}

      {dialog === 'new' && <NewPlanDialog current={plan} fromPlan={fromPlan} onClose={() => { setDialog(null); setFromPlan(null) }} onDone={() => { setDialog(null); setFromPlan(null); reload() }} />}
      {dialog === 'end' && plan && <EndPlanDialog plan={plan} summary={summary} onClose={() => setDialog(null)} onDone={(next) => { setFromPlan(next ? plan : null); setDialog(next ? 'new' : null); reload() }} />}
      {dialog === 'edit' && plan && <EditPlanDialog plan={plan} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload() }} />}
    </>
  )
}

// ------------------------------------------------------------ modal base
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card dc-rise plan-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 className="card-title">{title}</h3>
          <button className="dc-icon-btn" onClick={onClose} aria-label="Cerrar"><IconX size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function StartPicker({ value, onChange, today }) {
  const monday = nextMonday(today)
  const custom = value !== today && value !== monday
  return (
    <div className="field">
      <span className="label">Empieza</span>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={`chip ${value === today ? 'on' : ''}`} onClick={() => onChange(today)}>Hoy</button>
        {monday !== today && <button type="button" className={`chip ${value === monday ? 'on' : ''}`} onClick={() => onChange(monday)}>Lunes {Number(monday.slice(8))}</button>}
        <input type="date" className={`input input-sm ${custom ? 'on' : ''}`} style={{ width: 160 }} min={today} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Fecha de inicio" />
      </div>
    </div>
  )
}

// ------------------------------------------------------------ nuevo plan
function NewPlanDialog({ current: currentProp, fromPlan, onClose, onDone }) {
  const { routines, today } = useTraining()
  const { notify } = useApp()
  // Viniendo de terminar un plan: se ofrecen sus rutinas (ya archivadas) para copiarlas
  const current = fromPlan ? null : currentProp
  const active = fromPlan ? routines.filter((r) => r.plan_id === fromPlan.id) : activeRoutines(routines, today)
  const [name, setName] = useState('')
  const [start, setStart] = useState(current || fromPlan ? nextMonday(today) : today)
  const [weeks, setWeeks] = useState(8)
  const [mode, setMode] = useState(active.length ? (current || fromPlan ? 'copy' : 'adopt') : 'empty')
  const [busy, setBusy] = useState(false)
  const end = weeks ? addDays(start, weeks * 7 - 1) : null

  async function save() {
    if (!name.trim()) return notify('Ponle un nombre al plan', 'error')
    setBusy(true)
    try {
      const created = await supabase.from('plans').insert({ name: name.trim(), start_on: start, end_on: end }).select().single()
      if (created.error) throw created.error
      const planId = created.data.id
      const stopAt = end ? addDays(end, 1) : null

      if (mode === 'adopt') {
        // Las rutinas actuales pasan a este plan (y paran al terminarlo)
        for (const r of active) {
          const res = await supabase.from('routines').update({ plan_id: planId, archived_on: stopAt && stopAt < r.start_date ? r.start_date : stopAt }).eq('id', r.id)
          if (res.error) throw res.error
        }
      } else {
        if (mode === 'copy') {
          // Copia de cada rutina (días y ejercicios actuales) que parte con el plan
          for (const r of active) {
            const sched = [...r.schedules].sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
            const nr = await supabase.from('routines').insert({ name: r.name, color: r.color, start_date: start, plan_id: planId, archived_on: stopAt }).select().single()
            if (nr.error) throw nr.error
            const s = await supabase.from('routine_schedules').insert({ routine_id: nr.data.id, valid_from: start, weekdays: sched?.weekdays ?? [1] })
            if (s.error) throw s.error
            // La versión más reciente de la rutina: ejercicios que no se quitaron antes de que terminara
            const cutoff = r.archived_on ?? today
            const items = r.items.filter((i) => !i.archived_on || i.archived_on > cutoff).sort((a, b) => a.position - b.position)
            if (items.length) {
              const ins = await supabase.from('routine_items').insert(items.map((i, position) => ({ routine_id: nr.data.id, name: i.name, detail: i.detail, position, created_on: start, ...(i.sets ? { sets: i.sets } : {}) })))
              if (ins.error) throw ins.error
            }
          }
        }
        // Las rutinas anteriores dejan de programarse cuando empieza el plan nuevo
        await stopRoutines(active, start)
      }
      // El plan anterior termina el día antes de que empiece el nuevo
      if (current && current.id !== planId) {
        const endedOn = addDays(start, -1) < current.start_on ? current.start_on : addDays(start, -1)
        const res = await supabase.from('plans').update({ ended_on: endedOn }).eq('id', current.id)
        if (res.error) throw res.error
      }
      notify(mode === 'empty' ? 'Plan creado: ahora agrega sus rutinas' : 'Plan creado')
      onDone()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title="Nuevo plan" onClose={onClose}>
      <div className="stack" style={{ gap: 16, marginTop: 14 }}>
        <label className="field">
          <span className="label">Nombre</span>
          <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Fuerza 8 semanas, Verano, Volumen" autoFocus />
        </label>
        <StartPicker value={start} onChange={setStart} today={today} />
        <div className="field">
          <span className="label">Duración</span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {DURATIONS.map((w) => <button type="button" key={w ?? 'none'} className={`chip ${weeks === w ? 'on' : ''}`} onClick={() => setWeeks(w)}>{w ? `${w} semanas` : 'Sin término'}</button>)}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{end ? `Termina el ${shortDate(end)}: sus rutinas dejan de aparecer después de esa fecha.` : 'Lo terminas tú cuando quieras.'}</span>
        </div>
        {active.length > 0 && (
          <div className="field">
            <span className="label">¿Con qué rutinas?</span>
            <div className="stack" style={{ gap: 8 }}>
              {!fromPlan && <button type="button" className={`choice ${mode === 'adopt' ? 'on' : ''}`} onClick={() => setMode('adopt')}>
                <span className="choice-dot" /><span><b>Las mismas que tengo</b><small>Tus {active.length} rutina{active.length === 1 ? '' : 's'} actuales pasan a este plan tal cual.</small></span>
              </button>}
              <button type="button" className={`choice ${mode === 'copy' ? 'on' : ''}`} onClick={() => setMode('copy')}>
                <span className="choice-dot" /><span><b>{fromPlan ? `Copiar las de “${fromPlan.name}”` : 'Una copia para ajustarla'}</b><small>Se copian tus rutinas para el plan nuevo y las cambias sin tocar el historial de las anteriores.</small></span>
              </button>
              <button type="button" className={`choice ${mode === 'empty' ? 'on' : ''}`} onClick={() => setMode('empty')}>
                <span className="choice-dot" /><span><b>Empezar de cero</b><small>{fromPlan ? 'Armas rutinas nuevas para este plan.' : `Las rutinas actuales dejan de aparecer ${start === today ? 'desde hoy' : `el ${shortDate(start)}`} y armas nuevas.`}</small></span>
              </button>
            </div>
          </div>
        )}
        {current && <p className="muted" style={{ fontSize: 12, margin: 0 }}>“{current.name}” se da por terminado {start === today ? 'hoy' : `el ${shortDate(addDays(start, -1))}`}. Tu historial y tu racha se conservan.</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn dc-cta" disabled={busy} onClick={save}>{busy ? 'Creando…' : 'Crear plan'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------ terminar plan
function EndPlanDialog({ plan, summary, onClose, onDone }) {
  const { routines, done, today } = useTraining()
  const { notify } = useApp()
  const [busy, setBusy] = useState(false)
  const own = routines.filter((r) => r.plan_id === plan.id)
  const s = summary ?? planSummary(plan, routines, done, today)

  async function finish(next) {
    setBusy(true)
    try {
      const overdue = plan.end_on && plan.end_on < today
      if (!overdue) {
        // Si hoy ya entrenó algo del plan, hoy cuenta y las rutinas paran mañana
        const trainedToday = own.some((r) => r.items.some((i) => done.has(doneKey(i.id, today))))
        await stopRoutines(own.filter((r) => !r.archived_on || r.archived_on > today), trainedToday ? addDays(today, 1) : today)
      }
      const res = await supabase.from('plans').update({ ended_on: overdue ? plan.end_on : today }).eq('id', plan.id)
      if (res.error) throw res.error
      notify(`“${plan.name}” terminado. ¡Bien hecho!`)
      onDone(next)
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={`Terminar “${plan.name}”`} onClose={onClose}>
      <div className="plan-summary">
        <div className="plan-big num">{s.ratio != null ? pct(s.ratio) : '—'}<small>cumplimiento</small></div>
        <div className="plan-stats">
          <div><b className="num">{s.weeks}</b><span>semana{s.weeks === 1 ? '' : 's'}</span></div>
          <div><b className="num">{s.daysComplete}/{s.daysScheduled}</b><span>días completos</span></div>
          <div><b className="num">{s.done}</b><span>ejercicios hechos</span></div>
          {s.pausedDays > 0 && <div><b className="num">{s.pausedDays}</b><span>días en pausa</span></div>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Sus {own.length} rutina{own.length === 1 ? '' : 's'} dejan de aparecer en el calendario. Tu historial, tus metas y tu racha se conservan.</p>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => finish(false)}>Solo terminar</button>
        <button type="button" className="btn dc-cta" disabled={busy} onClick={() => finish(true)}>Terminar y armar el siguiente</button>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------ editar plan
function EditPlanDialog({ plan, onClose, onDone }) {
  const { routines, today } = useTraining()
  const { notify } = useApp()
  const confirm = useConfirm()
  const [name, setName] = useState(plan.name)
  const [hasEnd, setHasEnd] = useState(!!plan.end_on)
  const [end, setEnd] = useState(plan.end_on ?? addDays(plan.start_on, 8 * 7 - 1))
  const [busy, setBusy] = useState(false)
  const own = routines.filter((r) => r.plan_id === plan.id)

  async function save() {
    if (!name.trim()) return notify('Ponle un nombre al plan', 'error')
    const newEnd = hasEnd ? end : null
    if (newEnd && newEnd < plan.start_on) return notify('El término no puede ser antes del inicio', 'error')
    setBusy(true)
    try {
      const res = await supabase.from('plans').update({ name: name.trim(), end_on: newEnd }).eq('id', plan.id)
      if (res.error) throw res.error
      if (newEnd !== plan.end_on) {
        // Las rutinas que paraban con el término anterior siguen el nuevo término
        const oldStop = plan.end_on ? addDays(plan.end_on, 1) : null
        const newStop = newEnd ? addDays(newEnd, 1) : null
        for (const r of own.filter((x) => (x.archived_on ?? null) === oldStop)) {
          const u = await supabase.from('routines').update({ archived_on: newStop && newStop <= r.start_date ? r.start_date : newStop }).eq('id', r.id)
          if (u.error) throw u.error
        }
      }
      notify('Plan actualizado')
      onDone()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  async function cancelPlan() {
    if (!(await confirm({ tone: 'danger', title: `¿Cancelar “${plan.name}”?`, message: 'Aún no empieza: se borra el plan y sus rutinas.', confirmText: 'Cancelar plan' }))) return
    try {
      await stopRoutines(own, plan.start_on)
      const res = await supabase.from('plans').delete().eq('id', plan.id)
      if (res.error) throw res.error
      notify('Plan cancelado')
      onDone()
    } catch (err) {
      notify(friendlyError(err), 'error')
    }
  }

  return (
    <Modal title="Editar plan" onClose={onClose}>
      <div className="stack" style={{ gap: 16, marginTop: 14 }}>
        <label className="field">
          <span className="label">Nombre</span>
          <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="label">Término</span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className={`chip ${!hasEnd ? 'on' : ''}`} onClick={() => setHasEnd(false)}>Sin término</button>
            <button type="button" className={`chip ${hasEnd ? 'on' : ''}`} onClick={() => setHasEnd(true)}>Con fecha</button>
            {hasEnd && <input type="date" className="input input-sm" style={{ width: 160 }} min={plan.start_on} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} aria-label="Último día del plan" />}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Para extender el plan, mueve la fecha: sus rutinas siguen apareciendo hasta el nuevo término.</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {plan.start_on > today ? <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={cancelPlan}>Cancelar plan</button> : <span />}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn dc-cta" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
