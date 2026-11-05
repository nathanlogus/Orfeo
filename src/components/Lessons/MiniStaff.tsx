import bravuraUrl from '@coderline/alphatab/font/Bravura.woff2?url'
import { midiOf, noteParts, staffStep, tapBeats, tokenBeats } from '../../lessons/drill'
import type { Clef } from '../../lessons/course'

// ── A few notes on a staff, drawn at once so a drill never waits on engraving ──
// Glyphs are Bravura's, the font the score view uses. Positions count half
// spaces up from a staff's bottom line.
const GAP = 10
const STAFF_H = GAP * 4
const BOTTOM_LINE = { treble: staffStep('E4'), bass: staffStep('G2') }
const CLEF = { treble: { glyph: '', line: 2 }, bass: { glyph: '', line: 6 } }
const HEAD = '', SHARP = '', FLAT = ''
const SIGNATURES: Record<string, string[]> = { G: ['F#'], D: ['F#', 'C#'], F: ['Bb'], Bb: ['Bb', 'Eb'] }
const SIG_POS = { treble: { '#': [8, 5], b: [4, 7] }, bass: { '#': [6, 3], b: [2, 5] } }
const COLUMN = 44, LEFT = 44, MARGIN = 26, GRAND_GAP = 56

type Staff = 'treble' | 'bass'

const fontFace = `@font-face { font-family: 'OrfeoBravura'; src: url('${bravuraUrl}') format('woff2'); }`

function StaffNotes({ top, staff, columns, keyName, x }: { top: number; staff: Staff; columns: string[][]; keyName?: string; x: number }) {
  const y = (pos: number) => top + STAFF_H - pos * (GAP / 2)
  const signature = SIGNATURES[keyName ?? ''] ?? []
  const start = LEFT + signature.length * 10
  const sign = signature[0]?.[1] as '#' | 'b' | undefined
  return (
    <>
      {[0, 1, 2, 3, 4].map(i => <line key={i} x1={x} x2="100%" y1={top + i * GAP} y2={top + i * GAP} stroke="currentColor" strokeWidth={1} />)}
      <text x={x + 6} y={y(CLEF[staff].line)} fontSize={STAFF_H} fontFamily="OrfeoBravura" fill="currentColor">{CLEF[staff].glyph}</text>
      {signature.map((_, i) => <text key={i} x={LEFT + i * 10} y={y(SIG_POS[staff][sign!][i])} fontSize={STAFF_H} fontFamily="OrfeoBravura" fill="currentColor">{sign === '#' ? SHARP : FLAT}</text>)}
      {columns.map((notes, c) => notes.map(name => {
        const pos = staffStep(name) - BOTTOM_LINE[staff]
        const cx = start + MARGIN + c * COLUMN
        const { letter, accidental } = noteParts(name)
        const inKey = signature.includes(letter + accidental)
        const ledgers: number[] = []
        for (let p = -2; p >= pos; p -= 2) ledgers.push(p)
        for (let p = 10; p <= pos; p += 2) ledgers.push(p)
        return (
          <g key={`${c}${name}`}>
            {ledgers.map(p => <line key={p} x1={cx - 5} x2={cx + 17} y1={y(p)} y2={y(p)} stroke="currentColor" strokeWidth={1} />)}
            {accidental && !inKey && <text x={cx - 12} y={y(pos)} fontSize={STAFF_H} fontFamily="OrfeoBravura" fill="currentColor">{accidental === '#' ? SHARP : FLAT}</text>}
            <text x={cx} y={y(pos)} fontSize={STAFF_H} fontFamily="OrfeoBravura" fill="currentColor">{HEAD}</text>
          </g>
        )
      }))}
    </>
  )
}

export default function MiniStaff({ clef, columns, keyName, label }: { clef: Clef; columns: string[][]; keyName?: string; label: string }) {
  const signature = (SIGNATURES[keyName ?? ''] ?? []).length * 10
  const width = LEFT + signature + MARGIN * 2 + columns.length * COLUMN
  const top = 36
  const grand = clef === 'grand'
  const height = grand ? top * 2 + STAFF_H * 2 + GRAND_GAP : top * 2 + STAFF_H
  const pick = (test: (midi: number) => boolean) => columns.map(c => c.filter(n => test(midiOf(n))))
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width * 1.6} style={{ maxWidth: '100%', color: '#111', background: '#fff', borderRadius: 'var(--radius-md)' }}>
      <style>{fontFace}</style>
      {grand ? <>
        <StaffNotes top={top} staff="treble" columns={pick(m => m >= 60)} keyName={keyName} x={12} />
        <StaffNotes top={top + STAFF_H + GRAND_GAP} staff="bass" columns={pick(m => m < 60)} keyName={keyName} x={12} />
        <line x1={12} x2={12} y1={top} y2={top + STAFF_H * 2 + GRAND_GAP} stroke="currentColor" strokeWidth={2} />
      </> : <StaffNotes top={top} staff={clef} columns={columns} keyName={keyName} x={12} />}
    </svg>
  )
}

// ── One rhythm on a single line ──────────────────────────────────────────────
const NOTE: Record<string, string> = { w: '', h: '', q: '', e: '' }
const REST: Record<string, string> = { w: '', h: '', q: '', e: '' }
const DOT = ''
const BEAT_W = 44

export function RhythmLine({ tokens, beats, activeBeat }: { tokens: string[]; beats: number; activeBeat?: number | null }) {
  const { length } = tapBeats(tokens)
  const width = length * BEAT_W + 40, height = 92, mid = 60
  const marks: { x: number; token: string; tied: boolean }[] = []
  let at = 0
  for (const group of tokens) {
    group.split('~').forEach((token, i) => {
      marks.push({ x: 20 + at * BEAT_W, token, tied: i > 0 })
      at += tokenBeats(token)
    })
  }
  const bars = Array.from({ length: Math.floor(length / beats) + 1 }, (_, i) => 12 + i * beats * BEAT_W)
  return (
    <svg role="img" aria-label="Rhythm" viewBox={`0 0 ${width} ${height}`} width={width * 1.5} style={{ maxWidth: '100%', color: '#111', background: '#fff', borderRadius: 'var(--radius-md)' }}>
      <style>{fontFace}</style>
      <line x1={12} x2={width - 12} y1={mid} y2={mid} stroke="currentColor" strokeOpacity={0.3} />
      {bars.map(x => <line key={x} x1={x} x2={x} y1={mid - 22} y2={mid + 22} stroke="currentColor" strokeOpacity={0.5} />)}
      {activeBeat != null && <rect x={14 + activeBeat * BEAT_W} y={14} width={BEAT_W - 4} height={height - 28} fill="rgba(245, 158, 11, 0.22)" />}
      {marks.map(({ x, token, tied }, i) => {
        const rest = token.endsWith('r')
        const base = token.replace(/^d/, '')[0]
        return (
          <g key={i}>
            <text x={x} y={mid} fontSize={STAFF_H} fontFamily="OrfeoBravura" fill="currentColor">{(rest ? REST : NOTE)[base]}</text>
            {token.startsWith('d') && <text x={x + 18} y={mid} fontSize={STAFF_H} fontFamily="OrfeoBravura" fill="currentColor">{DOT}</text>}
            {tied && <path d={`M ${marks[i - 1].x + 6} ${mid + 8} Q ${(marks[i - 1].x + x) / 2 + 6} ${mid + 22} ${x + 4} ${mid + 8}`} fill="none" stroke="currentColor" strokeWidth={1.5} />}
          </g>
        )
      })}
    </svg>
  )
}

// ── Two octaves of keys, with the C's marked, for the first lesson ───────────
export function KeyMap({ highlight }: { highlight: 'c' | 'middle' }) {
  const WHITE_W = 22, HEIGHT = 96, whites = 15
  const blacks = [1, 2, 4, 5, 6, 8, 9, 11, 12, 13]
  return (
    <svg role="img" aria-label="Keyboard" viewBox={`0 0 ${whites * WHITE_W + 2} ${HEIGHT + 2}`} width={480} style={{ maxWidth: '100%' }}>
      {Array.from({ length: whites }, (_, i) => {
        const isC = i % 7 === 0
        const lit = highlight === 'middle' ? i === 7 : isC
        return <rect key={i} x={i * WHITE_W + 1} y={1} width={WHITE_W} height={HEIGHT} fill={lit ? 'var(--text-amber)' : '#fff'} stroke="#333" />
      })}
      {blacks.map(i => <rect key={i} x={i * WHITE_W + 1 - 7} y={1} width={14} height={58} fill="#111" />)}
    </svg>
  )
}
