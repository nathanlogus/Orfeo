import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// ── ContextMenu — shared shell for right-click popups (Library's file/folder
// menus). A paper card, wherever it opens. Click-anchored and
// dismissed by the caller (outside-click/Escape) — that logic stays with the
// caller since it already owns the open/closed state. ───────────────────────

export interface ContextMenuProps {
  x: number
  y: number
  minWidth?: number
  ariaLabel: string
  children: ReactNode
  /** Extra class on the menu's own (fixed-position) box — e.g. "app-no-drag"
   * when the caller sits inside an Electron `app-drag-region`. Applied here
   * rather than via a wrapping element so the menu, which is `position:
   * fixed` and therefore out of normal flow, stays out of flow — a wrapping
   * block div would re-enter flow and could shift a parent's layout (e.g.
   * a CSS Grid parent's track sizing/auto-placement). */
  className?: string
}

/** Where a menu opened at (x, y) goes so it's fully on screen: downwards and to
 *  the right of the click when there's room, otherwise upwards / to the left,
 *  and never closer than `margin` to the window's edges */
export function placeMenu(x: number, y: number, w: number, h: number, vw: number, vh: number, margin = 8): { left: number; top: number } {
  const left = x + w > vw - margin ? x - w : x
  const top = y + h > vh - margin ? y - h : y
  return {
    left: Math.max(margin, Math.min(left, vw - margin - w)),
    top: Math.max(margin, Math.min(top, vh - margin - h)),
  }
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { x, y, minWidth = 160, ariaLabel, children, className }, ref,
) {
  // measured before it's painted: a menu near the bottom of the window opens upwards
  const own = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = own.current
    if (el) setPos(placeMenu(x, y, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight))
  }, [x, y])
  const setRef = (el: HTMLDivElement | null) => {
    own.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  return (
    <div
      ref={setRef}
      role="menu"
      aria-label={ariaLabel}
      className={className ? `pliage-modal-glow theme-paper ${className}` : 'pliage-modal-glow theme-paper'}
      style={{
        position: 'fixed', top: pos.top, left: pos.left,
        background: 'var(--ui-surface)', border: '1px solid var(--ui-line)',
        borderRadius: 'var(--radius-lg)',
        zIndex: 9500, minWidth, overflow: 'hidden', padding: 6,
        '--_modal-shadow': 'var(--elevation-popover)',
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
})

export function ContextMenuItem({ onClick, disabled, danger, children }: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button role="menuitem" className="o-menu-item" data-danger={danger || undefined} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Dismissal for menus that live in the top bar — clicks on its window-drag
// area never reach the page at all, so besides outside-click / Esc / focus
// loss the menu also closes shortly after the pointer leaves it. ─────────
export function useMenuDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    let leaveTimer: ReturnType<typeof setTimeout> | null = null
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onMove = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null } }
      else if (!leaveTimer) leaveTimer = setTimeout(close, 900)
    }
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDown, true)
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('blur', close)
    }, 0)
    return () => {
      clearTimeout(id); if (leaveTimer) clearTimeout(leaveTimer)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
    }
  // close is expected to be stable in intent; re-binding on identity is harmless
  }, [open, ref, close])
}

export function ContextMenuDivider() {
  return <div role="separator" style={{ height: 1, margin: '4px 8px', background: 'var(--ui-line-soft)' }} />
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '6px 12px 2px', fontSize: 'var(--text-sm)', color: 'var(--ui-text-soft)' }}>
      {children}
    </div>
  )
}
