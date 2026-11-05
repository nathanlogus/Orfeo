// ── Floating windows: moved by mouse or finger, and always within reach ─────
// Pointer events, because touch sends no mousemove. Everything here serves one
// rule: however small the screen, a window's header and close button stay
// reachable, and no part of a window is left where it can't be dragged into view.
import type { PointerEvent as ReactPointerEvent } from 'react'

// Below the 40px titleBarOverlay (electron/main.ts), where Windows draws its own
// window controls on top of everything in the DOM
export const MODAL_MIN_TOP = 44
// Fits under that, with a small margin below
export const MODAL_MAX_HEIGHT = `calc(100vh - ${MODAL_MIN_TOP + 12}px)`

export interface ModalPos { x: number; y: number }

// A window wider than the screen may slide left of 0, or its right side, where
// the close button is, could never be reached. A taller one stays at the top.
export function clampModalPos(p: ModalPos, w: number, h: number, vw: number, vh: number): ModalPos {
  const roomX = vw - w
  return {
    x: Math.min(Math.max(p.x, Math.min(0, roomX)), Math.max(0, roomX)),
    y: Math.min(Math.max(p.y, MODAL_MIN_TOP), Math.max(MODAL_MIN_TOP, vh - h)),
  }
}

// Controls inside a header stay controls: no window needs its own guard
const NOT_A_HANDLE = 'button, input, select, textarea, label, a, [data-no-drag]'

export function startModalDrag(
  e: ReactPointerEvent,
  panel: HTMLElement | null,
  from: ModalPos,
  onMove: (pos: ModalPos) => void,
  onDone?: () => void,
) {
  if (!panel || e.button !== 0 || (e.target as HTMLElement).closest(NOT_A_HANDLE)) return
  e.preventDefault()
  const { clientX: sx, clientY: sy } = e
  const { width, height } = panel.getBoundingClientRect()
  let moved = false
  const move = (ev: PointerEvent) => {
    moved = true
    onMove(clampModalPos({ x: from.x + ev.clientX - sx, y: from.y + ev.clientY - sy }, width, height, window.innerWidth, window.innerHeight))
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    if (moved) onDone?.()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}
