import { getGMGroup } from './gmInstruments'
import { HAND_ASSIGN_GROUPS } from './keyboardGroups'

// ── Score view source ─────────────────────────────────────────────────────
// A notation file's bytes, kept for the score view after import has turned
// them into MIDI. midiPaths are every path the song can be loaded under: the
// source itself, or its _ORFEO_IMPORTED.mid copy once that exists.
export type ScoreSource = { midiPaths: string[]; bytes: Uint8Array }

export function isScoreFor(source: ScoreSource | null, midiPath: string | undefined): source is ScoreSource {
  return !!source && !!midiPath && source.midiPaths.includes(midiPath)
}

// Score view on its own: the player is reading, so nothing on screen may give
// the notes away. Their own keyboard still lights.
export function isScoreOnly(s: { scoreSource: ScoreSource | null; scoreViewMode: string; noteEditorActive: boolean; midi: unknown }): boolean {
  return s.scoreViewMode === 'score' && !s.noteEditorActive && isScoreFor(s.scoreSource, (s.midi as any)?._filePath)
}

// Key signatures count sharps (+) or flats (-), and a semitone is 7 fifths
export function transposeKeySignature(key: number, semitones: number): number {
  return (((key + 7 * semitones + 5) % 12) + 12) % 12 - 5
}

// Orfeo's tracks come from alphaTab's MIDI, so a part is known by its channels.
// A score always shows something, so hiding every track shows them all.
export function partsToShow<P extends { playbackInfo: { primaryChannel: number; secondaryChannel: number } }>(
  parts: P[],
  songTracks: { channel: number; visible: boolean }[],
): P[] {
  const shown = parts.filter(p => songTracks.some(t => t.visible && (t.channel === p.playbackInfo.primaryChannel || t.channel === p.playbackInfo.secondaryChannel)))
  return shown.length ? shown : parts
}

// ── Hands from the sheet ──────────────────────────────────────────────────
// A keyboard part on two staves is two hands: the top staff the right, the
// bottom the left. MIDI keeps no staves, so the import plays the left hand on
// channels of its own, and these are them. Runs on the same untouched file for
// the import and the score, so both arrive at the same channels. A part stays
// whole if the file has no channels to spare.
type StaffPart = {
  staves: { isPercussion: boolean }[]
  playbackInfo: { program: number; primaryChannel: number; secondaryChannel: number }
}
export function leftHandChannels<P extends StaffPart>(parts: P[]): Map<P, number[]> {
  const used = new Set([9, ...parts.flatMap(p => [p.playbackInfo.primaryChannel, p.playbackInfo.secondaryChannel])])
  const free = [...Array(16).keys()].filter(c => !used.has(c))
  const left = new Map<P, number[]>()
  for (const p of parts) {
    const isHands = p.staves.length === 2 && !p.staves.some(s => s.isPercussion) && HAND_ASSIGN_GROUPS.has(getGMGroup(p.playbackInfo.program, false))
    if (isHands && free.length >= 2) left.set(p, free.splice(0, 2))
  }
  return left
}

// The hand each staff of a keyboard part belongs to. One staff has no written
// hand, so it's fingered for the right and left uncoloured.
export function staffHands(part: StaffPart): ('L' | 'R')[] {
  if (!HAND_ASSIGN_GROUPS.has(getGMGroup(part.playbackInfo.program, false)) || part.staves.some(s => s.isPercussion)) return []
  return part.staves.length === 1 ? ['R'] : part.staves.length === 2 ? ['R', 'L'] : []
}

// Which of a part's two staves show. A song from an older import has one track
// for both hands, so its eye can only mean both.
export function stavesToShow(part: StaffPart, left: number[], songTracks: { channel: number; visible: boolean }[]): [boolean, boolean] {
  if (!songTracks.some(t => left.includes(t.channel))) return [true, true]
  const on = (channels: number[]) => songTracks.some(t => t.visible && channels.includes(t.channel))
  const right = on([part.playbackInfo.primaryChannel, part.playbackInfo.secondaryChannel])
  const leftOn = on(left)
  return right || leftOn ? [right, leftOn] : [true, true]
}

// Adds text events to a one-track MIDI file, the way Orfeo's own hints travel
export function withTextEvents(smf: Uint8Array, texts: string[]): Uint8Array {
  const bytes = texts.flatMap(t => [0, 0xFF, 0x01, t.length, ...new TextEncoder().encode(t)])
  const out = new Uint8Array(smf.length + bytes.length)
  out.set(smf.subarray(0, 22))
  out.set(bytes, 22)
  out.set(smf.subarray(22), 22 + bytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(18, view.getUint32(18) + bytes.length)
  return out
}

// The copy's name keeps only the source's stem, so its extension is unknown:
// the source is whichever notation file in the library shares that stem.
export function findImportSource<F extends { name: string; path: string }>(
  midiPath: string,
  files: F[],
  isNotation: (path: string) => boolean,
): F | null {
  const name = midiPath.split(/[\\/]/).pop() ?? ''
  const stem = name.match(/^(.+)_ORFEO_IMPORTED\.mid$/i)?.[1]
  if (!stem) return null
  return files.find(f => isNotation(f.path) && f.name.slice(0, f.name.lastIndexOf('.')) === stem) ?? null
}
