// ── StarmapRing ──────────────────────────────────────────────────────────────
// The Scales Explorer's Starmap view — drawn in place of the Circle of Fifths,
// in the same SVG space and footprint. 12 notes on a ring, C at the top,
// clockwise either by semitone (chromatic) or by fifths (C G D A E…); the
// scale's notes are bright, its home note amber, the blues "blue note"
// ringed in blue. The chord sounding now is drawn as a glowing star joining
// its notes, in the colour of its root, with its name in the centre; with no
// chord lit a faint outline joins the scale's notes.
// Each note owns a sector of the disc: hovering lights it amber, clicking
// picks that note as the key (parent decides major or minor), and a real
// button sits on its disc, for keys and screen readers. The star
// glides from chord to chord (hooks/useStarmapMorph.ts) in `morphMs`, which
// the parent keeps shorter than one progression step.

import { useEffect, useMemo, useState } from 'react'
import { getNoteName } from '../../utils/noteNames'
import { pcPoint, ringOrder, starShape, shapePoints, ringPosition, type RingLayout } from '../../utils/starmap'
import { useStarmapMorph } from '../../hooks/useStarmapMorph'
import { t } from '../../utils/i18n'
import type { NoteNaming, Accidentals } from '../../types'
import StarmapTitleMark from './StarmapTitleMark'

export interface LitChord { pcs: number[]; rootPc: number; name: string }

const R_DISC = 175      // same footprint as the Circle of Fifths' outer ring
const R_STAR = 122      // where the stars (notes) sit
const R_LABEL = 150     // note discs, outside the star
const R_NOTE = 21       // a note disc
const R_SECTOR_IN = R_STAR // hover sector = the band between the star ring and the edge, where the names are
const BLUE_NOTE = 'var(--paint-blue)'

// ── One note's sector of the disc (30°, centred on its ring position) ──────
function sectorPath(cx: number, cy: number, pos: number): string {
  const a1 = ((pos * 30 - 15 - 90) * Math.PI) / 180
  const a2 = ((pos * 30 + 15 - 90) * Math.PI) / 180
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
  return `M ${p(R_SECTOR_IN, a1)} L ${p(R_DISC, a1)} A ${R_DISC} ${R_DISC} 0 0 1 ${p(R_DISC, a2)} L ${p(R_SECTOR_IN, a2)} A ${R_SECTOR_IN} ${R_SECTOR_IN} 0 0 0 ${p(R_SECTOR_IN, a1)} Z`
}

export default function StarmapRing({
  cx, cy, layout, tonicPc, scalePcs, scaleName, blueNotePc, litChord, naming, accidentals, keyQuality, morphMs, onPickNote,
}: {
  cx: number
  cy: number
  layout: RingLayout
  tonicPc: number | null
  scalePcs: number[]
  scaleName: string
  blueNotePc: number | null
  litChord: LitChord | null
  naming: NoteNaming
  accidentals: Accidentals
  keyQuality: 'major' | 'minor'
  morphMs: number
  onPickNote: (pc: number) => void
}) {
  const [hoverPc, setHoverPc] = useState<number | null>(null)
  // sectors move when the ring order switches — drop a stale highlight
  useEffect(() => setHoverPc(null), [layout])
  const pos = (pc: number) => ringPosition(pc, layout)
  const inScale = new Set(scalePcs)
  // the star's points are ring positions, so a layout switch glides too
  const order = litChord ? starShape(litChord.pcs.map(pos)) : null
  const target = useMemo(
    () => (litChord && order ? { order, rootPc: litChord.rootPc, name: litChord.name } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order?.join(','), litChord?.rootPc, litChord?.name],
  )
  const f = useStarmapMorph(target, morphMs)
  const chordPcs = new Set(target && litChord ? litChord.pcs.map(pc => ((pc % 12) + 12) % 12) : [])
  const scaleShape = scalePcs.length >= 3 ? ringOrder(scalePcs.map(pos)) : null
  // points re-sorted round the ring every frame, so the star never crosses itself
  const pts = [...f.positions].sort((a, b) => (((a % 12) + 12) % 12) - (((b % 12) + 12) % 12))
  const r = R_STAR * f.radiusK
  const sizeFor = (n: string) => (n.length > 6 ? 22 : 32)

  return (
    <g>
      {/* Night-sky disc — same size and edge as the Circle of Fifths */}
      <circle cx={cx} cy={cy} r={R_DISC} fill="var(--ui-surface)" />
      <circle cx={cx} cy={cy} r={R_STAR - 4} fill="var(--ui-floor)" style={{ pointerEvents: 'none' }} />

      {/* Note sectors — hover lights one amber, click picks it as the key */}
      {Array.from({ length: 12 }, (_, pc) => {
        const name = getNoteName(60 + pc, naming, accidentals)
        return (
          <path key={pc} d={sectorPath(cx, cy, pos(pc))}
            fill={hoverPc === pc ? 'var(--accent-amber-medium)' : 'transparent'}
            style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
            onMouseEnter={() => setHoverPc(pc)} onMouseLeave={() => setHoverPc(h => (h === pc ? null : h))}
            onClick={() => onPickNote(pc)} />
        )
      })}

      {/* Faint outline of the scale — fades out while a chord is lit */}
      {scaleShape && (
        <polygon points={shapePoints(scaleShape, cx, cy, R_STAR)} fill="none"
          stroke="var(--line-600)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinejoin="round"
          style={{ pointerEvents: 'none', opacity: target ? 0 : 1, transition: 'opacity 0.3s ease' }} />
      )}

      {/* The chord's star — a flat tint under a crisp line; points ride the
          rim while it glides */}
      {pts.length >= 2 && f.opacity > 0 && (
        <g style={{ pointerEvents: 'none' }} opacity={f.opacity}>
          <polygon points={shapePoints(pts, cx, cy, r)} fill={f.colour} fillOpacity={0.35}
            stroke={f.colour} strokeWidth={2.5} strokeLinejoin="round" />
          {!f.settled && pts.map((p, i) => { const q = pcPoint(p, cx, cy, r); return <circle key={i} cx={q.x} cy={q.y} r={3.2} fill={f.colour} /> })}
        </g>
      )}

      {/* The 12 notes — home yellow, the scale's notes bright, the chord's
          ringed in the star's colour; the disc carries the same click */}
      {Array.from({ length: 12 }, (_, pc) => {
        const at = pcPoint(pos(pc), cx, cy, R_LABEL)
        const isTonic = pc === tonicPc
        const scaleNote = inScale.has(pc)
        const chordNote = chordPcs.has(pc)
        const name = getNoteName(60 + pc, naming, accidentals)
        return (
          <g key={pc}>
            <circle cx={at.x} cy={at.y} r={R_NOTE}
              fill={isTonic ? 'var(--accent)' : scaleNote ? 'var(--paper-card)' : 'var(--ui-floor)'}
              stroke={pc === blueNotePc ? BLUE_NOTE : chordNote ? f.colour : 'none'}
              strokeOpacity={pc === blueNotePc ? 1 : f.mix * f.opacity} strokeWidth={3} />
            <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fontSize={14}
              fontFamily="var(--font-ui)" fill={isTonic || scaleNote ? 'var(--ink)' : 'var(--ui-text-soft)'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}>{name}</text>
            <foreignObject x={at.x - R_NOTE} y={at.y - R_NOTE} width={R_NOTE * 2} height={R_NOTE * 2}>
              {/* Space belongs to the note, not to the Explorer's play shortcut */}
              <button className="xp-star-note" aria-label={t`${name} as the key`} aria-pressed={isTonic} onClick={() => onPickNote(pc)}
                onKeyDown={e => { if (e.key === ' ') e.stopPropagation() }}
                onMouseEnter={() => setHoverPc(pc)} onMouseLeave={() => setHoverPc(h => (h === pc ? null : h))} />
            </foreignObject>
          </g>
        )
      })}

      {/* Centre — the chord's name while one is lit (old and new names
          cross-fade), else the Starmap title */}
      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {f.prevName && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" opacity={1 - f.mix}
            fontSize={sizeFor(f.prevName)} fontFamily="var(--font-ui)" fill="var(--ui-text)"
          >{f.prevName}</text>
        )}
        {f.name && f.opacity > 0 && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" opacity={(f.prevName ? f.mix : 1) * f.opacity}
            fontSize={sizeFor(f.name)} fontFamily="var(--font-ui)" fill="var(--ui-text)"
          >{f.name}</text>
        )}
        <g opacity={1 - f.opacity}>
          <StarmapTitleMark cx={cx} cy={cy} width={160} fill="var(--accent)" />
        </g>
      </g>
    </g>
  )
}
