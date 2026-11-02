import { useState } from 'react'
import Captcha, { captchaEnabled } from '../components/Captcha'
import { Logo } from '../components/Layout'
import { IconArrow } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { notify } = useApp()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  async function submit(e) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return notify('Ingresa un email válido', 'error')
    if (mode !== 'reset' && password.length < 8) return notify('La contraseña debe tener al menos 8 caracteres', 'error')
    if (captchaEnabled && !captchaToken) return notify('Completa la verificación anti-bots', 'error')
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin, captchaToken }
        })
        if (error) throw error
        if (!data.session) setSent(true)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin, captchaToken })
        if (error) throw error
        setSent(true)
      }
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
      // Cada token anti-bots sirve una sola vez
      if (captchaEnabled) setCaptchaKey((k) => k + 1)
    }
  }

  const go = (m) => { setMode(m); setSent(false) }

  return (
    <div className="auth-wrap">
      <div className="dc-glow" style={{ width: 520, height: 520, top: -200, right: -160, background: 'color-mix(in oklab, var(--primary) 22%, transparent)' }} />
      <div className="dc-glow" style={{ width: 380, height: 380, bottom: -160, left: -120, background: 'color-mix(in oklab, var(--primary-2) 16%, transparent)', animationDelay: '-8s' }} />

      <div className="auth-card dc-rise">
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}><Logo /></div>
        <div className="card dc-current" style={{ padding: 32 }}>
          <span className="pill dc-mono"><span className="pill-dot" />Entrenamiento</span>
          <h1 style={{ fontSize: 30, marginTop: 16, lineHeight: 1.15 }}>
            {mode === 'login' ? 'Vuelve a la cima' : mode === 'signup' ? 'Empieza tu racha' : 'Recupera tu acceso'}
          </h1>
          <p className="lead" style={{ fontSize: 15, marginBottom: 24 }}>
            Tus rutinas en un calendario, checklist diario, metas y niveles por constancia.
          </p>

          {sent ? (
            <div className="alert alert-info">
              <div>Te enviamos un correo a <b>{email}</b>. {mode === 'signup' ? 'Confírmalo para entrar.' : 'Sigue el enlace para cambiar tu contraseña.'}</div>
            </div>
          ) : (
            <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
              {mode === 'signup' && (
                <label className="field">
                  <span className="label">Nombre</span>
                  <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
              )}
              <label className="field">
                <span className="label">Email</span>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              {mode !== 'reset' && (
                <label className="field">
                  <span className="label">Contraseña</span>
                  <input className="input" type="password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                  {mode === 'signup' && <span className="muted" style={{ fontSize: 12 }}>Mínimo 8 caracteres. Mejor una frase larga que no uses en otros sitios.</span>}
                </label>
              )}
              <Captcha onToken={setCaptchaToken} resetKey={`${mode}-${captchaKey}`} />
              <button className="btn dc-cta btn-block" disabled={busy} style={{ marginTop: 6 }}>
                {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
                <IconArrow className="arrow" size={16} />
              </button>
            </form>
          )}

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 20, fontSize: 14, flexWrap: 'wrap' }}>
            {mode === 'login' ? (
              <>
                <button className="dc-nav-link link-btn" onClick={() => go('signup')}>Crear cuenta</button>
                <button className="dc-nav-link link-btn" onClick={() => go('reset')}>Olvidé mi contraseña</button>
              </>
            ) : (
              <button className="dc-nav-link link-btn" onClick={() => go('login')}>← Ya tengo cuenta</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
