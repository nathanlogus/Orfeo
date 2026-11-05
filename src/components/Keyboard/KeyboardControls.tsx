import { useMemo, useState, useEffect, useRef, type CSSProperties } from 'react'
import { useStore } from '../../store'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { stepEvents } from '../../utils/stepThrough'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import type { KeyboardSize } from '../../types'
import { getWhiteKeys, noteToLeftPct, computeTaggedBoundaryCurve, interpolateTaggedCurve, type TaggedBoundarySample } from '../../utils/handBoundaries'

// Exponential ease toward the curve's raw target — smooths the line's motion
// between 0.25s samples instead of visibly stepping. Reaches ~90% of the way
// there in ~200ms at 60fps.
const SMOOTHING_FACTOR = 0.15

const SIZES: KeyboardSize[] = [61, 73, 88]

// ── Smooth the raw curve boundary (in keyboard-%) toward its target every
// frame — a plain per-sample lookup would visibly jump every 0.25s. Null
// target collapses immediately (no phantom glide when the line should just
// disappear because there's no two-hand texture right now).
function useSmoothedPct(rawPct: number | null): number | null {
  const rawRef = useRef(rawPct)
  rawRef.current = rawPct
  const displayedRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const [smoothed, setSmoothed] = useState<number | null>(null)

  useEffect(() => {
    function tick() {
      const raw = rawRef.current
      if (raw === null) {
        displayedRef.current = null
      } else if (displayedRef.current === null) {
        displayedRef.current = raw
      } else {
        displayedRef.current += (raw - displayedRef.current) * SMOOTHING_FACTOR
      }
      setSmoothed(displayedRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [])

  return smoothed
}

// ── Under the keys: the moving split line from stored hand tags, while it has
// something to show (beta). Key size, dock and Presentation moved to Setup, the
// floating keyboard's head and the transport row. ───────────────────────────
export default function KeyboardControls() {
  const keyboardSize  = useStore((s) => s.keyboardSize)
  const presentationMode    = useStore((s) => s.presentationMode)
  const showHandLabels          = useStore((s) => s.showHandLabels)
  const handLabelMode           = useStore((s) => s.handLabelMode)
  const midi                    = useStore((s) => s.midi)
  const currentTime             = useStore((s) => s.currentTime)

  // ── Practice mode: moving boundary from stored hand tags, sliding-window
  // averaged (not one static whole-file number) — see computeTaggedBoundaryCurve.
  // (Performance mode's indicator lives on the keys themselves — Keyboard.tsx —
  // reading each active note's own tag; nothing to render in this bar for it.)
  const whiteKeys = useMemo(() => getWhiteKeys(keyboardSize), [keyboardSize])
  const [taggedCurve, setTaggedCurve] = useState<TaggedBoundarySample[]>([])
  useEffect(() => { setTaggedCurve(computeTaggedBoundaryCurve(midi)) }, [midi])
  const rawBoundary = useMemo(() => interpolateTaggedCurve(taggedCurve, currentTime), [taggedCurve, currentTime])
  const rawPct = rawBoundary !== null ? noteToLeftPct(rawBoundary, whiteKeys) : null
  const smoothedPct = useSmoothedPct(rawPct)

  if (!showHandLabels || handLabelMode !== 'practice' || presentationMode || smoothedPct === null) return null
  const label: CSSProperties = { position: 'absolute', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: 'var(--text-xs)', userSelect: 'none' }
  return (
    <div className="pr-handline">
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: `${smoothedPct}%`, background: 'var(--accent)' }} />
      <div style={{ ...label, left: 0, width: `${smoothedPct}%`, justifyContent: 'flex-end', paddingRight: 6 }}>{t`Left hand`}</div>
      <div style={{ ...label, left: `${smoothedPct}%`, right: 0, paddingLeft: 8 }}>{t`Right hand`}</div>
    </div>
  )
}

// ── Key count, on the floating keyboard's head ───────────────────────────────
export function KeyboardSizeSeg() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  return (
    <div className="o-seg" role="group" aria-label={t`Keys`}>
      {SIZES.map((size) => (
        <button key={size} aria-pressed={keyboardSize === size} aria-label={`Switch to ${size}-key layout`} onClick={() => setKeyboardSize(size)}>{size}</button>
      ))}
    </div>
  )
}

// ── Shows total note + track count when a file is loaded ─────────────────────
export function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return <>{midi.tracks.length} {midi.tracks.length === 1 ? 'track' : 'tracks'} · {midi.noteCount.toLocaleString()} notes</>
}

// ── Step Through, on the roll: same as ← / → (Shift: a bar) ──────────────────
export function StepPill() {
  const enabled = useStore(s => s.stepThroughEnabled)
  const hasSong = useStore(s => !!s.midi)
  if (!enabled) return null
  return (
    <div role="group" aria-label={t`Step Through`} className="pr-step-pill touch-hit" data-instant>
      <StepArrow dir={-1} enabled={hasSong} />
      <span>{t`Step`}</span>
      <StepArrow dir={1} enabled={hasSong} />
    </div>
  )
}

function StepArrow({ dir, enabled }: { dir: 1 | -1; enabled: boolean }) {
  const Icon = dir === 1 ? ArrowRight : ArrowLeft
  return (
    <Tooltip title={dir === 1 ? t`Next note or chord (Shift+→ next bar)` : t`Previous note or chord (Shift+← previous bar)`} oneLine>
      <button
        type="button"
        aria-label={dir === 1 ? t`Next note or chord` : t`Previous note or chord`}
        disabled={!enabled}
        onClick={(e) => { stepEvents(dir, e.shiftKey); e.currentTarget.blur() }}
      >
        <Icon size={18} strokeWidth={2} />
      </button>
    </Tooltip>
  )
}
