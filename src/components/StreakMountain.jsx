import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { useCelebrate, useLevel } from './Celebration'
import { IconLogo, IconTrophy } from './Icons'
import { pct } from '../lib/format'
import { MONTH_THRESHOLD, PEAK_LEVELS, climbState, levelTitle, remainingToMeet, todayISO } from '../lib/training'

// ------------------------------------------------------------ geometría de la cordillera
// Mundo de 1440×300; la vista (720 de ancho) sigue al escalador.
const WORLD = 1440
const VIEW = 720
const CAMP = { x: 46, y: 284 }
const PEAKS = [
  { x: 210, y: 206 }, { x: 370, y: 188 }, { x: 530, y: 170 }, { x: 700, y: 148 },
  { x: 890, y: 122 }, { x: 1100, y: 92 }, { x: 1330, y: 56 }
]
// Pseudoaleatorio estable (la montaña es siempre la misma)
const rnd = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}
const lerp = (a, b, t) => a + (b - a) * t
const SADDLES = PEAKS.slice(0, -1).map((p, i) => {
  const q = PEAKS[i + 1]
  return { x: lerp(p.x, q.x, 0.52), y: Math.max(p.y, q.y) + 44 + rnd(i) * 14 }
})

/** Puntos irregulares de una ladera entre a y b. */
function slope(a, b, seed, n = 7, amp = 7) {
  const pts = []
  for (let i = 1; i < n; i++) {
    const t = i / n
    const j = (rnd(seed * 31 + i) - 0.5) * amp * 2 * Math.sin(Math.PI * t)
    pts.push([lerp(a.x, b.x, t) + (rnd(seed * 17 + i) - 0.5) * 6, lerp(a.y, b.y, t) + j])
  }
  return pts
}

function buildRange() {
  const pts = [[0, 300], [0, 262], [CAMP.x - 20, CAMP.y - 18]]
  const shades = []
  let from = { x: CAMP.x - 20, y: CAMP.y - 18 }
  PEAKS.forEach((p, i) => {
    pts.push(...slope(from, p, i * 2 + 1), [p.x, p.y])
    const to = SADDLES[i] ?? { x: WORLD, y: 196 }
    const down = slope(p, to, i * 2 + 2)
    pts.push(...down, [to.x, to.y])
    // Cara en sombra: del pico hacia la derecha
    // (triángulo: arista derecha hasta el collado y de vuelta por el interior del macizo)
    const inner = { x: lerp(p.x, to.x, 0.22), y: lerp(p.y, 300, 0.8) }
    shades.push(`M${p.x},${p.y} ${down.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${to.x},${to.y} L${lerp(to.x, inner.x, 0.5).toFixed(1)},${lerp(to.y, 300, 0.5).toFixed(1)} L${inner.x.toFixed(1)},${inner.y.toFixed(1)} Z`)
    from = to
  })
  pts.push([WORLD, 300])
  return { range: `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} Z`, shades }
}
const { range: RANGE, shades: SHADES } = buildRange()
const BACK = (() => {
  const pts = [[0, 300], [0, 210]]
  for (let x = 40; x <= WORLD; x += 40) pts.push([x, 120 + rnd(x) * 70 - (x / WORLD) * 40])
  pts.push([WORLD, 300])
  return `M${pts.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' L')} Z`
})()
// Aristas que bajan desde cada cumbre
const RIDGES = PEAKS.flatMap((p, i) => [
  `M${p.x},${p.y} ${slope(p, { x: p.x - 26 - rnd(i) * 14, y: p.y + 70 }, i + 40, 6, 4).map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}`,
  `M${p.x},${p.y} ${slope(p, { x: p.x + 12, y: p.y + 60 }, i + 60, 5, 3).map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}`
])
// Tramos de la ruta: campamento → Iniciado, y de cada cumbre a la siguiente pasando por el collado
const LEGS = PEAKS.map((b, i) => {
  if (i === 0) return `M${CAMP.x},${CAMP.y} C${CAMP.x + 70},${CAMP.y - 4} ${b.x - 90},${b.y + 64} ${b.x},${b.y + 3}`
  const a = PEAKS[i - 1]
  const s = SADDLES[i - 1]
  return `M${a.x},${a.y + 3} C${a.x + 24},${a.y + 26} ${s.x - 34},${s.y - 8} ${s.x},${s.y - 8} S${b.x - 30},${b.y + 40} ${b.x},${b.y + 3}`
})

const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const monthName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { month: 'long' })

/**
 * Racha de niveles como una cordillera de 7 cumbres (Iniciado → Apex). El
 * escalador avanza cada día con el cumplimiento del mes y conquista una cumbre
 * al cerrar el mes que sube su nivel. En Apex la montaña se vuelve dorada y se
 * puede empezar una nueva expedición (prestigio ★).
 */
export default function StreakMountain({ progress, routines }) {
  const { user, profile, reloadProfile } = useApp()
  const { raw, level, best, weekly: w, expedition, stars, base, summits } = useLevel()
  const celebrate = useCelebrate()
  const uid = useId().replace(/:/g, '')
  const legRefs = useRef([])
  const [lens, setLens] = useState([])

  const current = progress?.current
  const ratio = current?.ratio ?? null
  const remaining = current && ratio !== null ? remainingToMeet(current, routines) : null
  const week = w.thisWeek
  const weekDone = week.done + week.rescued
  const c = climbState(level, ratio, Math.max(best - base, level))
  const target = c.leg + c.frac // posición continua 0..7

  // Animación: el escalador se desliza hasta la nueva posición
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
    const dur = Math.min(2600, 1200 + Math.abs(target - start) * 600)
    const tick = (now) => {
      const k = Math.min((now - t0) / dur, 1)
      const v = start + (target - start) * easeOut(k)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  // Cumbre recién conquistada: bandera que se clava + destello (una vez por cumbre)
  const [planting, setPlanting] = useState(null)
  useEffect(() => {
    if (!user) return
    const key = `apexly:peaks:${user.id}:${expedition}`
    let seen = null
    try {
      const v = localStorage.getItem(key)
      seen = v === null ? null : Number(v) // primera visita: solo se recuerda, sin animar
    } catch { /* sin almacenamiento */ }
    try { localStorage.setItem(key, String(c.conquered)) } catch { /* sin almacenamiento */ }
    if (seen !== null && !Number.isNaN(seen) && c.conquered > seen) {
      setPlanting(c.conquered - 1)
      const t = setTimeout(() => setPlanting(null), 3200)
      return () => clearTimeout(t)
    }
  }, [c.conquered, expedition, user])

  const recording = useRef(null)
  // Datos del perfil: la racha se cortó bajo el inicio de la expedición → vuelve al campamento;
  // primera llegada a Apex en esta expedición → se registra la cumbre y se festeja.
  useEffect(() => {
    if (!user || !profile) return
    if ((profile.expedition_base ?? 0) > raw) {
      supabase.from('profiles').update({ expedition_base: 0 }).eq('id', user.id).then(() => reloadProfile())
      return
    }
    if (c.atApex && !summits.some((s) => s.expedition === expedition) && recording.current !== expedition) {
      recording.current = expedition // evita registrar y festejar dos veces mientras se recarga el perfil
      const next = [...summits, { expedition, on: todayISO() }]
      supabase.from('profiles').update({ summits: next }).eq('id', user.id).then(({ error }) => {
        if (!error) {
          reloadProfile()
          celebrate({ kind: 'apex', stars })
        }
      })
    }
  }, [c.atApex, raw, profile, user, summits, expedition, stars, celebrate, reloadProfile])

  async function newExpedition() {
    const { error } = await supabase.from('profiles').update({ expedition: expedition + 1, expedition_base: raw }).eq('id', user.id)
    if (error) return
    try { localStorage.setItem(`apexly:peaks:${user.id}:${expedition + 1}`, '0') } catch { /* sin almacenamiento */ }
    reloadProfile()
    celebrate({ kind: 'expedition', stars: stars + 1 })
  }

  useLayoutEffect(() => {
    setLens(legRefs.current.map((el) => (el ? el.getTotalLength() : 0)))
  }, [])
  const pointAt = (pos) => {
    const i = Math.max(0, Math.min(LEGS.length - 1, Math.floor(pos === LEGS.length ? LEGS.length - 1 : pos)))
    const t = pos >= LEGS.length ? 1 : pos - i
    const el = legRefs.current[i]
    if (!el || !lens[i]) return i === 0 && t === 0 ? CAMP : PEAKS[Math.min(i, PEAKS.length - 1)]
    return el.getPointAtLength(lens[i] * Math.max(0, Math.min(1, t)))
  }
  const marker = pointAt(shown)
  // La vista sigue al escalador (y muestra la cumbre siguiente)
  const offset = Math.max(0, Math.min(WORLD - VIEW, marker.x - VIEW * 0.42))

  const peakTitle = (i) => levelTitle(PEAK_LEVELS[i])
  const starTxt = stars ? ` ${'★'.repeat(Math.min(stars, 5))}${stars > 5 ? `×${stars}` : ''}` : ''
  const monthLeft = remaining?.needed ?? 0
  const today = todayISO()
  const nextMonth = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00`)
    d.setMonth(d.getMonth() + 1)
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long' })
  })()

  const headline = c.atApex ? `Apex${starTxt}` : level ? `${levelTitle(level)}${starTxt}` : 'Campamento base'
  const sub = `Racha: ${w.lit ? (w.weeks ? `${w.weeks} ${w.weeks === 1 ? 'semana' : 'semanas'}` : 'semana 1') : 'sin encender'} · ${w.days} ${w.days === 1 ? 'entrenamiento' : 'entrenamientos'}`
  const hito = c.atApex
    ? c.secured
      ? `En la cima · ${c.monthsAtTop + 1} ${c.monthsAtTop ? 'meses' : 'mes'} · ${monthName(today)} asegurado`
      : `En la cima ${c.monthsAtTop ? `hace ${c.monthsAtTop} ${c.monthsAtTop === 1 ? 'mes' : 'meses'}` : 'desde este mes'} · mantén el ${pct(MONTH_THRESHOLD)} para no bajar${monthLeft ? ` (faltan ${monthLeft} ejercicios)` : ''}`
    : c.secured
      ? `${c.nextTitle} asegurado: lo conquistas el ${nextMonth}`
      : ratio === null
        ? `${c.nextTitle} · arma tu rutina para empezar a subir`
        : `${c.nextTitle} · ${c.next - level > 1 ? `${c.next - level} meses al ${pct(MONTH_THRESHOLD)}` : `llega al ${pct(MONTH_THRESHOLD)} en ${monthName(today)}`}${monthLeft ? ` · faltan ${monthLeft} ejercicios` : ''}`

  return (
    <div className={`card summit-card exp-${((expedition - 1) % 4) + 1} ${c.atApex ? 'is-apex' : ''}`}>
      <div className="summit-scene">
        <svg className="summit-svg" viewBox={`0 0 ${VIEW} 300`} preserveAspectRatio="xMidYMax slice" role="img" aria-label={`Expedición ${expedition}: ${c.atApex ? 'en la cima de Apex' : `rumbo a ${c.nextTitle}, ${Math.round(c.frac * 100)} % del tramo`}`}>
          <defs>
            <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-sky1)' }} />
              <stop offset="0.7" style={{ stopColor: 'var(--sm-sky2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-sky3)' }} />
            </linearGradient>
            <radialGradient id={`glow${uid}`} cx="0.75" cy="0.05" r="0.6">
              <stop offset="0" style={{ stopColor: 'var(--sm-glow-c)', stopOpacity: 'var(--sm-glow)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-glow-c)', stopOpacity: 0 }} />
            </radialGradient>
            <linearGradient id={`rock${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-rock1)' }} />
              <stop offset="0.35" style={{ stopColor: 'var(--sm-rock2)' }} />
              <stop offset="0.7" style={{ stopColor: 'var(--sm-rock3)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-rock4)' }} />
            </linearGradient>
            <linearGradient id={`back${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-back1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-back2)' }} />
            </linearGradient>
            <linearGradient id={`shade${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--sm-shade)', stopOpacity: 0.1 }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-shade)', stopOpacity: 'var(--sm-shade-o)' }} />
            </linearGradient>
            <linearGradient id={`fog${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sm-bg)', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-bg)', stopOpacity: 0.95 }} />
            </linearGradient>
            {/* Relieve de roca: ruido fractal con luz principal y contraluz */}
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
            <filter id={`neon${uid}`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id={`dot${uid}`}>
              <stop offset="0" stopColor="#fff3e6" />
              <stop offset="0.35" style={{ stopColor: 'var(--sm-accent-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--sm-accent)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>

          <rect width={VIEW} height="300" fill={`url(#sky${uid})`} />
          <rect width={VIEW} height="300" fill={`url(#glow${uid})`} />
          {c.atApex && <g className="summit-stars">{Array.from({ length: 24 }, (_, i) => <circle key={i} cx={rnd(i + 5) * VIEW} cy={rnd(i + 50) * 110} r={rnd(i + 90) * 1.3 + 0.4} style={{ animationDelay: `${rnd(i) * 3}s` }} />)}</g>}

          <g className="summit-world" style={{ transform: `translateX(${-offset}px)` }}>
            <g className="summit-terrain">
              <path d={BACK} fill={`url(#back${uid})`} filter={`url(#relief${uid})`} opacity="0.75" />
              <ellipse cx={WORLD / 2} cy="220" rx={WORLD / 2} ry="26" style={{ fill: 'var(--sm-mist)', opacity: 'var(--sm-mist-o)' }} filter={`url(#soft${uid})`} />
              <path d={RANGE} fill={`url(#rock${uid})`} filter={`url(#relief${uid})`} />
              {SHADES.map((d) => <path key={d} d={d} fill={`url(#shade${uid})`} />)}
              {RIDGES.map((d) => <path key={d} d={d} fill="none" style={{ stroke: 'var(--sm-ridge)', strokeOpacity: 'var(--sm-ridge-o)' }} strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" />)}
              {PEAKS.map((p, i) => <path key={i} d={`M${p.x - 7},${p.y + 11} L${p.x},${p.y} L${p.x + 7},${p.y + 9} L${p.x + 2},${p.y + 15} Z`} style={{ fill: 'var(--sm-snow)', opacity: 'var(--sm-snow-o)' }} />)}
            </g>

            {/* Campamento base */}
            <g transform={`translate(${CAMP.x} ${CAMP.y})`} className="summit-camp">
              <path d="M-9,0 L0,-12 L9,0 Z" style={{ fill: 'var(--sm-accent)' }} opacity="0.85" />
              <path d="M-2.5,0 L0,-4 L2.5,0 Z" fill="#000" opacity="0.4" />
            </g>

            {/* Ruta: tramos punteados y lo recorrido en naranja luminoso */}
            {LEGS.map((d, i) => (
              <path key={`b${i}`} ref={(el) => (legRefs.current[i] = el)} d={d} fill="none" style={{ stroke: 'var(--sm-accent)' }} strokeOpacity="0.28" strokeWidth="1.8" strokeDasharray="3 6" strokeLinecap="round" />
            ))}
            {lens.length > 0 && LEGS.map((d, i) => {
              const t = Math.max(0, Math.min(1, shown - i))
              if (t <= 0) return null
              return <path key={`g${i}`} d={d} fill="none" style={{ stroke: 'var(--sm-accent)' }} strokeWidth="2.6" strokeLinecap="round" filter={`url(#neon${uid})`} strokeDasharray={`${lens[i]} ${lens[i]}`} strokeDashoffset={lens[i] * (1 - t)} />
            })}

            {/* Cumbres: bandera encendida (conquistada), de récord o pendiente */}
            {PEAKS.map((p, i) => {
              const done = i < c.conquered
              const record = !done && i < c.recordPeaks
              const apex = i === PEAKS.length - 1
              return (
                <g key={i} transform={`translate(${p.x} ${p.y})`} className={`peak ${done ? 'done' : record ? 'record' : 'todo'} ${planting === i ? 'planting' : ''} ${apex ? 'apex' : ''}`}>
                  {planting === i && <circle className="peak-burst" r="6" />}
                  <g className="peak-flag">
                    <line x1="0" y1="0" x2="0" y2={apex ? -26 : -18} strokeWidth="1.5" />
                    <path d={apex ? 'M0,-26 L18,-20 L0,-14 Z' : 'M0,-18 L12,-14 L0,-10 Z'} />
                  </g>
                  <text y={apex ? -32 : -24} textAnchor="middle" className="peak-label">{apex ? 'APEX' : peakTitle(i)}</text>
                </g>
              )
            })}

            {/* Escalador */}
            {lens.length > 0 && (
              <g className={`summit-marker ${level || w.lit ? 'lit' : ''}`} transform={`translate(${marker.x} ${marker.y})`}>
                <circle r="16" fill={`url(#dot${uid})`} className="summit-marker-halo" />
                <circle r="5.2" fill="#fff6ec" style={{ stroke: 'var(--sm-accent)' }} strokeWidth="2" />
              </g>
            )}
          </g>
          <rect y="236" width={VIEW} height="64" fill={`url(#fog${uid})`} />
        </svg>

        <div className="summit-head">
          <span className="summit-logo" aria-hidden="true"><IconLogo size={30} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="summit-eyebrow dc-mono">Apexly · expedición {expedition}{starTxt}</div>
            <div className="summit-title">
              {headline}
              <span className="summit-level" title="Meses seguidos con al menos el 80 %">Nivel {level}{c.atApex && c.monthsAtTop ? ` · ${c.monthsAtTop} en la cima` : ''}</span>
            </div>
            <div className="summit-sub">{sub}</div>
          </div>
        </div>
        <div className="summit-goal dc-mono" aria-hidden="true">
          {c.atApex ? `★ cima · ${c.monthsAtTop + 1} ${c.monthsAtTop ? 'meses' : 'mes'}` : `${c.conquered}/7 cumbres · ${Math.round(c.frac * 100)} % → ${c.nextTitle}`}
        </div>
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
          <div className="summit-stat" title={current.bonus > 0 ? `Rutinas ${pct(current.base)} + ${pct(current.bonus)} por actividades extra` : undefined}>
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
        <span><b>{c.atApex ? 'Cumbre conquistada:' : 'Próxima cumbre:'}</b> {hito}</span>
        {c.atApex && (
          <button type="button" className="btn btn-sm summit-expedition" onClick={newExpedition}>
            Nueva expedición {'★'.repeat(Math.min(stars + 1, 5))}
          </button>
        )}
      </div>
    </div>
  )
}

