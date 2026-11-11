import { useEffect, useRef, useState } from 'react'
import { IconCheck } from './Icons'

// El avance de series vive en el teléfono (localStorage): es del momento del
// entrenamiento. Lo que queda guardado en la base es el ejercicio completado.
const key = (itemId, iso) => `apexly:sets:${itemId}|${iso}`
const read = (itemId, iso) => {
  try {
    return Number(localStorage.getItem(key(itemId, iso))) || 0
  } catch {
    return 0
  }
}
const write = (itemId, iso, n) => {
  try {
    n > 0 ? localStorage.setItem(key(itemId, iso), String(n)) : localStorage.removeItem(key(itemId, iso))
  } catch {
    /* sin almacenamiento: el contador funciona igual mientras la pantalla esté abierta */
  }
}

/**
 * Ejercicio con series: cada toque suma una serie y el cuadro muestra cuántas
 * llevas (como una burbuja de notificación). En la última se marca ✓.
 * Mantener presionado resta una serie; tocar un ejercicio terminado lo desmarca.
 */
export default function SetCheckRow({ item, iso, checked, editable, missed, onToggle }) {
  const sets = item.sets
  const [count, setCount] = useState(() => (checked ? sets : Math.min(read(item.id, iso), sets)))
  const press = useRef({ timer: null, long: false })

  // Si el ejercicio se marca o desmarca desde otro lado, el contador lo sigue
  useEffect(() => {
    if (checked) setCount(sets)
    else setCount((c) => (c >= sets ? 0 : c))
  }, [checked, sets])
  useEffect(() => { write(item.id, iso, checked ? 0 : count) }, [item.id, iso, count, checked])

  const buzz = (p) => navigator.vibrate?.(p)

  function tap() {
    if (press.current.long) {
      press.current.long = false
      return
    }
    if (!editable) return
    if (checked) {
      setCount(0)
      return onToggle()
    }
    const next = count + 1
    setCount(next)
    if (next >= sets) {
      buzz([30, 60, 30])
      onToggle()
    } else buzz(20)
  }

  // Mantener presionado: resta una serie (para corregir un toque de más)
  function startPress() {
    if (!editable || count === 0) return
    press.current.timer = setTimeout(() => {
      press.current.long = true
      buzz(40)
      if (checked) onToggle()
      setCount((c) => Math.max(c - 1, 0))
    }, 550)
  }
  const endPress = () => clearTimeout(press.current.timer)

  const counting = count > 0 && !checked
  return (
    <button
      type="button"
      className={`check-row set-row ${checked ? 'checked' : ''} ${!editable ? 'readonly' : ''} ${missed ? 'missed' : ''}`}
      onClick={tap}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
      disabled={!editable}
      aria-label={`${item.name}: ${checked ? 'completo' : `serie ${count} de ${sets}`}. Toca para sumar una serie.`}
    >
      <span className={`check-box ${counting ? 'counting' : ''}`} aria-hidden="true">
        {checked ? <IconCheck size={14} /> : counting ? <b key={count} className="set-badge num">{count}</b> : null}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="check-name">{item.name}</span>
        <span className="check-detail">
          {counting ? <b className="set-progress">{count} de {sets} series</b> : `${sets} series`}
          {item.detail ? ` · ${item.detail}` : ''}
        </span>
      </span>
    </button>
  )
}
