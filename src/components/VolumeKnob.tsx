import { useRef, useState, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Volume2, VolumeX } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { touchScreen } from '../utils/touchScreen'
import { TooltipBox } from './Tooltip'

// ── VolumeKnob — the master volume in the transport row ──────────────────────
export default function VolumeKnob() {
  return touchScreen ? <TouchVolume /> : <SliderVolume />
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

function SliderVolume() {
  const masterVolume    = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)
  const trackRef        = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // One TooltipBox for "hover OR dragging", so a drag never shows two readouts
  const [hover, setHover] = useState(false)
  const pct = Math.round(masterVolume * 100)
  const Icon = pct === 0 ? VolumeX : Volume2

  return (
    <div className="pr-volume" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Icon size={20} strokeWidth={1.8} aria-hidden />
      <div ref={trackRef} className="pr-volume-track">
        <TooltipBox
          anchorRect={(hover || isDragging) ? trackRef.current?.getBoundingClientRect() ?? null : null}
          content={{ title: 'Volume', description: `${pct}%` }}
          placement="left"
          visible={hover || isDragging}
          readout={isDragging}
        />
        <input
          type="range" min={0} max={100} step={1} value={pct}
          aria-label={t`Volume`} className="orfeo-slider-amber"
          onPointerDown={() => setIsDragging(true)} onPointerUp={() => setIsDragging(false)}
          onChange={e => setMasterVolume(Number(e.target.value) / 100)}
          style={{ '--fill': `${pct}%` } as CSSProperties}
        />
      </div>
    </div>
  )
}
