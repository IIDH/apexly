import { useEffect, useState } from 'react'
import PageHead from '../components/PageHead'
import { DataCard, MfaCard } from '../components/SecuritySettings'
import { IconDownload, IconLogout } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'

let deferredPrompt = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
  })
}

export default function Ajustes() {
  const { user, profile, reloadProfile, notify, theme, toggleTheme } = useApp()
  const [name, setName] = useState('')
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt))
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches

  useEffect(() => { setName(profile?.full_name ?? '') }, [profile])

  useEffect(() => {
    const onPrompt = () => setCanInstall(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  async function save(e) {
    e.preventDefault()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago'
    const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: name.trim() || null, timezone })
    if (error) return notify(friendlyError(error), 'error')
    notify('Ajustes guardados')
    reloadProfile()
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    setCanInstall(false)
  }

  return (
    <>
      <PageHead eyebrow="Ajustes" title="Tu" accent="cuenta" />
      <div className="grid grid-2 dc-rise" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={save}>
          <h3 className="card-title">Perfil</h3>
          <p className="card-sub" style={{ marginBottom: 18 }}>{user?.email}</p>
          <div className="stack" style={{ gap: 14 }}>
            <label className="field">
              <span className="label">Nombre</span>
              <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
            </label>
            <button className="btn dc-cta">Guardar</button>
          </div>
        </form>

        <div className="card">
          <h3 className="card-title">App</h3>
          <div className="list" style={{ marginTop: 10 }}>
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Tema</span>
              <button className="btn btn-ghost btn-sm" onClick={toggleTheme}>{theme === 'dark' ? 'Oscuro' : 'Claro'}</button>
            </div>
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div>Instalar Apexly</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {standalone ? 'Ya estás usando la app instalada.' : canInstall ? 'Agrégala a tu pantalla de inicio.' : 'En iPhone: Compartir → "Agregar a inicio".'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={install} disabled={!canInstall}><IconDownload size={14} /> Instalar</button>
            </div>
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Sesión</span>
              <button className="btn btn-danger btn-sm" onClick={() => supabase.auth.signOut()}><IconLogout size={14} /> Cerrar sesión</button>
            </div>
          </div>
        </div>

        <MfaCard />
        <DataCard />
      </div>
    </>
  )
}
