import { useEffect, useState } from 'react'

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
 * Contador de series: cada toque suma una serie; al llegar a la última marca el
 * ejercicio como hecho. "−" deshace la última serie.
 */
export default function SetCounter({ itemId, iso, sets, checked, editable, onComplete, onUncomplete }) {
  const [count, setCount] = useState(() => (checked ? sets : Math.min(read(itemId, iso), sets)))

  // Si el ejercicio se marca o desmarca desde el check, el contador lo sigue
  useEffect(() => {
    if (checked) setCount(sets)
    else setCount((c) => (c >= sets ? 0 : c))
  }, [checked, sets])
  useEffect(() => { write(itemId, iso, checked ? 0 : count) }, [itemId, iso, count, checked])

  function add() {
    if (!editable || count >= sets) return
    const next = count + 1
    setCount(next)
    if (navigator.vibrate) navigator.vibrate(next === sets ? [30, 60, 30] : 25)
    if (next === sets) onComplete()
  }
  function undo() {
    if (!editable || count === 0) return
    if (checked) onUncomplete()
    setCount(count - 1)
  }

  const finished = count >= sets
  return (
    <div className={`set-counter ${finished ? 'done' : ''}`}>
      <button type="button" className="set-tap" onClick={add} disabled={!editable || finished} aria-label={finished ? 'Series completas' : `Marcar serie ${count + 1} de ${sets}`}>
        <span className="set-num num">{finished ? '✓ Listo' : `Serie ${count + 1}`}<small>{finished ? '' : 'toca al terminarla'}</small></span>
        <span className="set-dots" aria-hidden="true">
          {Array.from({ length: sets }, (_, i) => <i key={i} className={i < count ? 'on' : ''} />)}
        </span>
        <span className="set-of num">{count}/{sets}</span>
      </button>
      {count > 0 && editable && (
        <button type="button" className="set-undo" onClick={undo} aria-label="Deshacer última serie">−</button>
      )}
    </div>
  )
}
