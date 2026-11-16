import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { supabase } from '../lib/supabase'
import { STREAK_MILESTONES, levelTitle } from '../lib/training'
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

function CelebrationModal({ kind, level, weeks, routineNames, goalTitle, activity, bonusFull, onClose }) {
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
      eyebrow: `Nivel ${level} · ${levelTitle(level ?? 0)}`,
      title: level === 1 ? '¡Primer mes cumplido!' : `¡Subiste a nivel ${level}!`,
      text: level === 1 ? 'Completaste al menos el 80 % de tu mes. Cada mes cumplido sube tu nivel.' : `Llevas ${level} meses seguidos cumpliendo tus rutinas. Sigue así.`
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
    if (level > saved) celebrate({ kind: 'level', level })
    supabase.from('profiles').update({ celebrated_level: level }).eq('id', user.id).then(() => reloadProfile())
  }, [level, saved, user, celebrate, reloadProfile])

  return null
}

export function useLevel() {
  const { progress } = useTraining()
  return useMemo(() => {
    const level = progress?.streak ?? 0
    const weekly = progress?.weekly ?? { weeks: 0, best: 0, lit: false, startedOn: null, days: 0, rescued: 0, thisWeek: { done: 0, planned: 0, rescued: 0 }, totals: { month: 0, year: 0, all: 0 } }
    return { level, title: levelTitle(level), best: progress?.best ?? 0, weekly }
  }, [progress])
}
