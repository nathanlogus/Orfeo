import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

// A list hanging off a pill in the Explorers. Portalled, because the window's
// overflow would clip it; opens upward when the pill sits low on the screen.
export default function ExplorerMenu({ trigger, width, onClose, children }: {
  trigger: RefObject<HTMLElement | null>
  width: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !trigger.current?.contains(target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, trigger])

  const r = trigger.current?.getBoundingClientRect()
  if (!r) return null
  const vh = window.innerHeight
  const below = vh - r.bottom
  const up = below < 240 && r.top > below
  return createPortal(
    <div
      ref={ref}
      className="theme-paper xp-menu amber-scroll"
      style={{
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.min(340, (up ? r.top : below) - 12),
        ...(up ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
