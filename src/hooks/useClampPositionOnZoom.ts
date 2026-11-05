import { useEffect, useRef, type RefObject, type Dispatch, type SetStateAction } from 'react'
import { clampModalPos } from '../utils/modalDrag'

// ── Keeps a floating modal's dragged position on-screen after an app-zoom
// change (Ctrl +/-/0 or Settings → Appearance). App zoom changes
// window.innerWidth/innerHeight in CSS-px terms — Chromium's own
// zoomFactor scales the logical viewport, same as browser zoom — so a
// modal dragged near an edge at one zoom level can end up partially or
// fully off-screen at another. Only nudges a modal back in when that's
// actually happened; never repositions an on-screen modal just because
// zoom changed, matching every other floating modal's "don't move on an
// unrelated layout change" rule (see modalAnchors.ts's own header comment).
// Reads pos via a ref rather than a dependency so the listener is
// registered once per mount, not re-subscribed on every drag frame. ───────
export function useClampPositionOnZoom(
  pos: { x: number; y: number },
  setPos: Dispatch<SetStateAction<{ x: number; y: number }>>,
  panelRef: RefObject<HTMLElement | null>,
) {
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    const keepInView = () => {
      const el = panelRef.current
      // A hidden panel measures 0×0: it's clamped when it next moves or zooms
      if (!el?.offsetWidth) return
      // getBoundingClientRect (fractional) rather than offsetWidth/Height
      // (integer) — at a non-100% zoom the rendered box is a fractional CSS
      // size, and clamping against the rounded integer left it up to ~2px
      // past the real edge.
      const { width: w, height: h } = el.getBoundingClientRect()
      const cur = posRef.current
      const { x, y } = clampModalPos(cur, w, h, window.innerWidth, window.innerHeight)
      if (x !== cur.x || y !== cur.y) setPos({ x, y })
    }
    window.electronAPI.onZoomChanged(keepInView)
    // Also a smaller window, or a phone rotating
    window.addEventListener('resize', keepInView)
    return () => {
      window.electronAPI.offZoomChanged(keepInView)
      window.removeEventListener('resize', keepInView)
    }
  }, [setPos, panelRef])
}
