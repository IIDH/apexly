import { Link, NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { IconCalendar, IconChart, IconDumbbell, IconGear, IconLogo, IconLogout, IconMoon, IconSun, IconTarget } from './Icons'

const NAV = [
  { to: '/', label: 'Calendario', short: 'Hoy', icon: IconCalendar, end: true },
  { to: '/rutinas', label: 'Rutinas', short: 'Rutinas', icon: IconDumbbell },
  { to: '/progreso', label: 'Progreso', short: 'Progreso', icon: IconChart },
  { to: '/metas', label: 'Metas', short: 'Metas', icon: IconTarget },
  { to: '/ajustes', label: 'Ajustes', short: 'Ajustes', icon: IconGear }
]

export function Logo() {
  return (
    <Link to="/" className="fa-logo" aria-label="Apexly inicio">
      <span className="fa-logo-mark"><IconLogo size={18} /></span>
      <span>apex<b>ly</b></span>
    </Link>
  )
}

export default function Layout() {
  const { theme, toggleTheme } = useApp()

  return (
    <>
      {/* Destellos de fondo: capa fija a pantalla completa, detrás de todo */}
      <div className="fa-glows" aria-hidden="true">
        <div className="dc-glow" style={{ width: 560, height: 560, top: -220, right: -160, background: 'color-mix(in oklab, var(--primary) 16%, transparent)' }} />
        <div className="dc-glow" style={{ width: 420, height: 420, top: '45%', left: -200, background: 'color-mix(in oklab, var(--primary-2) 10%, transparent)', animationDelay: '-6s' }} />
      </div>
      <header className="fa-header">
        <div className="fa-header-inner">
          <Logo />
          <nav className="fa-nav" aria-label="Principal">
            {NAV.slice(0, 4).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="dc-nav-link">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="fa-header-actions">
            <button className="dc-icon-btn" onClick={toggleTheme} aria-label="Cambiar tema" title="Cambiar tema">
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
            <Link to="/ajustes" className="dc-icon-btn fa-hide-sm" aria-label="Ajustes" title="Ajustes">
              <IconGear size={17} />
            </Link>
            <button className="dc-icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Cerrar sesión" title="Cerrar sesión">
              <IconLogout size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="fa-main">
        <Outlet />
      </main>

      <nav className="fa-tabbar" aria-label="Navegación móvil">
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={20} />
            {short}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
