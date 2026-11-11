import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useConfirm } from './ConfirmDialog'
import { api } from '../lib/api'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { IconAlert, IconDownload, IconLock, IconTrash } from './Icons'

// ------------------------------------------------------------ verificación en dos pasos
export function MfaCard() {
  const { notify } = useApp()
  const confirm = useConfirm()
  const [factor, setFactor] = useState(undefined)
  const [enroll, setEnroll] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    setFactor(error ? null : data.totp.find((f) => f.status === 'verified') ?? null)
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true)
    // Limpia intentos anteriores sin verificar
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Apexly ${Date.now()}` })
    setBusy(false)
    if (error) return notify(/disabled|not enabled/i.test(error.message) ? 'La verificación en dos pasos no está habilitada en Supabase.' : friendlyError(error), 'error')
    setEnroll(data)
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() })
    setBusy(false)
    if (error) return notify('Código incorrecto. Revisa que la hora de tu teléfono esté sincronizada.', 'error')
    notify('Verificación en dos pasos activada')
    setEnroll(null)
    setCode('')
    load()
  }

  async function disable() {
    if (!(await confirm({ tone: 'warn', title: '¿Desactivar la verificación en dos pasos?', message: 'Tu cuenta quedará protegida solo con la contraseña.', confirmText: 'Desactivar' }))) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return notify(friendlyError(error), 'error')
    notify('Verificación en dos pasos desactivada')
    load()
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Verificación en dos pasos</h3>
          <p className="card-sub">Además de tu contraseña, pide un código de tu teléfono al ingresar.</p>
        </div>
        {factor !== undefined && <span className={`badge ${factor ? 'badge-ok' : ''}`}><IconLock size={11} /> {factor ? 'Activa' : 'Inactiva'}</span>}
      </div>
      {factor ? (
        <button className="btn btn-ghost btn-sm" onClick={disable}>Desactivar</button>
      ) : enroll ? (
        <form onSubmit={verify} className="stack" style={{ gap: 12 }}>
          <p style={{ fontSize: 14 }}>1. Escanea este código con tu app de autenticación (Google Authenticator, 1Password, Authy…).</p>
          <img src={enroll.totp.qr_code} alt="Código QR para la app de autenticación" width={180} height={180} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
          <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>¿No puedes escanear? Ingresa esta clave: <code>{enroll.totp.secret}</code></p>
          <p style={{ fontSize: 14 }}>2. Escribe el código de 6 dígitos que aparece:</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 160, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'var(--font-mono)' }} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />
            <button className="btn dc-cta" disabled={busy || code.length !== 6}>Activar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEnroll(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button className="btn dc-cta btn-sm" onClick={start} disabled={busy || factor === undefined}>Activar verificación en dos pasos</button>
      )}
    </div>
  )
}

// ------------------------------------------------------------ mis datos: exportar y eliminar
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DataCard() {
  const { user, notify } = useApp()
  const [busy, setBusy] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function exportData() {
    setBusy(true)
    try {
      const tables = ['profiles', 'routines', 'routine_schedules', 'routine_items', 'completions', 'goals', 'goal_entries', 'extra_activities', 'plans', 'pauses']
      const results = await Promise.all(tables.map((t) => supabase.from(t).select('*')))
      // Tablas de migraciones opcionales: si aún no existen, se exportan vacías
      const optional = ['extra_activities', 'plans', 'pauses']
      results.forEach((r, i) => { if (r.error && optional.includes(tables[i])) { r.error = null; r.data = [] } })
      const failed = results.find((r) => r.error)
      if (failed) throw failed.error
      const data = Object.fromEntries(tables.map((t, i) => [t, results[i].data]))
      const stamp = new Date().toISOString().slice(0, 10)
      download(`apexly-datos-${stamp}.json`, JSON.stringify({ exportado: new Date().toISOString(), email: user.email, ...data }, null, 2), 'application/json')
      notify('Datos exportados')
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      await api('/account/delete', { method: 'POST', body: { confirm: confirmText } })
      await supabase.auth.signOut()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3 className="card-title">Mis datos</h3>
      <p className="card-sub" style={{ marginBottom: 16 }}>Descarga todo lo que has registrado o elimina tu cuenta definitivamente.</p>
      <button className="btn btn-ghost btn-sm" onClick={exportData} disabled={busy}><IconDownload size={14} /> Exportar mis datos (JSON)</button>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        {!deleting ? (
          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}><IconTrash size={14} /> Eliminar mi cuenta</button>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <div className="alert alert-danger"><IconAlert size={18} /><div>Se borrarán <b>para siempre</b> tu cuenta, tus rutinas, tu historial de entrenamientos, actividades extra, metas y racha. Te recomendamos exportar tus datos antes.</div></div>
            <label className="field">
              <span className="label">Escribe ELIMINAR para confirmar</span>
              <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </label>
            <div className="row">
              <button className="btn btn-danger" disabled={busy || confirmText !== 'ELIMINAR'} onClick={deleteAccount}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
              <button className="btn btn-ghost" onClick={() => { setDeleting(false); setConfirmText('') }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
