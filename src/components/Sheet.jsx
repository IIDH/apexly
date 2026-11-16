import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from './Icons'

/**
 * Diálogo que se monta directo en <body> (portal): así no lo afecta ninguna
 * animación de la página. Encabezado y botones quedan fijos; solo el contenido
 * hace scroll. En celular se abre como hoja desde abajo.
 */
export default function Sheet({ title, subtitle, onClose, footer, children, className = '' }) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h3 id={titleId} className="card-title">{title}</h3>
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          <button type="button" className="dc-icon-btn" onClick={onClose} aria-label="Cerrar"><IconX size={16} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
