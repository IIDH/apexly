// Piezas comunes de los gráficos (Recharts): tooltip, ejes discretos y colores.

export const axisProps = {
  tick: { fill: 'var(--muted)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--line)' }
}
export const gridProps = { stroke: 'var(--line)', strokeDasharray: '3 3', vertical: false }

/** Tooltip con el estilo de la app. rows: (payload) => [{ label, value, color }] */
export function ChartTip({ active, payload, title, rows }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tip">
      <b style={{ textTransform: 'capitalize' }}>{title(p)}</b>
      {rows(p).map((r) => (
        <div key={r.label} className="chart-tip-row">
          {r.color && <span className="swatch" style={{ background: r.color }} />}
          <span className="muted">{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

export function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="card">
      <div className="kpi-label">
        <span className="kpi-icon" style={tone === 'ok' ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : undefined}><Icon size={16} /></span>
        <span className="dc-mono muted">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
