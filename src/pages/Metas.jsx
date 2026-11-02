import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCelebrate } from '../components/Celebration'
import { ChartTip, axisProps, gridProps } from '../components/Charts'
import { useConfirm } from '../components/ConfirmDialog'
import { IconCheck, IconPlus, IconTarget, IconTrash } from '../components/Icons'
import PageHead from '../components/PageHead'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { friendlyError, num, parseNumber, pct } from '../lib/format'
import { supabase } from '../lib/supabase'
import { MONTHS_SHORT, fromISO, monthShortLabel } from '../lib/training'

const KIND = {
  consistencia: { label: 'Consistencia mensual', hint: '% de ejercicios completados en el mes', unit: '%' },
  sesiones: { label: 'Días completos al mes', hint: 'Días en que completaste toda la rutina', unit: 'días' },
  medida: { label: 'Medida personal', hint: 'Peso corporal, kilos en press banca, tiempo en 5K…', unit: '' }
}

/** Valor actual, avance (0–1) y si la meta se cumplió. */
export function evaluateGoal(goal, progress) {
  if (goal.kind === 'medida') {
    const entries = goal.entries
    const latest = entries[entries.length - 1]?.value
    if (latest == null) return { value: null, progress: 0, reached: false }
    const start = goal.start_value ?? entries[0].value
    const target = Number(goal.target)
    const reached = goal.direction === 'bajar' ? latest <= target : latest >= target
    const span = target - start
    const prog = reached ? 1 : span === 0 ? 0 : Math.max(0, Math.min(1, (latest - start) / span))
    return { value: Number(latest), progress: prog, reached }
  }
  const m = progress?.current
  if (!m || m.ratio === null) return { value: null, progress: 0, reached: false }
  const value = goal.kind === 'consistencia' ? Math.round(m.ratio * 100) : m.daysComplete
  return { value, progress: Math.min(1, value / goal.target), reached: value >= goal.target }
}

const fmtValue = (goal, v) => (v == null ? '—' : goal.kind === 'consistencia' ? `${v}%` : `${num(v)}${goal.kind === 'sesiones' ? ' días' : goal.unit ? ` ${goal.unit}` : ''}`)

export default function Metas() {
  const { goals, progress } = useTraining()
  const [creating, setCreating] = useState(false)

  if (!goals) return <div className="skeleton" style={{ height: 360 }} />
  const active = goals.filter((g) => !g.archived)

  return (
    <>
      <PageHead eyebrow="Metas" title="Ponte un" accent="objetivo" lead="Cada meta tiene su gráfico. Las de consistencia y días se calculan solas con tus checks; las medidas las registras tú.">
        <button className="btn dc-cta" onClick={() => setCreating(true)}><IconPlus size={16} /> Nueva meta</button>
      </PageHead>

      <div className="grid grid-main dc-rise" style={{ alignItems: 'start' }}>
        <div className="stack">
          {!active.length && !creating && (
            <div className="card empty">
              <div className="empty-icon"><IconTarget size={24} /></div>
              <h3 style={{ fontSize: 20 }}>Sin metas todavía</h3>
              <p className="muted" style={{ margin: '8px auto 20px', maxWidth: 400 }}>Ejemplos: "Entrenar el 90% del mes", "16 días completos al mes" o "Llegar a 75 kg".</p>
              <button className="btn dc-cta" onClick={() => setCreating(true)}><IconPlus size={16} /> Crear meta</button>
            </div>
          )}
          {active.map((g) => <GoalCard key={g.id} goal={g} progress={progress} />)}
        </div>
        {creating && <GoalForm onClose={() => setCreating(false)} />}
      </div>
    </>
  )
}

// ------------------------------------------------------------ tarjeta con gráfico
function GoalCard({ goal, progress }) {
  const { notify } = useApp()
  const { reload } = useTraining()
  const confirm = useConfirm()
  const ev = evaluateGoal(goal, progress)

  async function remove() {
    if (!(await confirm({ tone: 'danger', title: `¿Eliminar la meta "${goal.title}"?`, message: goal.kind === 'medida' ? 'También se borran sus registros.' : undefined, confirmText: 'Eliminar' }))) return
    const { error } = await supabase.from('goals').delete().eq('id', goal.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Meta eliminada')
    reload()
  }

  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="card-title">{goal.title}</h3>
          <p className="card-sub">
            {KIND[goal.kind].label} · meta {goal.kind === 'medida' && (goal.direction === 'bajar' ? 'bajar a ' : 'llegar a ')}{fmtValue(goal, Number(goal.target))}
            {goal.deadline && ` · antes del ${fromISO(goal.deadline).getDate()} ${MONTHS_SHORT[fromISO(goal.deadline).getMonth()]}`}
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {ev.reached && <span className="badge badge-ok"><IconCheck size={11} /> ¡Lo lograste!</span>}
          <button className="dc-icon-btn" onClick={remove} aria-label={`Eliminar ${goal.title}`} title="Eliminar"><IconTrash size={15} /></button>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="kpi-value" style={{ marginTop: 0 }}>{fmtValue(goal, ev.value)}</span>
        <span className="muted" style={{ fontSize: 13 }}>{goal.kind === 'medida' ? 'último registro' : 'este mes'} · {pct(ev.progress)} de la meta</span>
      </div>
      <div className="progress" style={{ marginTop: 10 }}>
        <span style={{ width: `${ev.progress * 100}%`, ...(ev.reached ? { background: 'var(--ok)' } : {}) }} />
      </div>
      {ev.reached && (
        <div className="alert alert-ok" style={{ marginTop: 14 }}><IconCheck size={18} /><div><b>¡Éxito, lo lograste!</b> {goal.kind === 'medida' ? 'Alcanzaste tu meta.' : 'Este mes ya cumpliste esta meta.'}</div></div>
      )}

      <div style={{ marginTop: 18 }}>
        {goal.kind === 'medida' ? <MeasureChart goal={goal} /> : <MonthlyChart goal={goal} progress={progress} />}
      </div>
      {goal.kind === 'medida' && <EntryForm goal={goal} reached={ev.reached} />}
    </div>
  )
}

function MonthlyChart({ goal, progress }) {
  const data = (progress?.months ?? []).slice(-6).map((m) => ({
    ...m,
    label: monthShortLabel(m),
    value: m.ratio === null ? 0 : goal.kind === 'consistencia' ? Math.round(m.ratio * 100) : m.daysComplete
  }))
  if (!data.length) return <p className="muted" style={{ fontSize: 14 }}>Crea una rutina para empezar a medir esta meta.</p>
  const target = Number(goal.target)
  const max = goal.kind === 'consistencia' ? 100 : Math.max(target, ...data.map((d) => d.value)) + 2

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis domain={[0, max]} allowDecimals={false} tickFormatter={(v) => (goal.kind === 'consistencia' ? `${v}%` : v)} {...axisProps} axisLine={false} />
          <Tooltip cursor={{ fill: 'var(--surface)' }} content={<ChartTip title={(p) => p.label + (p.inProgress ? ' (en curso)' : '')} rows={(p) => [
            { label: goal.kind === 'consistencia' ? 'Cumplimiento' : 'Días completos', value: fmtValue(goal, p.value) },
            { label: 'Meta', value: fmtValue(goal, target) },
            { label: 'Estado', value: p.value >= target ? 'Cumplida ✓' : 'Pendiente' }
          ]} />} />
          <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: 'meta', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 11 }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((d) => <Cell key={d.label} fill={d.value >= target ? 'var(--ok)' : 'var(--primary)'} fillOpacity={d.inProgress ? 0.6 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MeasureChart({ goal }) {
  if (!goal.entries.length) return <p className="muted" style={{ fontSize: 14 }}>Registra tu primera medición para ver el gráfico.</p>
  const target = Number(goal.target)
  const data = goal.entries.map((e) => {
    const d = fromISO(e.measured_on)
    return { ...e, value: Number(e.value), label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` }
  })
  const values = [...data.map((d) => d.value), target, ...(goal.start_value != null ? [Number(goal.start_value)] : [])]
  const pad = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15)

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis domain={[Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)]} {...axisProps} axisLine={false} />
          <Tooltip cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} content={<ChartTip title={(p) => p.label} rows={(p) => [
            { label: 'Valor', value: fmtValue(goal, p.value) },
            { label: 'Meta', value: fmtValue(goal, target) }
          ]} />} />
          <ReferenceLine y={target} stroke="var(--ok)" strokeDasharray="4 4" label={{ value: 'meta', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 11 }} />
          <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 6, stroke: 'var(--bg)', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function EntryForm({ goal, reached }) {
  const { notify } = useApp()
  const { reload, today } = useTraining()
  const celebrate = useCelebrate()
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)

  async function add(e) {
    e.preventDefault()
    const v = parseNumber(value)
    if (!Number.isFinite(v) || v < 0) return notify('Ingresa un número válido', 'error')
    if (!date || date > today) return notify('La fecha no puede ser futura', 'error')
    setBusy(true)
    const { error } = await supabase.from('goal_entries').upsert({ goal_id: goal.id, measured_on: date, value: v }, { onConflict: 'goal_id,measured_on' })
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    setValue('')
    notify('Registro guardado')
    const hit = goal.direction === 'bajar' ? v <= goal.target : v >= goal.target
    if (hit && !reached) celebrate({ kind: 'goal', goalTitle: goal.title })
    reload()
  }

  async function removeLast() {
    const last = goal.entries[goal.entries.length - 1]
    const { error } = await supabase.from('goal_entries').delete().eq('id', last.id)
    if (error) return notify(friendlyError(error), 'error')
    reload()
  }

  return (
    <form onSubmit={add} className="entry-form" noValidate>
      <input className="input input-sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
      <input className="input input-sm" inputMode="decimal" placeholder={`Valor${goal.unit ? ` (${goal.unit})` : ''}`} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Valor" />
      <button className="btn btn-sm dc-cta" disabled={busy}><IconPlus size={14} /> Registrar</button>
      {goal.entries.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={removeLast} title="Borrar el último registro">Deshacer último</button>}
    </form>
  )
}

// ------------------------------------------------------------ nueva meta
function GoalForm({ onClose }) {
  const { notify } = useApp()
  const { reload } = useTraining()
  const [f, setF] = useState({ title: '', kind: 'consistencia', target: '90', unit: 'kg', direction: 'bajar', start_value: '', deadline: '' })
  const [busy, setBusy] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))

  async function save(e) {
    e.preventDefault()
    const target = parseNumber(f.target)
    const start = f.start_value ? parseNumber(f.start_value) : null
    if (!f.title.trim()) return notify('Ponle un nombre a la meta', 'error')
    if (!Number.isFinite(target) || target <= 0) return notify('La meta debe ser un número mayor a 0', 'error')
    if (f.kind === 'consistencia' && target > 100) return notify('La consistencia va de 1 a 100%', 'error')
    if (f.kind === 'sesiones' && target > 31) return notify('Un mes tiene como máximo 31 días', 'error')
    if (start !== null && !Number.isFinite(start)) return notify('El valor inicial no es válido', 'error')
    setBusy(true)
    const { error } = await supabase.from('goals').insert({
      title: f.title.trim(),
      kind: f.kind,
      target,
      unit: f.kind === 'medida' ? f.unit.trim() || null : null,
      direction: f.kind === 'medida' ? f.direction : 'subir',
      start_value: f.kind === 'medida' ? start : null,
      deadline: f.deadline || null
    })
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    notify('Meta creada')
    reload()
    onClose()
  }

  return (
    <form className="card side-form" onSubmit={save} noValidate>
      <h3 className="card-title">Nueva meta</h3>
      <div className="stack" style={{ gap: 14, marginTop: 16 }}>
        <label className="field">
          <span className="label">Nombre</span>
          <input className="input" value={f.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="Ej: Llegar a 75 kg" autoFocus />
        </label>
        <label className="field">
          <span className="label">Tipo</span>
          <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value, target: e.target.value === 'consistencia' ? '90' : e.target.value === 'sesiones' ? '12' : '' })}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>{KIND[f.kind].hint}</span>
        </label>
        {f.kind === 'medida' && (
          <div className="grid grid-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="label">Quiero</span>
              <select className="input" value={f.direction} onChange={(e) => set({ direction: e.target.value })}>
                <option value="bajar">Bajar a</option>
                <option value="subir">Subir a</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Unidad</span>
              <input className="input" value={f.unit} maxLength={16} onChange={(e) => set({ unit: e.target.value })} placeholder="kg, min, reps" />
            </label>
          </div>
        )}
        <div className="grid grid-2" style={{ gap: 12 }}>
          <label className="field">
            <span className="label">Meta {KIND[f.kind].unit && `(${KIND[f.kind].unit})`}</span>
            <input className="input" inputMode="decimal" value={f.target} onChange={(e) => set({ target: e.target.value })} />
          </label>
          {f.kind === 'medida' ? (
            <label className="field">
              <span className="label">Valor inicial</span>
              <input className="input" inputMode="decimal" value={f.start_value} onChange={(e) => set({ start_value: e.target.value })} placeholder="Opcional" />
            </label>
          ) : (
            <label className="field">
              <span className="label">Fecha límite</span>
              <input className="input" type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
            </label>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn dc-cta" disabled={busy}>{busy ? 'Guardando…' : 'Crear meta'}</button>
        </div>
      </div>
    </form>
  )
}
