// ── SpeedControl ─────────────────────────────────────────────────────────────
// Three chevron speed buttons (>, >>, >>>) for Slow/Medium/Fast. Simple open
// angle-bracket strokes (not the rounded teardrop path) so they stay crisp
// chevrons rather than reading as solid triangles at small sizes.

import Tooltip from './Tooltip'

interface SpeedControlProps {
  value: 'slow' | 'med' | 'fast'
  onChange: (v: 'slow' | 'med' | 'fast') => void
  size?: number
}

const DEFAULT_H = 13

// One ">" angle-bracket stroke, viewBox 0 0 10 16
function Chevron({ x = 0 }: { x?: number }) {
  return (
    <path
      d="M2,2 L8,8 L2,14" transform={`translate(${x} 0)`}
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  )
}

const IconSlow = ({ h }: { h: number }) => (
  <svg viewBox="0 0 10 16" width={Math.round(h * 10 / 16)} height={h} fill="none" aria-hidden="true">
    <Chevron />
  </svg>
)

const IconMedium = ({ h }: { h: number }) => (
  <svg viewBox="0 0 18 16" width={Math.round(h * 18 / 16)} height={h} fill="none" aria-hidden="true">
    <Chevron />
    <Chevron x={8} />
  </svg>
)

const IconFast = ({ h }: { h: number }) => (
  <svg viewBox="0 0 26 16" width={Math.round(h * 26 / 16)} height={h} fill="none" aria-hidden="true">
    <Chevron />
    <Chevron x={8} />
    <Chevron x={16} />
  </svg>
)

const ICONS = { slow: IconSlow, med: IconMedium, fast: IconFast }
const SPEEDS: Array<['slow' | 'med' | 'fast', string]> = [
  ['slow', 'Slow'],
  ['med',  'Medium'],
  ['fast', 'Fast'],
]

// ── SpeedControl component ────────────────────────────────────────────────────
export default function SpeedControl({ value, onChange, size = DEFAULT_H }: SpeedControlProps) {
  return (
    <div className="xp-seg" data-tile role="group" aria-label="Playback speed">
      {SPEEDS.map(([v, label]) => {
        const Icon = ICONS[v]
        return (
          <Tooltip key={v} oneLine title={`Plays back at ${label.toLowerCase()} speed.`}>
            <button onClick={() => onChange(v)} aria-label={label} aria-pressed={value === v} style={{ padding: 0 }}>
              <Icon h={size} />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
