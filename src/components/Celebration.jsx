import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTraining } from '../context/TrainingContext'
import { supabase } from '../lib/supabase'
import { levelTitle } from '../lib/training'
import { IconBolt, IconFlame, IconLogo, IconStar, IconTrophy } from './Icons'

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

function CelebrationModal({ kind, level, routineNames, goalTitle, activity, milestone, onClose }) {
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
      eyebrow: 'Nivel 1 · Iniciado',
      title: '¡Iniciaste una racha!',
      text: 'Cumpliste tu primer mes completo de entrenamiento. Mantén el ritmo: cada mes cumplido sube tu nivel.'
    },
    level: {
      icon: <IconTrophy size={40} />,
      eyebrow: `Nivel ${level} · ${levelTitle(level ?? 0)}`,
      title: `¡Subiste a nivel ${level}!`,
      text: `Llevas ${level} meses seguidos cumpliendo tus rutinas. Sigue así.`
    },
    goal: {
      icon: <IconTrophy size={40} />,
      eyebrow: 'Meta cumplida',
      title: '¡Éxito, lo lograste!',
      text: `Alcanzaste tu meta "${goalTitle}". Ponte una nueva y sigue subiendo.`
    },
    extra: milestone
      ? {
          icon: <IconStar size={40} />,
          eyebrow: `Hito extra · ${milestone}`,
          title: milestone === 1 ? '¡Tu primera actividad extra!' : `¡${milestone} actividades extra!`,
          text: `¡Buena! Hiciste más deporte: ${activity} quedó anotado. Los extras no cambian tu racha, pero suman hitos propios.`
        }
      : {
          icon: <IconBolt size={40} />,
          eyebrow: 'Actividad extra',
          title: '¡Buena! Hiciste más deporte',
          text: `${activity} quedó anotado como extra. No suma ni resta a tu racha: es un plus.`
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

  useEffect(() => {
    if (level === null || saved === null || !user || handled.current === level) return
    if (level === saved) return
    handled.current = level
    if (level > saved) celebrate(level === 1 ? { kind: 'streak' } : { kind: 'level', level })
    supabase.from('profiles').update({ celebrated_level: level }).eq('id', user.id).then(() => reloadProfile())
  }, [level, saved, user, celebrate, reloadProfile])

  return null
}

export function useLevel() {
  const { progress } = useTraining()
  return useMemo(() => {
    const level = progress?.streak ?? 0
    return { level, title: levelTitle(level), best: progress?.best ?? 0 }
  }, [progress])
}
