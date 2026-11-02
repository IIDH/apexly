import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { EXTRA_PRESETS, extraMilestoneAt, extrasOn } from '../lib/training'
import { useCelebrate } from './Celebration'
import { useConfirm } from './ConfirmDialog'
import { IconBolt, IconPlus, IconTrash } from './Icons'

/**
 * Actividades extra del día (fútbol, pádel…). Van aparte de las rutinas:
 * no suman ni restan al cumplimiento ni a la racha.
 */
export default function ExtraSection({ iso, today, extras }) {
  const { notify } = useApp()
  const { reload } = useTraining()
  const celebrate = useCelebrate()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const list = extrasOn(extras, iso)
  const canAdd = iso <= today

  function reset() {
    setOpen(false)
    setName('')
    setMinutes('')
    setNote('')
  }

  async function save(e) {
    e.preventDefault()
    const n = name.trim()
    const m = minutes.trim() ? Number.parseInt(minutes, 10) : null
    if (!n) return notify('¿Qué deporte hiciste?', 'error')
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 1440)) return notify('La duración va de 1 a 1440 minutos', 'error')
    setBusy(true)
    const { error } = await supabase.from('extra_activities').insert({ done_on: iso, name: n, duration_min: m, note: note.trim() || null })
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    celebrate({ kind: 'extra', activity: n, milestone: extraMilestoneAt(extras.length + 1) })
    reset()
    reload()
  }

  async function remove(x) {
    if (!(await confirm({ tone: 'warn', title: `¿Borrar "${x.name}"?`, message: 'Se quita de tus actividades extra. Tu racha no cambia.', confirmText: 'Borrar' }))) return
    const { error } = await supabase.from('extra_activities').delete().eq('id', x.id)
    if (error) return notify(friendlyError(error), 'error')
    reload()
  }

  if (!canAdd && !list.length) return null

  return (
    <div className="extra-section">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="extra-icon"><IconBolt size={14} /></span>
          <b>Extras</b>
          <span className="muted" style={{ fontSize: 12 }}>no afectan tu racha</span>
        </div>
        {canAdd && !open && <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><IconPlus size={14} /> Anotar</button>}
      </div>

      {list.length > 0 && (
        <div className="checklist">
          {list.map((x) => (
            <div key={x.id} className="extra-row">
              <span className="extra-icon"><IconBolt size={14} /></span>
              <span style={{ minWidth: 0 }}>
                <span className="check-name">{x.name}{x.duration_min ? <span className="muted" style={{ fontWeight: 500 }}> · {x.duration_min} min</span> : null}</span>
                {x.note && <span className="check-detail">{x.note}</span>}
              </span>
              <button className="icon-mini danger" onClick={() => remove(x)} aria-label={`Borrar ${x.name}`}><IconTrash size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {!list.length && !open && <p className="muted" style={{ fontSize: 13 }}>¿Jugaste fútbol, saliste en bici o hiciste otro deporte? Anótalo como extra.</p>}

      {open && (
        <form onSubmit={save} className="stack extra-form" style={{ gap: 12 }} noValidate>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {EXTRA_PRESETS.map((p) => (
              <button type="button" key={p} className={`chip ${name === p ? 'on' : ''}`} onClick={() => setName(p)}>{p}</button>
            ))}
          </div>
          <div className="extra-form-grid">
            <label className="field">
              <span className="label">Actividad</span>
              <input className="input input-sm" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Ej: Fútbol" />
            </label>
            <label className="field">
              <span className="label">Minutos</span>
              <input className="input input-sm" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="Opcional" />
            </label>
          </div>
          <label className="field">
            <span className="label">Nota</span>
            <input className="input input-sm" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Opcional (ej: partido con amigos, 2 goles)" />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Cancelar</button>
            <button className="btn btn-sm dc-cta" disabled={busy}>{busy ? 'Guardando…' : 'Guardar extra'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
