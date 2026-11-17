import { useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLevel } from '../components/Celebration'
import { ChartTip, Kpi, axisProps, gridProps } from '../components/Charts'
import { IconBolt, IconCalendar, IconChart, IconFlame, IconTrophy } from '../components/Icons'
import PageHead from '../components/PageHead'
import { useTraining } from '../context/TrainingContext'
import { pct } from '../lib/format'
import {
  EXTRA_BONUS_MAX, MONTH_THRESHOLD, PEAK_LEVELS, extraBonus, addDays, dayStats, doneKey, fromISO, levelTitle, monthShortLabel, monthStart, planFor, shiftMonth
} from '../lib/training'

const MILESTONES = [1, 2, 3, 4, 6, 9, 12]

export default function Progreso() {
  const { routines, extras, done, today, progress } = useTraining()
  const { level, title, best, weekly: w, expedition, stars, summits } = useLevel()

  const months = useMemo(() => (progress?.months ?? []).slice(-12).map((m) => ({
    ...m,
    label: monthShortLabel(m),
    value: m.ratio === null ? 0 : Math.round(m.ratio * 100)
  })), [progress])

  // Cumplimiento de las últimas 12 semanas (lunes a domingo)
  const weeks = useMemo(() => {
    if (!routines) return []
    const offset = (fromISO(today).getDay() + 6) % 7
    const thisMonday = addDays(today, -offset)
    const out = []
    for (let w = 11; w >= 0; w--) {
      const start = addDays(thisMonday, -7 * w)
      let total = 0
      let ok = 0
      for (let d = 0; d < 7; d++) {
        const iso = addDays(start, d)
        if (iso > today) break
        const s = dayStats(routines, done, iso)
        total += s.total
        ok += s.done
      }
      const dt = fromISO(start)
      out.push({ start, label: `${dt.getDate()}/${dt.getMonth() + 1}`, total, done: ok, value: total ? Math.round((ok / total) * 100) : null })
    }
    return out
  }, [routines, done, today])

  // Cumplimiento por rutina en el mes actual
  const byRoutine = useMemo(() => {
    if (!routines) return []
    const map = new Map()
    for (let iso = monthStart(+today.slice(0, 4), +today.slice(5, 7)); iso <= today; iso = addDays(iso, 1)) {
      for (const { routine, items } of planFor(routines, iso)) {
        const row = map.get(routine.id) ?? { name: routine.name, color: routine.color, total: 0, done: 0 }
        row.total += items.length
        row.done += items.filter((i) => done.has(doneKey(i.id, iso))).length
        map.set(routine.id, row)
      }
    }
    return [...map.values()].map((r) => ({ ...r, value: Math.round((r.done / r.total) * 100) })).sort((a, b) => b.value - a.value)
  }, [routines, done, today])

  if (!routines) return <div className="skeleton" style={{ height: 420 }} />

  const current = progress?.current
  const totalDone = done.size
  const next = MILESTONES.find((m) => m > level)

  return (
    <>
      <PageHead eyebrow="Progreso" title="Cuánto has" accent="subido" lead={`Tu racha suma cada semana en que cumples todos tus días de rutina. Tu nivel sube cada mes en que completas al menos el ${pct(MONTH_THRESHOLD)} de lo programado.`} />

      <div className="grid grid-4 dc-rise">
        <Kpi icon={IconFlame} label="Racha actual" value={!w.lit ? '—' : w.weeks ? `${w.weeks} ${w.weeks === 1 ? 'semana' : 'semanas'}` : 'Semana 1'} sub={w.lit ? `${w.days} ${w.days === 1 ? 'día entrenado' : 'días entrenados'}${w.rescued ? ` · ${w.rescued} salvado${w.rescued === 1 ? '' : 's'}` : ''}` : 'Entrena un día para encenderla'} tone={w.lit ? 'ok' : undefined} />
        <Kpi icon={IconTrophy} label={`Nivel ${level}`} value={title} sub={next ? `Próximo hito: nivel ${next} (${levelTitle(next)})` : 'Llegaste a la cima'} tone={level ? 'ok' : undefined} />
        <Kpi icon={IconCalendar} label="Este mes" value={current?.ratio != null ? pct(current.ratio) : '—'} sub={current ? `${current.daysComplete} de ${current.daysScheduled} días completos${current.bonus ? ` · +${pct(current.bonus)} extra` : ''}` : 'Sin rutinas programadas'} />
        <Kpi icon={IconChart} label="Mejor racha" value={`${w.best} ${w.best === 1 ? 'semana' : 'semanas'}`} sub={`Mejor nivel: ${best} · ${totalDone} ejercicios en total`} />
      </div>

      <div className="card dc-rise days-card" style={{ marginTop: 18 }}>
        <h3 className="card-title">Días entrenados</h3>
        <p className="card-sub">Cada día en que hiciste al menos un ejercicio de tu rutina.</p>
        <div className="days-grid">
          <div><b className="num">{w.days}</b><span>en tu racha actual</span></div>
          <div><b className="num">{w.totals.month}</b><span>este mes</span></div>
          <div><b className="num">{w.totals.year}</b><span>en {today.slice(0, 4)}</span></div>
          <div><b className="num">{w.totals.all}</b><span>en total</span></div>
        </div>
      </div>

      <div className="card dc-rise" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Escalera de niveles</h3>
            <p className="card-sub">Cada mes en que llegas al {pct(MONTH_THRESHOLD)} sube un nivel (las actividades extra suman hasta +{pct(EXTRA_BONUS_MAX)}). Si un mes no llegas, el nivel vuelve a cero.</p>
          </div>
        </div>
        <div className="ladder">
          {MILESTONES.map((m) => (
            <div key={m} className={`ladder-step ${level >= m ? 'on' : ''} ${next === m ? 'next' : ''}`}>
              <span className="ladder-tri" aria-hidden="true" />
              <b>Nivel {m}</b>
              <span className="muted">{levelTitle(m)}</span>
              <span className="dc-mono muted" style={{ fontSize: 10 }}>{m} {m === 1 ? 'mes' : 'meses'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card dc-rise gallery-card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Galería de cumbres</h3>
            <p className="card-sub">Expedición {expedition}{stars ? ` · ${'★'.repeat(Math.min(stars, 5))} de prestigio` : ''}. Cada cumbre se conquista al cerrar un mes que sube tu nivel.</p>
          </div>
        </div>
        <div className="gallery-peaks">
          {PEAK_LEVELS.map((l) => (
            <div key={l} className={`gallery-peak ${level >= l ? 'on' : ''} ${l === 12 ? 'apex' : ''}`} title={level >= l ? 'Conquistada' : `Nivel ${l}`}>
              <svg viewBox="0 0 40 30" aria-hidden="true"><path d="M2,28 L14,12 L19,17 L26,6 L38,28 Z" /><path className="flag" d="M26,6 L26,0 L32,2 L26,4" /></svg>
              <b>{levelTitle(l)}</b>
              <span className="dc-mono">{l} {l === 1 ? 'mes' : 'meses'}</span>
            </div>
          ))}
        </div>
        {summits.length > 0 && (
          <div className="gallery-trophies">
            {summits.map((x) => (
              <span key={x.expedition} className="badge badge-level">🏔️ Expedición {x.expedition} · Apex · {new Date(`${x.on}T12:00:00`).toLocaleDateString('es', { month: 'short', year: 'numeric' })}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-2 dc-rise" style={{ marginTop: 18 }}>
        <div className="card">
          <h3 className="card-title">Cumplimiento por mes</h3>
          <p className="card-sub" style={{ marginBottom: 14 }}>Verde: el mes cuenta para la racha. La línea marca el {pct(MONTH_THRESHOLD)}.</p>
          {months.length ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 80, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface)' }} content={<ChartTip title={(p) => p.label + (p.inProgress ? ' (en curso)' : '')} rows={(p) => [
                    { label: 'Cumplimiento', value: p.ratio === null ? 'Sin rutinas' : `${p.value}%${p.bonus ? ` (incl. +${Math.round(p.bonus * 100)}% extra)` : ''}` },
                    { label: 'Ejercicios', value: `${p.done} / ${p.scheduled}` },
                    { label: 'Días completos', value: `${p.daysComplete} / ${p.daysScheduled}` },
                    { label: 'Nivel', value: p.inProgress ? 'En curso' : p.met ? 'Sube ✓' : p.ratio === null ? '—' : 'No sube' }
                  ]} />} />
                  <ReferenceLine y={MONTH_THRESHOLD * 100} stroke="var(--muted)" strokeDasharray="4 4" />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {months.map((m) => <Cell key={m.label} fill={m.met ? 'var(--ok)' : 'var(--primary)'} fillOpacity={m.inProgress ? 0.55 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </div>

        <div className="card">
          <h3 className="card-title">Últimas 12 semanas</h3>
          <p className="card-sub" style={{ marginBottom: 14 }}>Porcentaje de ejercicios completados cada semana.</p>
          {weeks.some((w) => w.total) ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <AreaChart data={weeks} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} axisLine={false} />
                  <Tooltip cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} content={<ChartTip title={(p) => `Semana del ${p.label}`} rows={(p) => [
                    { label: 'Cumplimiento', value: p.value === null ? 'Sin rutinas' : `${p.value}%` },
                    { label: 'Ejercicios', value: `${p.done} / ${p.total}` }
                  ]} />} />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#wk)" connectNulls dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 6, stroke: 'var(--bg)', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </div>
      </div>

      <div className="card dc-rise" style={{ marginTop: 18 }}>
        <h3 className="card-title">Rutinas este mes</h3>
        <p className="card-sub" style={{ marginBottom: 14 }}>Qué tanto has cumplido cada rutina en lo que va del mes.</p>
        {byRoutine.length ? (
          <div className="list">
            {byRoutine.map((r) => (
              <div key={r.name} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 160px) minmax(0, 1fr) auto' }}>
                <div className="row" style={{ gap: 8, minWidth: 0 }}><span className="swatch" style={{ background: r.color }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span></div>
                <div className="progress"><span style={{ width: `${r.value}%`, background: r.color }} /></div>
                <span className="num" style={{ fontSize: 13 }}><b>{r.value}%</b> <span className="muted">{r.done}/{r.total}</span></span>
              </div>
            ))}
          </div>
        ) : <Empty />}
      </div>

      <ExtrasCard extras={extras ?? []} today={today} />
    </>
  )
}

// ------------------------------------------------------------ actividades extra (aparte de la racha)
function ExtrasCard({ extras, today }) {
  const ym = today.slice(0, 7)
  const thisMonth = extras.filter((e) => e.done_on.startsWith(ym))
  const minutes = thisMonth.reduce((sum, e) => sum + (e.duration_min ?? 0), 0)
  const now = { year: +today.slice(0, 4), month: +today.slice(5, 7) }
  const months = Array.from({ length: 6 }, (_, i) => {
    const p = shiftMonth(now, i - 5)
    const key = `${p.year}-${String(p.month).padStart(2, '0')}`
    const list = extras.filter((e) => e.done_on.startsWith(key))
    return { label: monthShortLabel(p), value: list.length, minutes: list.reduce((s, e) => s + (e.duration_min ?? 0), 0) }
  })
  const top = Object.entries(extras.reduce((acc, e) => ({ ...acc, [e.name]: (acc[e.name] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="card dc-rise extras-card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <div>
          <h3 className="card-title row" style={{ gap: 8 }}><span className="extra-icon"><IconBolt size={14} /></span>Actividades extra</h3>
          <p className="card-sub">Deporte fuera de tus rutinas (fútbol, pádel, bici…). Cada una suma +5 % a tu mes (hasta +10 %) y salva tu racha si ese día no alcanzaste la rutina.</p>
        </div>
      </div>
      {!extras.length ? (
        <p className="muted" style={{ fontSize: 14 }}>Aún no anotas actividades extra. Hazlo desde el calendario, en el panel de cada día.</p>
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
              <div><div className="dc-mono muted">Este mes</div><div className="kpi-value" style={{ marginTop: 6 }}>{thisMonth.length}</div></div>
              <div><div className="dc-mono muted">Minutos</div><div className="kpi-value" style={{ marginTop: 6 }}>{minutes}</div></div>
              <div><div className="dc-mono muted">Total</div><div className="kpi-value" style={{ marginTop: 6 }}>{extras.length}</div></div>
            </div>
            <div>
              <div className="dc-mono muted" style={{ marginBottom: 8 }}>Bonus de este mes</div>
              {(() => {
                const b = extraBonus(extras, +today.slice(0, 4), +today.slice(5, 7), today)
                return (
                  <>
                    <div className="progress" style={{ height: 8 }}><span style={{ width: `${(b.bonus / EXTRA_BONUS_MAX) * 100}%`, background: 'var(--extra)' }} /></div>
                    <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{b.bonus >= EXTRA_BONUS_MAX ? `+${pct(b.bonus)} · bonus máximo del mes. Los extras igual salvan tu racha.` : `+${pct(b.bonus)} de +${pct(EXTRA_BONUS_MAX)} posible este mes.`}</p>
                  </>
                )
              })()}
            </div>
            {top.length > 0 && (
              <div>
                <div className="dc-mono muted" style={{ marginBottom: 6 }}>Lo que más haces</div>
                <div className="legend">
                  {top.map(([name, n]) => <span key={name} className="legend-item">{name} <b>{n}</b></span>)}
                </div>
              </div>
            )}
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={months} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface)' }} content={<ChartTip title={(p) => p.label} rows={(p) => [
                  { label: 'Actividades', value: p.value },
                  { label: 'Minutos', value: p.minutes }
                ]} />} />
                <Bar dataKey="value" fill="var(--extra)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty() {
  return <p className="muted" style={{ fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Aún no hay datos. Crea una rutina y marca tus ejercicios.</p>
}
