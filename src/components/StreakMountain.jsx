import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLevel } from './Celebration'
import { IconLogo, IconTrophy } from './Icons'
import { pct } from '../lib/format'
import { MONTH_THRESHOLD, STREAK_MILESTONES, remainingToMeet } from '../lib/training'

// Silueta de la cordillera (viewBox 720×300)
const PEAK = 'M0,300 L0,236 L38,228 L70,232 L104,214 L138,218 L170,200 L206,203 L238,184 L262,188 L290,166 L318,160 L342,138 L362,142 L384,116 L404,104 L420,84 L436,78 L450,56 L462,44 L470,30 L478,40 L490,52 L500,66 L516,74 L532,96 L552,106 L570,128 L596,142 L620,164 L652,176 L684,192 L720,198 L720,300 Z'
const BACK = 'M0,300 L0,196 L60,178 L110,186 L170,150 L220,168 L270,132 L320,150 L360,124 L410,140 L460,110 L520,96 L560,118 L610,92 L660,112 L720,100 L720,300 Z'
// Cara en sombra (lado derecho del pico)
const SHADE = 'M470,30 L478,40 L490,52 L500,66 L516,74 L532,96 L552,106 L570,128 L596,142 L620,164 L652,176 L684,192 L720,198 L720,300 L500,300 L486,180 L476,90 Z'
// Aristas iluminadas
const RIDGES = [
  'M470,30 L466,42 L463,56 L457,66 L454,82 L447,96 L445,112 L438,128',
  'M470,30 L474,48 L479,62 L481,80 L486,98 L488,120',
  'M436,78 L428,92 L421,104 L414,122',
  'M404,104 L396,118 L389,134 L381,148',
  'M516,74 L519,92 L523,108',
  'M342,138 L336,152 L329,166'
]
// Ruta de ascenso: de la base al pico
const ROUTE = 'M26,290 C96,284 140,268 190,262 C246,256 238,232 286,222 C336,212 318,190 360,180 C400,170 384,146 412,132 C440,118 428,96 448,78 C460,66 464,48 470,32'

const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Racha como ascenso: la cumbre es el próximo hito (en semanas) y el marcador
 * avanza por la ruta según las semanas cumplidas más el avance de esta semana.
 */
export default function StreakMountain({ progress, routines }) {
  const { level, title, weekly: w } = useLevel()
  const uid = useId().replace(/:/g, '')
  const routeRef = useRef(null)
  const [len, setLen] = useState(0)

  const current = progress?.current
  const ratio = current?.ratio ?? null
  const remaining = current && current.ratio !== null ? remainingToMeet(current, routines) : null
  const week = w.thisWeek
  const weekDone = week.done + week.rescued
  const left = Math.max(week.planned - weekDone, 0)

  // Cumbre = próximo hito; el avance de la semana en curso cuenta como fracción
  const next = STREAK_MILESTONES.find((m) => m > w.weeks) ?? Math.ceil((w.weeks + 1) / 52) * 52
  const frac = week.planned ? Math.min(weekDone / week.planned, 1) : 0
  const target = w.lit ? Math.min((w.weeks + (frac < 1 ? frac : 0)) / next, 1) : 0
  const checkpoints = STREAK_MILESTONES.filter((m) => m < next).map((m) => m / next)

  // El marcador se desliza desde donde estaba hasta el nuevo avance
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    if (reduceMotion() || Math.abs(target - start) < 0.001) {
      from.current = target
      setShown(target)
      return
    }
    let raf
    const t0 = performance.now()
    const tick = (now) => {
      const k = Math.min((now - t0) / 1400, 1)
      const v = start + (target - start) * easeOut(k)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  useLayoutEffect(() => { if (routeRef.current) setLen(routeRef.current.getTotalLength()) }, [])
  const at = (p) => (routeRef.current && len ? routeRef.current.getPointAtLength(len * Math.max(0, Math.min(1, p))) : { x: 26, y: 290 })
  const marker = at(shown)
  const dots = useMemo(() => checkpoints.map((p) => ({ p, ...at(p) })), [len, next]) // eslint-disable-line react-hooks/exhaustive-deps

  const headline = !w.lit ? 'Empieza tu ascenso' : w.weeks ? `${w.weeks} ${w.weeks === 1 ? 'semana' : 'semanas'}` : 'Semana 1'
  const sub = w.lit
    ? `${w.days} ${w.days === 1 ? 'entrenamiento acumulado' : 'entrenamientos acumulados'}${w.rescued ? ` · ${w.rescued} salvado${w.rescued === 1 ? '' : 's'} con extra` : ''}`
    : `Entrena hoy para encender tu racha${w.best ? ` · tu mejor: ${w.best} ${w.best === 1 ? 'semana' : 'semanas'}` : ''}`
  const hito = !w.lit
    ? 'Completa tu primer entrenamiento y el marcador empieza a subir.'
    : left && w.weeks + 1 >= next
      ? `${next} semanas · ${left === 1 ? 'te falta 1 entrenamiento' : `te faltan ${left} entrenamientos`} esta semana`
      : left
        ? `${next} semanas · ${left === 1 ? '1 entrenamiento' : `${left} entrenamientos`} para cerrar esta semana`
        : `${next} semanas · semana cumplida, ¡sigue subiendo!`

  return (
    <div className="card summit-card">
      <div className="summit-scene">
        <svg className="summit-svg" viewBox="0 0 720 300" preserveAspectRatio="xMidYMax slice" role="img" aria-label={`Ascenso: ${Math.round(shown * 100)} % hacia ${next} semanas de racha`}>
          <defs>
            <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-sky1)' }} />
              <stop offset="0.7" style={{ stopColor: 'var(--sm-sky2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-sky3)' }} />
            </linearGradient>
            <radialGradient id={`glow${uid}`} cx="0.72" cy="0.1" r="0.55">
              <stop offset="0" style={{ stopColor: '#ff6a1a', stopOpacity: 'var(--sm-glow)' }} />
              <stop offset="1" stopColor="#ff6a1a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`rock${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-rock1)' }} />
              <stop offset="0.3" style={{ stopColor: 'var(--sm-rock2)' }} />
              <stop offset="0.7" style={{ stopColor: 'var(--sm-rock3)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-rock4)' }} />
            </linearGradient>
            <linearGradient id={`back${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-back1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-back2)' }} />
            </linearGradient>
            <linearGradient id={`shade${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--sm-shade)', stopOpacity: 0.12 }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-shade)', stopOpacity: 'var(--sm-shade-o)' }} />
            </linearGradient>
            <linearGradient id={`fog${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-bg)', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-bg)', stopOpacity: 0.95 }} />
            </linearGradient>
            {/* Relieve de roca: ruido fractal iluminado (luz fría arriba a la izquierda,
                contraluz naranja desde la derecha) y mezclado con el color de la roca */}
            <filter id={`relief${uid}`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.008 0.03" numOctaves="6" seed="11" result="n" />
              <feDiffuseLighting in="n" style={{ lightingColor: 'var(--sm-key)' }} surfaceScale="9" result="key">
                <feDistantLight azimuth="225" elevation="32" />
              </feDiffuseLighting>
              <feDiffuseLighting in="n" style={{ lightingColor: 'var(--sm-rim)' }} surfaceScale="9" result="rim">
                <feDistantLight azimuth="20" elevation="18" />
              </feDiffuseLighting>
              <feComposite in="key" in2="rim" operator="arithmetic" k2="0.85" k3="0.4" result="light" />
              <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1.55" k2="0.1" k3="0.05" result="lit" />
              <feComposite in="lit" in2="SourceAlpha" operator="in" />
            </filter>
            <filter id={`soft${uid}`}><feGaussianBlur stdDeviation="10" /></filter>
            <filter id={`neon${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id={`dot${uid}`}>
              <stop offset="0" stopColor="#fff3e6" />
              <stop offset="0.35" stopColor="#ffb15a" />
              <stop offset="1" stopColor="#ff6a1a" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="720" height="300" fill={`url(#sky${uid})`} />
          <rect width="720" height="300" fill={`url(#glow${uid})`} />
          <path d={BACK} fill={`url(#back${uid})`} filter={`url(#relief${uid})`} opacity="0.75" />
          <ellipse cx="300" cy="215" rx="320" ry="26" style={{ fill: 'var(--sm-mist)', opacity: 'var(--sm-mist-o)' }} filter={`url(#soft${uid})`} />

          <path d={PEAK} fill={`url(#rock${uid})`} filter={`url(#relief${uid})`} />
          <path d={SHADE} fill={`url(#shade${uid})`} />
          {RIDGES.map((d) => <path key={d} d={d} fill="none" style={{ stroke: 'var(--sm-ridge)', strokeOpacity: 'var(--sm-ridge-o)' }} strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" />)}
          <path d="M462,44 L470,30 L478,40 L472,48 Z" style={{ fill: 'var(--sm-snow)', opacity: 'var(--sm-snow-o)' }} />

          {/* Ruta: base tenue y tramo recorrido luminoso */}
          <path ref={routeRef} d={ROUTE} fill="none" stroke="#ff7a1a" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="3 6" strokeLinecap="round" />
          {len > 0 && (
            <path d={ROUTE} fill="none" stroke="#ff8a2a" strokeWidth="2.6" strokeLinecap="round" filter={`url(#neon${uid})`} strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - shown)} />
          )}
          {dots.map((d) => (
            <circle key={d.p} cx={d.x} cy={d.y} r="3.4" style={{ fill: shown >= d.p ? '#ffb15a' : 'var(--sm-dot-off)' }} stroke="#ff8a2a" strokeOpacity={shown >= d.p ? 0.9 : 0.4} strokeWidth="1.2" />
          ))}

          {/* Cumbre: bandera del próximo hito */}
          <g transform="translate(470 32)" className={shown >= 1 ? 'summit-flag reached' : 'summit-flag'}>
            <line x1="0" y1="0" x2="0" y2="-22" stroke="#ffb15a" strokeWidth="1.6" />
            <path d="M0,-22 L15,-17 L0,-12 Z" fill="#ff7a1a" />
          </g>

          {/* Marcador del usuario */}
          {len > 0 && (
            <g className={`summit-marker ${w.lit ? 'lit' : ''}`} transform={`translate(${marker.x} ${marker.y})`}>
              <circle r="16" fill={`url(#dot${uid})`} className="summit-marker-halo" />
              <circle r="5.2" fill="#fff6ec" stroke="#ff7a1a" strokeWidth="2" />
            </g>
          )}
          <rect y="230" width="720" height="70" fill={`url(#fog${uid})`} />
        </svg>

        <div className="summit-head">
          <span className="summit-logo" aria-hidden="true"><IconLogo size={30} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="summit-eyebrow dc-mono">Apexly · tu ascenso</div>
            <div className="summit-title">
              {headline}
              <span className="summit-level" title="Meses seguidos con al menos el 80 %">Nivel {level} · {title}</span>
            </div>
            <div className="summit-sub">{sub}</div>
          </div>
        </div>
        <div className="summit-goal dc-mono" aria-hidden="true">{w.lit ? `${Math.round(shown * 100)} %` : '0 %'} → {next} sem</div>
      </div>

      <div className="summit-stats">
        <div className="summit-stat">
          <div className="summit-stat-row">
            <span>Esta semana</span>
            <b className="num">{week.planned ? `${weekDone} de ${week.planned} entrenamientos` : 'Sin rutina'}</b>
          </div>
          <div className="summit-segs" aria-hidden="true">
            {Array.from({ length: Math.max(week.planned, 1) }, (_, i) => (
              <i key={i} className={i < week.done ? 'on' : i < weekDone ? 'saved' : ''} />
            ))}
          </div>
        </div>
        {ratio !== null && (
          <div
            className="summit-stat"
            title={`${current.bonus > 0 ? `Rutinas ${pct(current.base)} + ${pct(current.bonus)} por actividades extra. ` : ''}${remaining?.needed ? `Te faltan ${remaining.needed} ejercicios este mes para subir de nivel.` : 'Mes asegurado para tu nivel.'}`}
          >
            <div className="summit-stat-row">
              <b className="num">{pct(ratio)}</b>
              <span>del mes · meta {pct(MONTH_THRESHOLD)}</span>
            </div>
            <div className="summit-bar">
              <span style={{ width: `${Math.min(100, ratio * 100)}%` }} className={ratio >= MONTH_THRESHOLD ? 'ok' : ''} />
              <i style={{ left: `${MONTH_THRESHOLD * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="summit-next">
        <IconTrophy size={16} />
        <span><b>Próximo hito:</b> {hito}</span>
        {ratio !== null && remaining?.needed > 0 && <span className="summit-next-aside">Para subir de nivel: {remaining.needed} ejercicios más este mes</span>}
      </div>
    </div>
  )
}
