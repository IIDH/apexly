import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const Ctx = createContext(null)

function initialTheme() {
  try {
    const saved = localStorage.getItem('ax-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [theme, setTheme] = useState(initialTheme)
  const [toast, setToast] = useState(null)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    document.body.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0a0c' : '#ffffff')
    try { localStorage.setItem('ax-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Llegó desde el enlace de "olvidé mi contraseña": pedir la nueva
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  const loadProfile = useCallback(async () => {
    if (!userId) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data ?? { id: userId, full_name: null, celebrated_level: 0 })
  }, [userId])
  useEffect(() => { loadProfile() }, [loadProfile])

  const notify = useCallback((message, type = 'ok') => {
    setToast({ message, type, id: Date.now() })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      reloadProfile: loadProfile,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      notify,
      recovery,
      endRecovery: () => setRecovery(false)
    }),
    [session, profile, loadProfile, theme, notify, recovery]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div key={toast.id} className={`toast ${toast.type === 'error' ? 'error' : ''}`} role="status">{toast.message}</div>}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
