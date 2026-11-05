import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import { clampModalPos, startModalDrag, MODAL_MAX_HEIGHT, type ModalPos } from '../utils/modalDrag'

// A dialog that sits wherever its parent's layout puts it (centred, in a corner)
// until it's dragged; from then on it's placed by position:fixed. reset() gives
// it back to the layout.
export function useDraggableDialog(panelRef: RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<ModalPos | null>(null)

  const onDragStart = (e: PointerEvent) => {
    const r = panelRef.current?.getBoundingClientRect()
    if (r) startModalDrag(e, panelRef.current, pos ?? { x: r.left, y: r.top }, setPos)
  }

  // A rotated phone or a smaller window mustn't strand a dragged dialog
  useEffect(() => {
    const keepInView = () => {
      const r = panelRef.current?.getBoundingClientRect()
      if (r) setPos(p => p && clampModalPos(p, r.width, r.height, window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', keepInView)
    return () => window.removeEventListener('resize', keepInView)
  }, [panelRef])

  const placed: CSSProperties = pos ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {}
  const reset = useCallback(() => setPos(null), [])
  return { onDragStart, placed, reset }
}

// For a dialog whose height comes from its content: on a short screen it scrolls
// instead of pushing its header off the top
export const dialogFitsScreen: CSSProperties = { maxHeight: MODAL_MAX_HEIGHT, overflowY: 'auto', boxSizing: 'border-box' }
