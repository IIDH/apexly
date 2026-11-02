import { useMemo, useState } from 'react'
import ExtraSection from '../components/ExtraSection'
import { Link } from 'react-router-dom'
import { useCelebrate, useLevel } from '../components/Celebration'
import { IconCheck, IconChevL, IconChevR, IconDumbbell, IconFlame, IconHistory, IconLock, IconPlus } from '../components/Icons'
import PageHead from '../components/PageHead'
import { useTraining } from '../context/TrainingContext'
import { pct } from '../lib/format'
import {
  MONTH_THRESHOLD, WEEK_ORDER, WEEKDAYS, addDays, canEditDate, dayStats, dayStatus, daysInMonth, doneKey,
  fromISO, longDate, monthLabel, monthStart, remainingToMeet, shiftMonth
} from '../lib/training'

const STATUS_LABEL = { complete: 'Completo', partial: 'Incompleto', missed: 'No realizado', pending: 'Pendiente', planned: 'Programado', rest: 'Descanso' }

export default function Calendario() {
  const { routines, extras, done, today, toggle, progress, error } = useTraining()
  const [view, setView] = useState(() => ({ year: +today.slice(0, 4), month: +today.slice(5, 7) }))
  const [selected, setSelected] = useState(today)

  // En celular el panel del día queda arriba del calendario: llevarlo a la vista
  function selectDay(iso) {
    setSelected(iso)
    if (window.innerWidth <= 1000) document.getElementById('day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!routines) return <Loading />

  return (
    <>
      <PageHead eyebrow="Calendario" title="Tu camino a la" accent="cima" lead="Marca lo que entrenas cada día. Toca un día anterior para ver tu historial." />
      {error && <div className="alert alert-danger" style={{ marginBottom: 18 }}>{error}</div>}
      <div className="grid grid-main dc-rise" style={{ alignItems: 'start' }}>
        <div className="stack">
          <StreakCard progress={progress} routines={routines} />
          <MonthCalendar view={view} setView={setView} selected={selected} setSelected={selectDay} routines={routines} extras={extras} done={done} today={today} />
        </div>
        <DayPanel iso={selected} routines={routines} extras={extras} done={done} today={today} toggle={toggle} onToday={() => { setSelected(today); setView({ year: +today.slice(0, 4), month: +today.slice(5, 7) }) }} />
      </div>
    </>
  )
}

function Loading() {
  return (
    <div className="grid grid-main">
      <div className="skeleton" style={{ height: 420 }} />
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  )
}

// ------------------------------------------------------------ racha y nivel
function StreakCard({ progress, routines }) {
  const { level, title } = useLevel()
  const current = progress?.current
  const remaining = current && current.ratio !== null ? remainingToMeet(current, routines) : null
  const ratio = current?.ratio ?? 0

  return (
    <div className="card streak-card">
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div className={`streak-flame ${level > 0 ? 'on' : ''}`}><IconFlame size={24} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dc-mono muted">Racha · nivel {level}</div>
          <div className="streak-value">
            {level > 0 ? `${level} ${level === 1 ? 'mes' : 'meses'} seguidos` : 'Aún sin racha'}
            <span className="badge badge-level">{title}</span>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Cada mes en que completes al menos el {pct(MONTH_THRESHOLD)} de lo programado suma un nivel.
          </p>
        </div>
      </div>
      {current && current.ratio !== null && (
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <span className="muted">Este mes</span>
            <b className="num">{pct(ratio)} <span className="muted" style={{ fontWeight: 500 }}>· meta {pct(MONTH_THRESHOLD)}</span></b>
          </div>
          <div className="progress progress-goal" style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, ratio * 100)}%` }} className={ratio >= MONTH_THRESHOLD ? 'ok' : ''} />
            <i style={{ left: `${MONTH_THRESHOLD * 100}%` }} aria-hidden="true" />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {remaining?.needed
              ? `Te faltan ${remaining.needed} ejercicio${remaining.needed === 1 ? '' : 's'} este mes para que cuente en tu racha.`
              : 'Ya aseguraste este mes para tu racha. ¡Sigue sumando!'}
          </p>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------ calendario mensual
function MonthCalendar({ view, setView, selected, setSelected, routines, extras, done, today }) {
  const cells = useMemo(() => {
    const first = monthStart(view.year, view.month)
    const lead = WEEK_ORDER.indexOf(fromISO(first).getDay())
    const out = Array.from({ length: lead }, () => null)
    const extraDays = new Map()
    for (const e of extras ?? []) extraDays.set(e.done_on, (extraDays.get(e.done_on) ?? 0) + 1)
    for (let d = 0; d < daysInMonth(view.year, view.month); d++) {
      const iso = addDays(first, d)
      const stats = dayStats(routines, done, iso)
      out.push({ iso, day: d + 1, stats, status: dayStatus(stats, iso, today), extras: extraDays.get(iso) ?? 0 })
    }
    return out
  }, [view, routines, extras, done, today])

  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 14 }}>
        <h3 className="card-title cal-title">{monthLabel(view)}</h3>
        <div className="month-picker">
          <button onClick={() => setView((v) => shiftMonth(v, -1))} aria-label="Mes anterior"><IconChevL size={18} /></button>
          <button onClick={() => setView((v) => shiftMonth(v, 1))} aria-label="Mes siguiente"><IconChevR size={18} /></button>
        </div>
      </div>
      <div className="cal-grid cal-head" aria-hidden="true">
        {WEEK_ORDER.map((d) => <span key={d}>{WEEKDAYS[d]}</span>)}
      </div>
      <div className="cal-grid" role="grid" aria-label={`Calendario de ${monthLabel(view)}`}>
        {cells.map((c, i) =>
          c ? (
            <button
              key={c.iso}
              className={`cal-day st-${c.status} ${c.iso === today ? 'is-today' : ''} ${c.iso === selected ? 'is-selected' : ''}`}
              onClick={() => setSelected(c.iso)}
              aria-label={`${longDate(c.iso)}: ${STATUS_LABEL[c.status]}${c.stats.total ? `, ${c.stats.done} de ${c.stats.total}` : ''}${c.extras ? `, ${c.extras} actividad${c.extras === 1 ? '' : 'es'} extra` : ''}`}
              aria-pressed={c.iso === selected}
            >
              {c.extras > 0 && <span className="cal-extra" aria-hidden="true" />}
              <span className="cal-num">{c.day}</span>
              <span className="cal-dots">
                {c.stats.plan.slice(0, 3).map(({ routine }) => <i key={routine.id} style={{ background: routine.color }} />)}
              </span>
            </button>
          ) : <span key={`e${i}`} />
        )}
      </div>
      <div className="legend" style={{ marginTop: 16 }}>
        <span className="legend-item"><span className="cal-key st-complete" />Completo</span>
        <span className="legend-item"><span className="cal-key st-partial" />Incompleto</span>
        <span className="legend-item"><span className="cal-key st-missed" />No realizado</span>
        <span className="legend-item"><span className="cal-key is-today" />Hoy</span>
        <span className="legend-item"><span className="cal-key key-extra" />Actividad extra</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ panel del día
function DayPanel({ iso, routines, extras, done, today, toggle, onToday }) {
  const celebrate = useCelebrate()
  const stats = dayStats(routines, done, iso)
  const editable = canEditDate(iso, today)
  const isPast = iso < today
  const isFuture = iso > today
  const tag = iso === today ? 'Hoy' : isFuture ? 'Programado' : 'Historial'

  async function onToggle(itemId) {
    const wasDone = done.has(doneKey(itemId, iso))
    const ok = await toggle(itemId, iso)
    if (ok && !wasDone && stats.done + 1 === stats.total) {
      celebrate({ kind: 'day', routineNames: stats.plan.map((p) => p.routine.name) })
    }
  }

  return (
    <div id="day-panel" className="card side-form">
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <span className={`badge ${iso === today ? 'badge-level' : ''}`}>{isPast && <IconHistory size={11} />}{tag}</span>
          <h3 className="card-title" style={{ marginTop: 8 }}>{longDate(iso)}</h3>
          {stats.total > 0 && <p className="card-sub">{stats.done} de {stats.total} ejercicios · {pct(stats.done / stats.total)}</p>}
        </div>
        {iso !== today && <button className="btn btn-ghost btn-sm" onClick={onToday}>Ir a hoy</button>}
      </div>

      {stats.total > 0 && (
        <div className="progress" style={{ marginBottom: 16 }}>
          <span className={stats.done === stats.total ? 'ok' : ''} style={{ width: `${(stats.done / stats.total) * 100}%`, ...(stats.done === stats.total ? { background: 'var(--ok)' } : {}) }} />
        </div>
      )}

      {!routines.length ? (
        <div className="empty" style={{ padding: '28px 8px' }}>
          <div className="empty-icon"><IconDumbbell size={24} /></div>
          <h3 style={{ fontSize: 18 }}>Crea tu primera rutina</h3>
          <p className="muted" style={{ fontSize: 14, margin: '8px 0 18px' }}>Asígnale los días de la semana y aparecerá aquí cada vez que toque.</p>
          <Link to="/rutinas?nueva=1" className="btn dc-cta"><IconPlus size={16} /> Nueva rutina</Link>
        </div>
      ) : !stats.plan.length ? (
        <div className="empty" style={{ padding: '28px 8px' }}>
          <div className="empty-icon"><IconCheck size={24} /></div>
          <h3 style={{ fontSize: 18 }}>Día de descanso</h3>
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>No hay rutinas programadas para este día. ¿Hiciste algo de deporte igual? Anótalo abajo como extra.</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {!editable && (
            <div className="alert alert-info" style={{ fontSize: 13 }}>
              <IconLock size={16} />
              <div>{isFuture ? 'Aún no llega este día: así se verá tu checklist.' : 'Historial de solo lectura. Puedes marcar ejercicios de hoy y de los últimos 3 días.'}</div>
            </div>
          )}
          {stats.plan.map(({ routine, items }) => {
            const rDone = items.filter((i) => done.has(doneKey(i.id, iso))).length
            return (
              <div key={routine.id}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className="swatch" style={{ background: routine.color }} />
                    <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{routine.name}</b>
                  </div>
                  <span className={`badge ${rDone === items.length ? 'badge-ok' : ''}`}>{rDone}/{items.length}</span>
                </div>
                <div className="checklist">
                  {items.map((item) => {
                    const checked = done.has(doneKey(item.id, iso))
                    return (
                      <label key={item.id} className={`check-row ${checked ? 'checked' : ''} ${!editable ? 'readonly' : ''} ${isPast && !editable && !checked ? 'missed' : ''}`}>
                        <input type="checkbox" checked={checked} disabled={!editable} onChange={() => onToggle(item.id)} />
                        <span className="check-box" aria-hidden="true">{checked && <IconCheck size={14} />}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="check-name">{item.name}</span>
                          {item.detail && <span className="check-detail">{item.detail}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {stats.done === stats.total && (
            <div className="alert alert-ok"><IconCheck size={18} /><div><b>¡Éxito, lo lograste!</b> Completaste todo lo de este día.</div></div>
          )}
        </div>
      )}
      <ExtraSection iso={iso} today={today} extras={extras ?? []} />
    </div>
  )
}
