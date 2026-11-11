import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { PAUSE_REASONS, addDays, longDate, pauseCovers } from '../lib/training'
import { useConfirm } from './ConfirmDialog'
import { IconEdit, IconInfo, IconX } from './Icons'

const shortDate = (iso) => longDate(iso).replace(/^\S+ /, '')

/** Qué cubre una pausa, en palabras. */
export function pauseScopeText(p, routines) {
  if (p.scope === 'total') return 'Todo el entrenamiento'
  const names = []
  for (const r of routines) {
    if (p.routine_ids?.includes(r.id)) names.push(r.name)
    else for (const i of r.items) if (p.item_ids?.includes(i.id)) names.push(i.name)
  }
  return names.length ? names.join(', ') : 'Ejercicios elegidos'
}

/**
 * Pausas por lesión, enfermedad o vacaciones. Los días en pausa no cuentan
 * como programados: no bajan el cumplimiento ni cortan la racha.
 */
export default function PauseCard() {
  const { pauses, routines, today, reload } = useTraining()
  const { notify } = useApp()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(null)

  const active = pauses.filter((p) => pauseCovers(p, today))
  const upcoming = pauses.filter((p) => p.start_on > today)
  // Semana de retorno: una lesión que terminó en los últimos 7 días
  const back = pauses.find((p) => p.reason === 'lesion' && p.end_on && p.end_on < today && p.end_on >= addDays(today, -7))

  async function endPause(p) {
    if (!(await confirm({ title: '¿Volviste a entrenar?', message: 'Desde hoy tu rutina vuelve a contar normal. Los días en pausa quedan en tu historial sin afectar tu racha.', confirmText: 'Sí, dar de alta' }))) return
    const { error } = p.start_on >= today
      ? await supabase.from('pauses').delete().eq('id', p.id)
      : await supabase.from('pauses').update({ end_on: addDays(today, -1) }).eq('id', p.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('¡Bienvenido de vuelta! Tu rutina vuelve a contar desde hoy')
    reload()
  }

  return (
    <>
      {active.map((p) => (
        <div key={p.id} className="card pause-card">
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span className="pause-emoji" aria-hidden="true">{PAUSE_REASONS[p.reason]?.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dc-mono muted">En pausa · {PAUSE_REASONS[p.reason]?.label}</div>
              <b style={{ display: 'block', marginTop: 2 }}>{pauseScopeText(p, routines)}</b>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Desde el {shortDate(p.start_on)}{p.end_on ? ` hasta el ${shortDate(p.end_on)}` : ' · sin fecha de alta'}. Estos días no cuentan para tu racha.
                {p.note ? ` · ${p.note}` : ''}
              </p>
            </div>
            <button className="dc-icon-btn" onClick={() => setEditing(p)} aria-label="Editar pausa" title="Editar"><IconEdit size={15} /></button>
          </div>
          <button className="btn btn-sm dc-cta" style={{ marginTop: 12 }} onClick={() => endPause(p)}>Volví a entrenar</button>
        </div>
      ))}

      {back && !active.length && (
        <div className="alert alert-info">
          <IconInfo size={18} />
          <div><b>Semana de retorno.</b> Volviste de una lesión el {shortDate(addDays(back.end_on, 1))}: parte con menos peso o menos series y sube de a poco. Si algo duele, para.</div>
        </div>
      )}

      {upcoming.map((p) => (
        <div key={p.id} className="alert alert-warn">
          <IconInfo size={18} />
          <div style={{ flex: 1 }}>Pausa programada ({PAUSE_REASONS[p.reason]?.label.toLowerCase()}) desde el {shortDate(p.start_on)}.</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Editar</button>
        </div>
      ))}

      {!active.length && (
        <button className="btn btn-ghost btn-sm pause-open" onClick={() => setEditing({})}>
          🩹 ¿Lesión, enfermedad o vacaciones? Pausa tu entrenamiento
        </button>
      )}

      {editing && <PauseDialog pause={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </>
  )
}

function PauseDialog({ pause, onClose, onSaved }) {
  const { routines, today } = useTraining()
  const { notify } = useApp()
  const confirm = useConfirm()
  const isNew = !pause.id
  const [reason, setReason] = useState(pause.reason ?? 'lesion')
  const [scope, setScope] = useState(pause.scope ?? 'total')
  const [routineIds, setRoutineIds] = useState(pause.routine_ids ?? [])
  const [itemIds, setItemIds] = useState(pause.item_ids ?? [])
  const [start, setStart] = useState(pause.start_on ?? today)
  const [hasEnd, setHasEnd] = useState(!!pause.end_on)
  const [end, setEnd] = useState(pause.end_on ?? addDays(today, 6))
  const [note, setNote] = useState(pause.note ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const active = useMemo(
    () => routines.filter((r) => !r.archived_on || r.archived_on > today).map((r) => ({ ...r, items: r.items.filter((i) => !i.archived_on || i.archived_on > today).sort((a, b) => a.position - b.position) })),
    [routines, today]
  )
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  async function save() {
    if (scope === 'parcial' && !routineIds.length && !itemIds.length) return notify('Elige qué rutinas o ejercicios no puedes hacer', 'error')
    if (hasEnd && end < start) return notify('La fecha de alta no puede ser antes del inicio', 'error')
    setBusy(true)
    const row = {
      reason,
      scope,
      routine_ids: scope === 'parcial' ? routineIds : [],
      // Si la rutina entera está en pausa, sus ejercicios sueltos sobran
      item_ids: scope === 'parcial' ? itemIds.filter((id) => !active.some((r) => routineIds.includes(r.id) && r.items.some((i) => i.id === id))) : [],
      start_on: start,
      end_on: hasEnd ? end : null,
      note: note.trim() || null
    }
    const { error } = isNew ? await supabase.from('pauses').insert(row) : await supabase.from('pauses').update(row).eq('id', pause.id)
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    notify(isNew ? 'Pausa creada: esos días no cuentan para tu racha' : 'Pausa actualizada')
    onSaved()
  }

  async function remove() {
    if (!(await confirm({ tone: 'danger', title: '¿Eliminar esta pausa?', message: 'Esos días vuelven a contar como programados: puede bajar tu cumplimiento y tu racha.', confirmText: 'Eliminar pausa' }))) return
    const { error } = await supabase.from('pauses').delete().eq('id', pause.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Pausa eliminada')
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card dc-rise pause-dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 id="pause-title" className="card-title">{isNew ? 'Pausar entrenamiento' : 'Editar pausa'}</h3>
          <button className="dc-icon-btn" onClick={onClose} aria-label="Cerrar"><IconX size={16} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Los días en pausa no bajan tu cumplimiento ni cortan tu racha.</p>

        <div className="stack" style={{ gap: 16, marginTop: 16 }}>
          <div className="field">
            <span className="label">Motivo</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(PAUSE_REASONS).map(([k, v]) => (
                <button type="button" key={k} className={`chip ${reason === k ? 'on' : ''}`} onClick={() => setReason(k)}>{v.emoji} {v.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">¿Puedes entrenar algo?</span>
            <div className="choice-grid">
              <button type="button" className={`choice ${scope === 'total' ? 'on' : ''}`} onClick={() => setScope('total')}>
                <span className="choice-dot" /><span><b>No, nada</b><small>Pausa todo el entrenamiento.</small></span>
              </button>
              <button type="button" className={`choice ${scope === 'parcial' ? 'on' : ''}`} onClick={() => setScope('parcial')}>
                <span className="choice-dot" /><span><b>Sí, pero no todo</b><small>Eliges lo que no puedes hacer; el resto sigue normal.</small></span>
              </button>
            </div>
          </div>

          {scope === 'parcial' && (
            <div className="field">
              <span className="label">¿Qué no puedes hacer?</span>
              {!active.length && <p className="muted" style={{ fontSize: 13 }}>No tienes rutinas activas.</p>}
              <div className="pause-pick">
                {active.map((r) => {
                  const whole = routineIds.includes(r.id)
                  return (
                    <div key={r.id} className="pause-routine">
                      <label className="pause-check">
                        <input type="checkbox" checked={whole} onChange={() => toggle(routineIds, setRoutineIds, r.id)} />
                        <span className="swatch" style={{ background: r.color }} />
                        <b>{r.name}</b><span className="muted" style={{ fontSize: 12 }}>toda la rutina</span>
                      </label>
                      {!whole && (
                        <div className="pause-items">
                          {r.items.map((i) => (
                            <label key={i.id} className="pause-check">
                              <input type="checkbox" checked={itemIds.includes(i.id)} onChange={() => toggle(itemIds, setItemIds, i.id)} />
                              <span>{i.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>¿Te mandaron ejercicios de rehabilitación? Créalos como una rutina nueva y archívala cuando te den de alta.</span>
            </div>
          )}

          <div className="pause-dates">
            <label className="field">
              <span className="label">Desde</span>
              <input type="date" className="input input-sm" value={start} min={addDays(today, -30)} onChange={(e) => setStart(e.target.value)} />
            </label>
            <div className="field">
              <span className="label">Hasta</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`chip ${!hasEnd ? 'on' : ''}`} onClick={() => setHasEnd(false)}>Aún no sé</button>
                <button type="button" className={`chip ${hasEnd ? 'on' : ''}`} onClick={() => setHasEnd(true)}>Tengo fecha</button>
              </div>
              {hasEnd && <input type="date" className="input input-sm" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-label="Último día de pausa" />}
            </div>
          </div>
          {!hasEnd && <span className="muted" style={{ fontSize: 12, marginTop: -8 }}>Cuando vuelvas, toca “Volví a entrenar”.</span>}

          <label className="field">
            <span className="label">Nota (opcional)</span>
            <input className="input input-sm" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: esguince tobillo derecho" />
          </label>

          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {!isNew ? <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={remove}>Eliminar pausa</button> : <span />}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn dc-cta" disabled={busy} onClick={save}>{busy ? 'Guardando…' : isNew ? 'Pausar' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
