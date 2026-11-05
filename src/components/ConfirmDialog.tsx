// ── ConfirmDialog — themed confirm/alert modal, portal-rendered ───────────────
// Mount <ConfirmDialogHost /> once in App.tsx; it renders nothing when idle.
// Trigger via confirmDialog() from confirmController.ts (imperative API).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert } from 'lucide-react'
import { subscribeConfirm, type ConfirmState } from '../utils/confirmController'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDraggableDialog, dialogFitsScreen } from '../hooks/useDraggableDialog'
import '../styles/redesign-settings.css'

// ── ConfirmDialogHost ─────────────────────────────────────────────────────────
// Always-mounted; renders a modal only when a confirmDialog() call is pending.
export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState | null>(null)

  useEffect(() => subscribeConfirm(setState), [])

  // ── Escape key dismisses as the safe (last) button ───────────────────────
  useEffect(() => {
    if (!state) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.resolve(state.buttons.length - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state])

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, !!state)
  const { onDragStart, placed, reset } = useDraggableDialog(panelRef)
  useEffect(() => { if (state) reset() }, [state, reset])

  if (!state) return null

  const safeIndex = state.buttons.length - 1
  const Icon = state.icon ?? CircleAlert

  return createPortal(
    <div
      className="o-scrim"
      style={{ zIndex: 99999 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) state.resolve(safeIndex) }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={state.title || 'Confirm'}
        className="orfeo-modal-glow theme-paper o-window"
        style={{ width: 'min(480px, calc(100vw - 32px))', ...dialogFitsScreen, ...placed }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {Icon && <span className="confirm-disc" onPointerDown={onDragStart}><Icon size={22} strokeWidth={1.8} aria-hidden /></span>}
        {/* The title's row moves the window; a titleless dialog drags by its message */}
        {state.title
          ? <h2 className="o-title o-window-head" onPointerDown={onDragStart}>{state.title}</h2>
          : null}
        <div
          onPointerDown={state.title ? undefined : onDragStart}
          className={state.title ? 'o-note' : 'o-window-head'}
          style={state.title ? { fontSize: 'var(--text-md)' } : { fontSize: 'var(--text-xl)', lineHeight: 1.2 }}
        >
          {state.message}
        </div>
        {state.detail && <div className="o-note" style={{ fontSize: 'var(--text-md)', whiteSpace: 'pre-line' }}>{state.detail}</div>}
        {/* Drawn as [Discard] <spacer> [Cancel] [Save], but kept in caller order in the
            DOM: focus and Enter still land on button 0, as callers expect */}
        <div className="o-window-actions">
          <span className="o-spacer" style={{ order: 1 }} />
          {state.buttons.map((label, i) => {
            const isPrimary     = i === 0
            const isDestructive = i === state.destructiveIndex
            return (
              <button
                key={i}
                onClick={() => state.resolve(i)}
                className={isPrimary ? 'o-btn-primary o-btn-lg' : isDestructive ? 'o-btn-quiet' : 'o-btn o-btn-lg'}
                style={{ order: isPrimary ? 3 : isDestructive ? 0 : 2 }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
