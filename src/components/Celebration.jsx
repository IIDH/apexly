import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { supabase } from '../lib/supabase'
import { PEAK_LEVELS, STREAK_MILESTONES, levelTitle } from '../lib/training'
import { IconBolt, IconFlame, IconLogo, IconTrophy } from './Icons'

const Ctx = createContext(() => {})

/**
 * Pantalla de festejo: día completado ("¡Éxito, lo lograste!"), racha iniciada
 * o nivel nuevo. Uso: const celebrate = useCelebrate(); celebrate({ kind: 'day' })
 */
export default function Celebration({ children }) {
  const [queue, setQueue] = useState([])
  const celebrate = useCallback((c) => setQueue((q) => [...q, c]), [])
  const current = queue[0]
  const close = useCallback(() => setQueue((q) => q.slice(1)), [])

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      {current && <CelebrationModal key={queue.length + current.kind} {...current} onClose={close} />}
    </Ctx.Provider>
  )
}

export const useCelebrate = () => useContext(Ctx)

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 0.12,
  duration: 1.6 + ((i * 13) % 10) / 10,
  rotate: (i * 47) % 360,
  color: ['var(--primary)', 'var(--primary-2)', 'var(--ok)', 'var(--text)'][i % 4]
}))

function CelebrationModal({ kind, level, weeks, stars = 0, routineNames, goalTitle, activity, bonusFull, onClose }) {
  const starTxt = stars ? ` ${'★'.repeat(Math.min(stars, 5))}` : ''
  const btn = useRef(null)
  useEffect(() => {
    btn.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const content = {
    day: {
      icon: <IconLogo size={40} />,
      eyebrow: 'Día completado',
      title: '¡Éxito, lo lograste!',
      text: routineNames?.length ? `Completaste ${routineNames.join(', ')}. Un paso más hacia la cima.` : 'Completaste todo lo de hoy. Un paso más hacia la cima.'
    },
    streak: {
      icon: <IconFlame size={40} />,
      eyebrow: 'Racha · 🔥 semana 1',
      title: '¡Encendiste tu racha!',
      text: 'Primer entrenamiento hecho. Cumple todos tus días de rutina de cada semana para sumar semanas; los descansos y las pausas no la cortan. ¡No la dejes apagar!'
    },
    streakWeeks: {
      icon: <IconFlame size={40} />,
      eyebrow: `Racha · 🔥 ${weeks} semanas`,
      title: `¡${weeks} semanas de racha!`,
      text: weeks >= 26 ? 'Esto ya es un estilo de vida. Pocos llegan hasta aquí: sigue subiendo.' : weeks >= 8 ? 'Ya es un hábito. Cada semana cumplida la hace crecer.' : 'Vas muy bien. Cumple tu próxima semana y sigue sumando.'
    },
    level: {
      icon: <IconTrophy size={40} />,
      eyebrow: `Nivel ${level} · ${levelTitle(level ?? 0)}${starTxt}`,
      title: PEAK_LEVELS.includes(level) ? `¡Conquistaste ${levelTitle(level)}!` : `¡Subiste a nivel ${level}!`,
      text: PEAK_LEVELS.includes(level)
        ? `Nueva cumbre en tu montaña: ${level} ${level === 1 ? 'mes cumplido' : 'meses seguidos cumpliendo'}. Tu bandera ya está arriba; la siguiente cumbre te espera.`
        : `Llevas ${level} meses seguidos cumpliendo tus rutinas. Sigue subiendo hacia la próxima cumbre.`
    },
    apex: {
      icon: <IconTrophy size={40} />,
      eyebrow: `Nivel 12 · Apex${starTxt}`,
      title: '¡Conquistaste la montaña!',
      text: 'Un año entero de constancia: eres Apex. Mantén la cima cada mes o empieza una nueva expedición para ganar una estrella de prestigio.'
    },
    expedition: {
      icon: <IconLogo size={40} />,
      eyebrow: `Expedición ${stars + 1}${starTxt}`,
      title: '¡Nueva expedición!',
      text: 'Otra montaña, los mismos títulos y una estrella más. Tu cumbre anterior queda en tu galería. ¡A subir!'
    },
    goal: {
      icon: <IconTrophy size={40} />,
      eyebrow: 'Meta cumplida',
      title: '¡Éxito, lo lograste!',
      text: `Alcanzaste tu meta "${goalTitle}". Ponte una nueva y sigue subiendo.`
    },
    extra: {
      icon: <IconBolt size={40} />,
      eyebrow: bonusFull ? 'Actividad extra' : 'Actividad extra · +5 % a tu mes',
      title: '¡Buena! Hiciste más deporte',
      text: bonusFull
        ? `${activity} quedó anotado. Este mes ya tienes el bonus máximo (+10 %), pero si hoy tocaba rutina y no alcanzaste, igual salva tu racha.`
        : `${activity} quedó anotado: suma +5 % a tu cumplimiento del mes (hasta +10 %) y, si hoy tocaba rutina y no alcanzaste, salva tu racha.`
    }
  }[kind]

  return (
    <div className="modal-backdrop celebrate-backdrop" onClick={onClose}>
      <div className="celebrate-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <span key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s`, '--r': `${c.rotate}deg`, color: c.color }} />
        ))}
      </div>
      <div className="modal card celebrate-card dc-current" role="dialog" aria-modal="true" aria-labelledby="celebrate-title" onClick={(e) => e.stopPropagation()}>
        <div className={`celebrate-icon ${kind === 'extra' ? 'extra' : kind === 'day' ? 'logo' : ''}`}>{content.icon}</div>
        <span className="pill dc-mono" style={{ marginTop: 18 }}><span className="pill-dot" />{content.eyebrow}</span>
        <h2 id="celebrate-title" className="celebrate-title">{content.title}</h2>
        <p className="muted" style={{ lineHeight: 1.55, marginTop: 8 }}>{content.text}</p>
        <button ref={btn} className="btn dc-cta btn-block" style={{ marginTop: 22 }} onClick={onClose}>¡Vamos!</button>
      </div>
    </div>
  )
}

/**
 * Compara el nivel actual (meses seguidos cumplidos) con el último festejado.
 * Si subió, festeja y lo guarda; si la racha se cortó, lo baja en silencio para
 * volver a festejar cuando se recupere.
 */
export function LevelWatcher() {
  const { user, profile, reloadProfile } = useApp()
  const { progress } = useTraining()
  const celebrate = useCelebrate()
  const handled = useRef(null)

  const level = progress?.streak ?? null
  const saved = profile?.celebrated_level ?? null
  const weekly = progress?.weekly

  // Racha semanal: festeja al encenderla y en los hitos (una vez por racha)
  const last = useRef(null)
  useEffect(() => {
    if (!weekly || !user) return
    const prev = last.current
    last.current = { lit: weekly.lit, weeks: weekly.weeks }
    if (!prev || !weekly.startedOn) return
    let c = null
    if (!prev.lit && weekly.lit) c = { kind: 'streak', id: 'start' }
    else if (weekly.weeks > prev.weeks && STREAK_MILESTONES.includes(weekly.weeks)) c = { kind: 'streakWeeks', weeks: weekly.weeks, id: weekly.weeks }
    if (!c) return
    const key = `apexly:streak:${user.id}:${weekly.startedOn}:${c.id}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { /* sin almacenamiento: se festeja igual */ }
    // Pequeña espera: primero se ve "Día completado" y después la racha
    setTimeout(() => celebrate(c), 900)
  }, [weekly, user, celebrate])

  useEffect(() => {
    if (level === null || saved === null || !user || handled.current === level) return
    if (level === saved) return
    handled.current = level
    const base = Math.min(profile?.expedition_base ?? 0, level)
    const eff = level - base
    const stars = (profile?.expedition ?? 1) - 1
    // Apex lo festeja la montaña al registrar la cumbre (si existe la columna de expediciones)
    const apexHandled = eff === 12 && Array.isArray(profile?.summits)
    if (level > saved && !apexHandled) celebrate(eff === 12 ? { kind: 'apex', stars } : { kind: 'level', level: eff, stars })
    supabase.from('profiles').update({ celebrated_level: level }).eq('id', user.id).then(() => reloadProfile())
  }, [level, saved, user, profile, celebrate, reloadProfile])

  return null
}

export function useLevel() {
  const { progress } = useTraining()
  const { profile } = useApp()
  return useMemo(() => {
    const raw = progress?.streak ?? 0
    // Expedición: el nivel se cuenta desde que empezó (si la racha se cortó, vuelve a 0)
    const base0 = profile?.expedition_base ?? 0
    const base = raw < base0 ? 0 : base0
    const level = raw - base
    const expedition = profile?.expedition ?? 1
    const summits = Array.isArray(profile?.summits) ? profile.summits : []
    const weekly = progress?.weekly ?? { weeks: 0, best: 0, lit: false, startedOn: null, days: 0, rescued: 0, thisWeek: { done: 0, planned: 0, rescued: 0 }, totals: { month: 0, year: 0, all: 0 } }
    return { raw, level, title: levelTitle(level), best: progress?.best ?? 0, weekly, expedition, stars: expedition - 1, base, summits }
  }, [progress, profile])
}
