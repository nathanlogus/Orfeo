import { useRef, useState, useEffect, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Volume2, VolumeX } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { touchScreen } from '../utils/touchScreen'
import { TooltipBox } from './Tooltip'

// ── Bar geometry — signal-strength style: N vertical bars of ascending
// height, dot-sized at the left growing to full height at the right. Bars
// up to the current volume level are filled amber; the rest are dim
// outlines. ────────────────────────────────────────────────────────────────
const BAR_COUNT = 10
const BAR_W     = 3
const BAR_GAP   = 2
const BAR_MIN_H = 3
const BAR_MAX_H = 16
const TRACK_W   = BAR_COUNT * BAR_W + (BAR_COUNT - 1) * BAR_GAP

// ── VolumeKnob — ascending signal-bars slider for master volume control ──────
// (Kept the filename/export name — TopBar.tsx imports it as VolumeKnob and
// this is still the same "master volume control in the header" slot, just
// redrawn to fit the row: first a filled pill, now ascending bars per the
// requested signal-strength look.)
export default function VolumeKnob() {
  return touchScreen ? <TouchVolume /> : <BarsVolume />
}

const POPOVER_W = 344

// ── A finger needs more than a 48px strip of bars: a speaker button with the
// level on it, opening a big native slider. Portaled because the top bar clips
// overflow; the scrim behind it takes the tap that closes it, so that tap
// can't also land on whatever is underneath. ─────────────────────────────────
function TouchVolume() {
  const masterVolume    = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const pct = Math.round(masterVolume * 100)
  const Icon = pct === 0 ? VolumeX : Volume2

  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAnchor(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchor])

  return (
    <>
      <button
        className="app-no-drag touch-volume"
        aria-label={t`Volume ${pct}%`}
        aria-expanded={!!anchor}
        onClick={e => setAnchor(e.currentTarget.getBoundingClientRect())}
      >
        <Icon size={24} strokeWidth={1.5} />
        <span>{pct}%</span>
      </button>
      {anchor && createPortal(
        <div className="touch-volume-scrim" onClick={() => setAnchor(null)}>
          <div
            role="dialog"
            aria-label={t`Volume`}
            className="touch-volume-pop orfeo-modal-glow"
            onClick={e => e.stopPropagation()}
            style={{
              top: anchor.bottom + 8,
              left: Math.max(8, Math.min(anchor.left + anchor.width / 2 - POPOVER_W / 2, window.innerWidth - POPOVER_W - 8)),
              width: POPOVER_W,
              '--_modal-shadow': 'var(--elevation-popover)',
            } as CSSProperties}
          >
            <div className="touch-volume-head">
              <span>{t`Volume`}</span>
              <strong>{pct}%</strong>
            </div>
            <input
              type="range" min={0} max={100} step={1} value={pct}
              aria-label={t`Volume`}
              className="orfeo-slider-amber orfeo-slider-big"
              onChange={e => setMasterVolume(Number(e.target.value) / 100)}
              style={{ '--fill': `${pct}%` } as CSSProperties}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function BarsVolume() {
  const masterVolume    = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)
  const draggingRef     = useRef(false)
  const trackRef        = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // ── Same "hover OR dragging" combined-visibility pattern as MasterStrip's
  // Master Volume knob tooltip — a separate hover-only Tooltip plus a
  // separate isDragging-only box would show two overlapping readouts at
  // once while actually dragging, since the mouse stays over the track the
  // whole time. One TooltipBox with `visible: hover || isDragging` avoids
  // that entirely. ──────────────────────────────────────────────────────
  const [hover, setHover] = useState(false)

  // ── Convert mouse X to volume via track-relative fraction ────────────────
  const getVolumeFromMouse = useCallback((e: MouseEvent): number => {
    if (!trackRef.current) return masterVolume
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }, [masterVolume])

  // ── Mouse down — snaps volume to click position immediately on press ────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    setMasterVolume(getVolumeFromMouse(e.nativeEvent))
  }, [getVolumeFromMouse, setMasterVolume])

  // ── Global mouse tracking while dragging ─────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setMasterVolume(getVolumeFromMouse(e))
    }
    const onUp = () => { draggingRef.current = false; setIsDragging(false) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [getVolumeFromMouse, setMasterVolume])

  const pct = Math.round(masterVolume * 100)
  const activeBars = Math.round(masterVolume * BAR_COUNT)

  return (
    // ── Real-flow column — [bars, label] stacked, same shape as its row
    // siblings (BAR COUNTER/TIME SIGNATURE/METRONOME/MIDI). alignSelf is
    // left to inherit the row's `alignItems:'flex-end'`, so this column's
    // bottom (the label) lines up with theirs exactly like every other
    // column does — no centering override, no absolutely-positioned label
    // trying to fake the same alignment from outside the flow. ───────────
    <div
      className="app-no-drag"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px', flexShrink: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{
          width: TRACK_W, height: BAR_MAX_H,
          display: 'flex', alignItems: 'flex-end', gap: BAR_GAP,
          cursor: 'pointer', flexShrink: 0, position: 'relative',
        }}
      >
        <TooltipBox
          anchorRect={(hover || isDragging) ? trackRef.current?.getBoundingClientRect() ?? null : null}
          content={{ title: 'Volume', description: `${pct}%` }}
          placement="left"
          visible={hover || isDragging}
          readout={isDragging}
        />
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const h      = BAR_MIN_H + (BAR_MAX_H - BAR_MIN_H) * (i / (BAR_COUNT - 1))
          const active = i < activeBars
          return (
            <div key={i} style={{
              width: BAR_W, height: h, borderRadius: BAR_W / 2,
              background: active ? 'var(--text-amber)' : 'var(--state-disabled)',
            }} />
          )
        })}
      </div>
      <span style={{
        color: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1,
        marginTop: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>
        Volume
      </span>
    </div>
  )
}
