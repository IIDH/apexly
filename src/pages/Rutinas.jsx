import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfirm } from '../components/ConfirmDialog'
import { IconChevDown, IconChevUp, IconDumbbell, IconEdit, IconPlus, IconTrash } from '../components/Icons'
import PageHead from '../components/PageHead'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { ROUTINE_COLORS, WEEK_ORDER, WEEKDAYS, WEEKDAYS_LONG, currentWeekdays, todayISO } from '../lib/training'

const blank = () => ({ id: null, name: '', color: ROUTINE_COLORS[0], weekdays: [], items: [{ key: crypto.randomUUID(), name: '', detail: '' }] })

export const weekdaysText = (days) => {
  const sorted = WEEK_ORDER.filter((d) => days.includes(d))
  if (sorted.length === 7) return 'Todos los días'
  if (sorted.length === 5 && !days.includes(0) && !days.includes(6)) return 'Lunes a viernes'
  return sorted.map((d) => WEEKDAYS[d]).join(' · ')
}

export default function Rutinas() {
  const { routines, today, reload } = useTraining()
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

  function edit(r) {
    setEditing({
      id: r.id,
      name: r.name,
      color: r.color,
      weekdays: currentWeekdays(r),
      items: r.items
        .filter((i) => !i.archived_on || i.archived_on > today)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ key: i.id, id: i.id, name: i.name, detail: i.detail ?? '', created_on: i.created_on }))
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
          {!active.length && !editing && (
            <div className="card empty">
              <div className="empty-icon"><IconDumbbell size={24} /></div>
              <h3 style={{ fontSize: 20 }}>Todavía no tienes rutinas</h3>
              <p className="muted" style={{ margin: '8px auto 20px', maxWidth: 380 }}>Por ejemplo: "Pierna" los lunes y jueves con sentadillas, prensa y zancadas.</p>
              <button className="btn dc-cta" onClick={() => setEditing(blank())}><IconPlus size={16} /> Crear rutina</button>
            </div>
          )}
          {active.map((r) => {
            const items = r.items.filter((i) => !i.archived_on || i.archived_on > today).sort((a, b) => a.position - b.position)
            return (
              <div key={r.id} className="card routine-card" style={{ '--rc': r.color }}>
                <div className="card-head" style={{ marginBottom: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="card-title row" style={{ gap: 10 }}><span className="swatch" style={{ background: r.color, width: 12, height: 12 }} />{r.name}</h3>
                    <p className="card-sub">{weekdaysText(currentWeekdays(r))} · {items.length} ejercicio{items.length === 1 ? '' : 's'}</p>
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
                  {items.map((i) => <li key={i.id}><span>{i.name}</span>{i.detail && <span className="muted">{i.detail}</span>}</li>)}
                </ol>
              </div>
            )
          })}
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

        {editing && <RoutineEditor key={editing.id ?? 'new'} initial={editing} routines={routines} onDone={() => { setEditing(null); reload() }} onCancel={() => setEditing(null)} />}
      </div>
    </>
  )
}

// ------------------------------------------------------------ editor
function RoutineEditor({ initial, routines, onDone, onCancel }) {
  const { notify } = useApp()
  const [form, setForm] = useState(initial)
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
    const items = form.items.map((i) => ({ ...i, name: i.name.trim(), detail: i.detail.trim() })).filter((i) => i.name)
    if (!name) return notify('Ponle un nombre a la rutina', 'error')
    if (!form.weekdays.length) return notify('Elige al menos un día de la semana', 'error')
    if (!items.length) return notify('Agrega al menos un ejercicio', 'error')

    setBusy(true)
    const today = todayISO()
    try {
      let routineId = form.id
      if (!routineId) {
        const r = await supabase.from('routines').insert({ name, color: form.color, start_date: today }).select().single()
        if (r.error) throw r.error
        routineId = r.data.id
        const s = await supabase.from('routine_schedules').insert({ routine_id: routineId, valid_from: today, weekdays: form.weekdays })
        if (s.error) throw s.error
      } else {
        const r = await supabase.from('routines').update({ name, color: form.color }).eq('id', routineId)
        if (r.error) throw r.error
        const original = routines.find((x) => x.id === routineId)
        const before = [...currentWeekdays(original)].sort().join()
        if (before !== [...form.weekdays].sort().join()) {
          // Los días nuevos rigen desde hoy: el historial anterior no cambia
          const s = await supabase.from('routine_schedules').upsert({ routine_id: routineId, valid_from: today, weekdays: form.weekdays }, { onConflict: 'routine_id,valid_from' })
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
        const res = it.id
          ? await supabase.from('routine_items').update({ name: it.name, detail: it.detail || null, position }).eq('id', it.id)
          : await supabase.from('routine_items').insert({ routine_id: routineId, name: it.name, detail: it.detail || null, position, created_on: today })
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
          <div className="stack" style={{ gap: 8 }}>
            {form.items.map((it, idx) => (
              <div key={it.key} className="item-edit">
                <div className="item-edit-fields">
                  <input className="input input-sm" value={it.name} maxLength={80} placeholder="Ejercicio (ej: Sentadilla)" onChange={(e) => setItem(it.key, { name: e.target.value })} aria-label={`Ejercicio ${idx + 1}`} />
                  <input className="input input-sm" value={it.detail} maxLength={80} placeholder="Detalle (ej: 4 × 12 · 40 kg)" onChange={(e) => setItem(it.key, { detail: e.target.value })} aria-label={`Detalle del ejercicio ${idx + 1}`} />
                </div>
                <div className="item-edit-actions">
                  <button type="button" className="icon-mini" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Subir"><IconChevUp size={14} /></button>
                  <button type="button" className="icon-mini" disabled={idx === form.items.length - 1} onClick={() => move(idx, 1)} aria-label="Bajar"><IconChevDown size={14} /></button>
                  <button type="button" className="icon-mini danger" onClick={() => set({ items: form.items.filter((x) => x.key !== it.key) })} aria-label="Quitar"><IconTrash size={14} /></button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ items: [...form.items, { key: crypto.randomUUID(), name: '', detail: '' }] })}>
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
