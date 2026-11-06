/**
 * FloatingKeyboard — horizontally resizable, draggable panel.
 * Height auto-fits to keyboard content — no fixed height, no empty space.
 * Width-only resize; keyboard height follows proportionally via its own ResizeObserver.
 */
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react'
import { GripVertical, ArrowDownToLine } from 'lucide-react'
import { useStore } from '../../store'
import Keyboard from './Keyboard'
import KeyboardControls, { KeyboardSizeSeg, NoteCounter } from './KeyboardControls'
import Tooltip from '../Tooltip'
import { getPianoRollCenterX, getPlaybarY } from '../../utils/modalAnchors'
import { useClampPositionOnZoom } from '../../hooks/useClampPositionOnZoom'
import { startModalDrag } from '../../utils/modalDrag'

const DEFAULT_W = 820
const MIN_W = 650
const MAX_W = 1200
const HANDLE_PX = 8

export default function FloatingKeyboard() {
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)

  // ── Default position: horizontally centered on the piano roll, bottom
  // edge aligned to the (fixed-ratio) playbar line — set once at open time,
  // never recalculated on side-panel toggle. y is finalized once height is
  // known (below); x can be computed immediately from the known default width. ──
  const [pos, setPos] = useState({ x: Math.max(0, Math.round(getPianoRollCenterX() - DEFAULT_W / 2)), y: -1 })
  const [w, setW]     = useState(DEFAULT_W)
  const panelRef      = useRef<HTMLDivElement>(null)
  const initialised   = useRef(false)
  useClampPositionOnZoom(pos, setPos, panelRef)

  const dragState = useRef<{
    type: 'resize-e' | 'resize-w'
    startX: number
    startY: number
    startW: number
    startPosX: number
    startPosY: number
  } | null>(null)

  // Set initial Y on first render so panel's bottom edge sits on the playbar line
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    const h = panelRef.current?.offsetHeight ?? 220
    setPos(p => ({ ...p, y: Math.max(44, getPlaybarY() - h) }))
  }, [])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const ds = dragState.current
    if (!ds) return

    const dx = e.clientX - ds.startX
    if (ds.type === 'resize-e') {
      setW(Math.max(MIN_W, Math.min(MAX_W, ds.startW + dx)))
    } else if (ds.type === 'resize-w') {
      const newW = Math.max(MIN_W, Math.min(MAX_W, ds.startW - dx))
      setW(newW)
      setPos(p => ({ ...p, x: ds.startPosX + (ds.startW - newW) }))
    }
  }, [])

  const onPointerUp = useCallback(() => { dragState.current = null }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const startMove = (e: React.PointerEvent) => startModalDrag(e, panelRef.current, pos, setPos)

  const startResizeE = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragState.current = { type: 'resize-e', startX: e.clientX, startY: e.clientY, startW: w, startPosX: pos.x, startPosY: pos.y }
  }

  const startResizeW = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragState.current = { type: 'resize-w', startX: e.clientX, startY: e.clientY, startW: w, startPosX: pos.x, startPosY: pos.y }
  }

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Floating virtual keyboard"
      className="pliage-modal-glow app-no-drag pr-float"
      style={{ left: pos.x, top: pos.y, width: w, maxWidth: 'calc(100vw - 16px)', userSelect: dragState.current ? 'none' : 'auto' } as CSSProperties}
    >
      {/* Left resize handle */}
      <div onPointerDown={startResizeW} style={{ touchAction: 'none', position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE_PX, cursor: 'ew-resize', zIndex: 10 }} />
      {/* Right resize handle */}
      <div onPointerDown={startResizeE} style={{ touchAction: 'none', position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE_PX, cursor: 'ew-resize', zIndex: 10 }} />

      {/* Title bar */}
      <div className="pr-float-head" onPointerDown={startMove}>
        <span className="pr-float-grip" aria-hidden="true"><GripVertical size={18} /></span>
        <div data-no-drag="true"><KeyboardSizeSeg /></div>
        <span className="pr-float-note"><NoteCounter /></span>
        <div className="o-spacer" style={{ flex: 1 }} />
        <Tooltip title="Dock keyboard" description="Reattaches the keyboard to the bottom of the window.">
          <button className="pr-paper-btn" data-no-drag="true" style={{ height: 44, padding: '0 16px', fontSize: 15 }} onClick={() => setKeyboardMode('docked')}>
            <ArrowDownToLine size={16} strokeWidth={1.8} />{'Dock keyboard'}
          </button>
        </Tooltip>
      </div>

      {/* Content — height determined by children, no flex-grow */}
      <div className="pr-float-body" data-no-drag="true">
        <Keyboard />
        <KeyboardControls />
      </div>
      <span className="pr-float-corner" aria-hidden="true" />
    </div>
  )
}
