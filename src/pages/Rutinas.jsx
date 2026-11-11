import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfirm } from '../components/ConfirmDialog'
import { IconChevDown, IconChevUp, IconDumbbell, IconEdit, IconPlus, IconTrash } from '../components/Icons'
import PageHead from '../components/PageHead'
import PlanCard from '../components/PlanCard'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { ROUTINE_COLORS, WEEK_ORDER, WEEKDAYS, WEEKDAYS_LONG, addDays, currentPlan, currentWeekdays, longDate, nextMonday, todayISO } from '../lib/training'

const blank = () => ({ id: null, name: '', color: ROUTINE_COLORS[0], weekdays: [], items: [{ key: crypto.randomUUID(), name: '', detail: '', sets: '' }] })
const shortDate = (iso) => longDate(iso).replace(/^\S+ /, '')

export const weekdaysText = (days) => {
  const sorted = WEEK_ORDER.filter((d) => days.includes(d))
  if (sorted.length === 7) return 'Todos los días'
  if (sorted.length === 5 && !days.includes(0) && !days.includes(6)) return 'Lunes a viernes'
  return sorted.map((d) => WEEKDAYS[d]).join(' · ')
}

export default function Rutinas() {
  const { routines, plans, today, reload } = useTraining()
  const { notify } = useApp()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    if (params.get('nueva')) {
      setEditing(blank())
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  if (!routines) return <div className="skeleton" style={{ height: 360 }} />

  const active = routines.filter((r) => !r.archived_on || r.archived_on > today)
  const archived = routines.filter((r) => r.archived_on && r.archived_on <= today)
  const plan = currentPlan(plans, today)
  // Rutinas del plan actual primero; el resto bajo "Sin plan"
  const groups = plan
    ? [
        { key: 'plan', title: plan.name, list: active.filter((r) => r.plan_id === plan.id) },
        { key: 'other', title: 'Sin plan', list: active.filter((r) => r.plan_id !== plan.id) }
      ]
    : [{ key: 'all', title: null, list: active }]

  function edit(r) {
    setEditing({
      id: r.id,
      name: r.name,
      color: r.color,
      weekdays: currentWeekdays(r),
      items: r.items
        .filter((i) => !i.archived_on || i.archived_on > today)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ key: i.id, id: i.id, name: i.name, origName: i.name, replace: true, detail: i.detail ?? '', sets: i.sets ? String(i.sets) : '', hadSets: !!i.sets, created_on: i.created_on }))
    })
  }

  async function archive(r) {
    const fresh = r.start_date >= today
    if (!(await confirm({
      tone: 'warn',
      title: fresh ? `¿Eliminar "${r.name}"?` : `¿Archivar "${r.name}"?`,
      message: fresh ? 'La rutina se creó hoy, así que se elimina por completo.' : 'Deja de aparecer en el calendario desde hoy. Tu historial y tu racha se conservan.',
      confirmText: fresh ? 'Eliminar' : 'Archivar'
    }))) return
    const { error } = fresh
      ? await supabase.from('routines').delete().eq('id', r.id)
      : await supabase.from('routines').update({ archived_on: today }).eq('id', r.id)
    if (error) return notify(friendlyError(error), 'error')
    notify(fresh ? 'Rutina eliminada' : 'Rutina archivada')
    if (editing?.id === r.id) setEditing(null)
    reload()
  }

  async function remove(r) {
    if (!(await confirm({
      tone: 'danger',
      title: `¿Eliminar "${r.name}" definitivamente?`,
      message: 'Se borra la rutina y todo su historial de checks. Esto puede cambiar el cumplimiento de meses pasados y tu racha.',
      confirmText: 'Eliminar todo'
    }))) return
    const { error } = await supabase.from('routines').delete().eq('id', r.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Rutina eliminada')
    reload()
  }

  return (
    <>
      <PageHead eyebrow="Rutinas" title="Arma tu" accent="semana" lead="Cada rutina se repite en los días de la semana que elijas, todas las semanas.">
        <button className="btn dc-cta" onClick={() => setEditing(blank())}><IconPlus size={16} /> Nueva rutina</button>
      </PageHead>

      <div className="grid grid-main dc-rise" style={{ alignItems: 'start' }}>
        <div className="stack">
          <PlanCard onCreateRoutine={() => setEditing(blank())} />
          {!active.length && !editing && (
            <div className="card empty">
              <div className="empty-icon"><IconDumbbell size={24} /></div>
              <h3 style={{ fontSize: 20 }}>Todavía no tienes rutinas</h3>
              <p className="muted" style={{ margin: '8px auto 20px', maxWidth: 380 }}>Por ejemplo: "Pierna" los lunes y jueves con sentadillas, prensa y zancadas.</p>
              <button className="btn dc-cta" onClick={() => setEditing(blank())}><IconPlus size={16} /> Crear rutina</button>
            </div>
          )}
          {groups.filter((g) => g.list.length).map((g) => (
            <div key={g.key} className="stack">
              {g.title && groups.length > 1 && <div className="group-label dc-mono muted">{g.key === 'plan' ? `Plan · ${g.title}` : g.title}</div>}
          {g.list.map((r) => {
            const items = r.items.filter((i) => !i.archived_on || i.archived_on > today).sort((a, b) => a.position - b.position)
            return (
              <div key={r.id} className="card routine-card" style={{ '--rc': r.color }}>
                <div className="card-head" style={{ marginBottom: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="card-title row" style={{ gap: 10 }}><span className="swatch" style={{ background: r.color, width: 12, height: 12 }} />{r.name}</h3>
                    <p className="card-sub">{weekdaysText(currentWeekdays(r))} · {items.length} ejercicio{items.length === 1 ? '' : 's'}</p>
                    {r.start_date > today && <span className="badge badge-level" style={{ marginTop: 6 }}>Empieza el {shortDate(r.start_date)}</span>}
                    {r.archived_on && r.archived_on > today && r.start_date <= today && <span className="badge" style={{ marginTop: 6 }}>Hasta el {shortDate(addDays(r.archived_on, -1))}</span>}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="dc-icon-btn" onClick={() => edit(r)} aria-label={`Editar ${r.name}`} title="Editar"><IconEdit size={15} /></button>
                    <button className="dc-icon-btn" onClick={() => archive(r)} aria-label={`Archivar ${r.name}`} title="Archivar"><IconTrash size={15} /></button>
                  </div>
                </div>
                <div className="week-strip">
                  {WEEK_ORDER.map((d) => <span key={d} className={currentWeekdays(r).includes(d) ? 'on' : ''} title={WEEKDAYS_LONG[d]}>{WEEKDAYS[d][0]}</span>)}
                </div>
                <ol className="item-list">
                  {items.map((i) => <li key={i.id}><span>{i.name}</span>{(i.sets || i.detail) && <span className="muted">{[i.sets && `${i.sets} series`, i.detail].filter(Boolean).join(' · ')}</span>}</li>)}
                </ol>
              </div>
            )
          })}
            </div>
          ))}
          {archived.length > 0 && (
            <details className="card">
              <summary className="card-title" style={{ cursor: 'pointer' }}>Archivadas ({archived.length})</summary>
              <div className="list" style={{ marginTop: 12 }}>
                {archived.map((r) => (
                  <div key={r.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <div className="row" style={{ gap: 8, minWidth: 0 }}><span className="swatch" style={{ background: r.color }} /><span>{r.name}</span><span className="muted" style={{ fontSize: 12 }}>hasta {r.archived_on}</span></div>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(r)}><IconTrash size={14} /> Eliminar</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {editing && <RoutineEditor key={editing.id ?? 'new'} initial={editing} routines={routines} plan={plan} onDone={() => { setEditing(null); reload() }} onCancel={() => setEditing(null)} />}
      </div>
    </>
  )
}

// ------------------------------------------------------------ editor
function RoutineEditor({ initial, routines, plan, onDone, onCancel }) {
  const { notify } = useApp()
  const today0 = todayISO()
  const [form, setForm] = useState(() => ({
    ...initial,
    // Rutina nueva: entra al plan actual y parte cuando parte el plan (o hoy)
    inPlan: !initial.id && !!plan,
    start: !initial.id && plan && plan.start_on > today0 ? plan.start_on : today0
  }))
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setItem = (key, patch) => set({ items: form.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })
  const move = (idx, delta) => {
    const items = [...form.items]
    const [it] = items.splice(idx, 1)
    items.splice(idx + delta, 0, it)
    set({ items })
  }
  const toggleDay = (d) => set({ weekdays: form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d] })

  async function save(e) {
    e.preventDefault()
    const name = form.name.trim()
    const items = form.items
      .map((i) => ({ ...i, name: i.name.trim(), detail: i.detail.trim(), sets: Math.min(Math.max(parseInt(i.sets, 10) || 0, 0), 20) || null }))
      .filter((i) => i.name)
    if (!name) return notify('Ponle un nombre a la rutina', 'error')
    if (!form.weekdays.length) return notify('Elige al menos un día de la semana', 'error')
    if (!items.length) return notify('Agrega al menos un ejercicio', 'error')

    setBusy(true)
    const today = todayISO()
    // Los ejercicios de una rutina nueva existen desde que la rutina empieza
    const itemsFrom = form.id ? today : form.start
    try {
      let routineId = form.id
      if (!routineId) {
        const withPlan = form.inPlan && plan
        const stop = withPlan && plan.end_on ? addDays(plan.end_on, 1) : null
        const r = await supabase
          .from('routines')
          .insert({ name, color: form.color, start_date: form.start, ...(withPlan ? { plan_id: plan.id } : {}), ...(stop && stop > form.start ? { archived_on: stop } : {}) })
          .select()
          .single()
        if (r.error) throw r.error
        routineId = r.data.id
        const s = await supabase.from('routine_schedules').insert({ routine_id: routineId, valid_from: form.start, weekdays: form.weekdays })
        if (s.error) throw s.error
      } else {
        const r = await supabase.from('routines').update({ name, color: form.color }).eq('id', routineId)
        if (r.error) throw r.error
        const original = routines.find((x) => x.id === routineId)
        const before = [...currentWeekdays(original)].sort().join()
        if (before !== [...form.weekdays].sort().join()) {
          // Los días nuevos rigen desde hoy: el historial anterior no cambia
          const s = await supabase.from('routine_schedules').upsert({ routine_id: routineId, valid_from: original.start_date > today ? original.start_date : today, weekdays: form.weekdays }, { onConflict: 'routine_id,valid_from' })
          if (s.error) throw s.error
        }
        // Ejercicios quitados: se archivan desde hoy (o se borran si se crearon hoy)
        const keep = new Set(items.filter((i) => i.id).map((i) => i.id))
        for (const old of initial.items.filter((i) => i.id && !keep.has(i.id))) {
          const q = old.created_on >= today
            ? supabase.from('routine_items').delete().eq('id', old.id)
            : supabase.from('routine_items').update({ archived_on: today }).eq('id', old.id)
          const res = await q
          if (res.error) throw res.error
        }
      }
      for (const [position, it] of items.entries()) {
        // "sets" solo se envía si se usa (así funciona aunque falte la migración 0003)
        const fields = { name: it.name, detail: it.detail || null, position, ...(it.sets || it.hadSets ? { sets: it.sets } : {}) }
        // Cambió el nombre y es otro ejercicio: el anterior queda en el historial hasta ayer
        if (it.id && it.name !== it.origName.trim() && it.replace) {
          const old = it.created_on >= today
            ? await supabase.from('routine_items').delete().eq('id', it.id)
            : await supabase.from('routine_items').update({ archived_on: today }).eq('id', it.id)
          if (old.error) throw old.error
          const res = await supabase.from('routine_items').insert({ routine_id: routineId, ...fields, ...(it.sets ? { sets: it.sets } : {}), created_on: today })
          if (res.error) throw res.error
          continue
        }
        const res = it.id
          ? await supabase.from('routine_items').update(fields).eq('id', it.id)
          : await supabase.from('routine_items').insert({ routine_id: routineId, ...fields, created_on: itemsFrom })
        if (res.error) throw res.error
      }
      notify(form.id ? 'Rutina actualizada' : 'Rutina creada')
      onDone()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <form className="card side-form" onSubmit={save} noValidate>
      <h3 className="card-title">{form.id ? 'Editar rutina' : 'Nueva rutina'}</h3>
      <div className="stack" style={{ gap: 16, marginTop: 16 }}>
        <label className="field">
          <span className="label">Nombre</span>
          <input className="input" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Ej: Pierna, Cardio, Tren superior" autoFocus={!form.id} />
        </label>

        {!form.id && (
          <div className="field">
            <span className="label">Empieza</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className={`chip ${form.start === today0 ? 'on' : ''}`} onClick={() => set({ start: today0 })}>Hoy</button>
              {nextMonday(today0) !== today0 && <button type="button" className={`chip ${form.start === nextMonday(today0) ? 'on' : ''}`} onClick={() => set({ start: nextMonday(today0) })}>Lunes {Number(nextMonday(today0).slice(8))}</button>}
              <input type="date" className="input input-sm" style={{ width: 160 }} min={today0} value={form.start} onChange={(e) => e.target.value && set({ start: e.target.value })} aria-label="Fecha de inicio" />
            </div>
            {plan && (
              <label className="row" style={{ gap: 8, fontSize: 13, marginTop: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.inPlan} onChange={(e) => set({ inPlan: e.target.checked })} />
                Parte del plan “{plan.name}”{plan.end_on ? ` (hasta el ${shortDate(plan.end_on)})` : ''}
              </label>
            )}
          </div>
        )}

        <div className="field">
          <span className="label">Días de la semana</span>
          <div className="day-picker" role="group" aria-label="Días de la semana">
            {WEEK_ORDER.map((d) => (
              <button type="button" key={d} className={form.weekdays.includes(d) ? 'on' : ''} aria-pressed={form.weekdays.includes(d)} onClick={() => toggleDay(d)} title={WEEKDAYS_LONG[d]}>
                {WEEKDAYS[d]}
              </button>
            ))}
          </div>
          {form.id && <span className="muted" style={{ fontSize: 12 }}>Si cambias los días, rigen desde hoy; tu historial no se modifica.</span>}
        </div>

        <div className="field">
          <span className="label">Color</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {ROUTINE_COLORS.map((c) => (
              <button type="button" key={c} className={`color-dot ${form.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Color ${c}`} aria-pressed={form.color === c} />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Ejercicios (checklist)</span>
          <span className="muted" style={{ fontSize: 12 }}>Si pones las series, en el día tendrás un contador: tocas al terminar cada serie y el ejercicio se marca solo al final.</span>
          <div className="stack" style={{ gap: 8 }}>
            {form.items.map((it, idx) => (
              <div key={it.key} className="item-edit">
                <div className="item-edit-fields">
                  <input className="input input-sm" value={it.name} maxLength={80} placeholder="Ejercicio (ej: Sentadilla)" onChange={(e) => setItem(it.key, { name: e.target.value })} aria-label={`Ejercicio ${idx + 1}`} />
                  {it.id && it.name.trim() && it.name.trim() !== it.origName.trim() && (
                    <div className="item-rename" role="group" aria-label="¿Corriges el nombre o es otro ejercicio?">
                      <button type="button" className={`chip ${!it.replace ? 'on' : ''}`} onClick={() => setItem(it.key, { replace: false })}>Corregí el nombre</button>
                      <button type="button" className={`chip ${it.replace ? 'on' : ''}`} onClick={() => setItem(it.key, { replace: true })}>Es otro ejercicio</button>
                      <span className="muted">{it.replace ? `“${it.origName}” queda en tu historial hasta ayer.` : 'El historial se muestra con el nombre corregido.'}</span>
                    </div>
                  )}
                  <div className="item-edit-row">
                    <input className="input input-sm item-sets" inputMode="numeric" value={it.sets} placeholder="Series" onChange={(e) => setItem(it.key, { sets: e.target.value.replace(/\D/g, '').slice(0, 2) })} aria-label={`Series del ejercicio ${idx + 1}`} title="Número de series: en el día aparece un contador" />
                    <input className="input input-sm" value={it.detail} maxLength={80} placeholder="Detalle (ej: 12 reps · 40 kg)" onChange={(e) => setItem(it.key, { detail: e.target.value })} aria-label={`Detalle del ejercicio ${idx + 1}`} />
                  </div>
                </div>
                <div className="item-edit-actions">
                  <button type="button" className="icon-mini" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Subir"><IconChevUp size={14} /></button>
                  <button type="button" className="icon-mini" disabled={idx === form.items.length - 1} onClick={() => move(idx, 1)} aria-label="Bajar"><IconChevDown size={14} /></button>
                  <button type="button" className="icon-mini danger" onClick={() => set({ items: form.items.filter((x) => x.key !== it.key) })} aria-label="Quitar"><IconTrash size={14} /></button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ items: [...form.items, { key: crypto.randomUUID(), name: '', detail: '', sets: '' }] })}>
              <IconPlus size={14} /> Agregar ejercicio
            </button>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn dc-cta" disabled={busy}>{busy ? 'Guardando…' : 'Guardar rutina'}</button>
        </div>
      </div>
    </form>
  )
}
