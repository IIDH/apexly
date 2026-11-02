import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Celebration, { LevelWatcher } from './components/Celebration'
import Layout from './components/Layout'
import MfaChallenge from './components/MfaChallenge'
import NewPassword from './components/NewPassword'
import { useApp } from './context/AppContext'
import { TrainingProvider } from './context/TrainingContext'
import { supabase } from './lib/supabase'
import Ajustes from './pages/Ajustes'
import Calendario from './pages/Calendario'
import Login from './pages/Login'
import Metas from './pages/Metas'
import Progreso from './pages/Progreso'
import Rutinas from './pages/Rutinas'

function Splash() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><div className="skeleton" style={{ width: 64, height: 64, borderRadius: 18 }} /></div>
}

export default function App() {
  const { session, recovery } = useApp()
  const [mfaNeeded, setMfaNeeded] = useState(null)

  // Si el usuario activó verificación en dos pasos, exigir el código antes de entrar
  const checkMfa = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setMfaNeeded(!error && data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2')
  }, [])
  useEffect(() => {
    if (session) checkMfa()
    else setMfaNeeded(null)
  }, [session, checkMfa])

  if (session === undefined) return <Splash />
  if (!session) return <Login />
  if (mfaNeeded === null) return <Splash />
  if (mfaNeeded) return <MfaChallenge onVerified={checkMfa} />
  if (recovery) return <NewPassword />

  return (
    <TrainingProvider>
      <Celebration>
        <LevelWatcher />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Calendario />} />
            <Route path="rutinas" element={<Rutinas />} />
            <Route path="progreso" element={<Progreso />} />
            <Route path="metas" element={<Metas />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Celebration>
    </TrainingProvider>
  )
}
