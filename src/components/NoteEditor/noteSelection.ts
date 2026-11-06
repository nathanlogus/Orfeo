import { NES } from '../../utils/noteEditorState'
import { cmdAddNote, cmdRemoveNotes, type NoteCommand, type ToneNote } from '../../utils/noteEditorCommands'
import type { Hand } from '../../types'

// ── The notes selected on the roll ───────────────────────────────────────────
// A plain Set to PianoRoll, which adds and removes notes all over its pointer
// handlers; every change also tells the docked toolbar, which shows the count.
class NoteSelection extends Set<ToneNote> {
  version = 0
  private listeners = new Set<() => void>()
  private changed() {
    this.version++
    this.listeners.forEach(fn => fn())
  }
  add(note: ToneNote) {
    const before = this.size
    super.add(note)
    if (this.size !== before) this.changed()
    return this
  }
  delete(note: ToneNote) {
    const had = super.delete(note)
    if (had) this.changed()
    return had
  }
  clear() {
    if (this.size === 0) return
    super.clear()
    this.changed()
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  getVersion = () => this.version
}

export const noteSelection = new NoteSelection()

// One hand if every selected note has it, 'mixed' if not, null with none selected
export function selectionHand(notes: Iterable<ToneNote> = noteSelection): Hand | 'mixed' | null {
  let hand: Hand | undefined | null = null
  for (const n of notes) {
    const h = (n as any).hand as Hand | undefined
    if (hand === null) hand = h
    else if (h !== hand) return 'mixed'
  }
  if (hand === null) return null
  return hand ?? 'mixed'
}

// ── Sets hand + handSource:'manual' on every selected note, undoable through the
// normal Ctrl+Z stack (the only way back to the algorithm's guess). 'manual' is
// what makes the correction stick: a later Split partitions manual notes by tag
// instead of recomputing them, and no future assignHands() run overwrites them.
// Visual only: never touches audio scheduling. ───────────────────────────────
export function assignSelectedHand(hand: Hand) {
  if (noteSelection.size === 0) return
  const before = [...noteSelection].map(n => ({
    note: n,
    hand: (n as any).hand,
    handConfidence: (n as any).handConfidence,
    handSource: (n as any).handSource,
  }))
  const count = before.length
  const cmd = {
    description: count === 1 ? `Assign ${hand === 'L' ? 'left' : 'right'} hand` : `Assign ${hand === 'L' ? 'left' : 'right'} hand to ${count} notes`,
    apply() {
      for (const b of before) {
        ;(b.note as any).hand = hand
        ;(b.note as any).handConfidence = 1
        ;(b.note as any).handSource = 'manual'
      }
    },
    revert() {
      for (const b of before) {
        ;(b.note as any).hand = b.hand
        ;(b.note as any).handConfidence = b.handConfidence
        ;(b.note as any).handSource = b.handSource
      }
    },
  }
  cmd.apply()
  NES.history.push(cmd)
  NES.dirty            = true
  NES.needsFlatRebuild = true
  NES.onHistoryChange?.()
}

// ── Edits of the selection itself, for the toolbar's buttons (a tablet has no
// keys) and the Delete key. They reach notes anywhere in the song: the sheet can
// select one the roll isn't showing. ─────────────────────────────────────────
const MAX_MIDI = 127
const trackOf = (note: ToneNote) => NES.editMidi?.tracks.find(t => t.notes.includes(note))

function commit(cmd: NoteCommand) {
  cmd.apply()
  NES.history.push(cmd)
  NES.syncEditedNotes()
  NES.dirty            = true
  NES.needsFlatRebuild = true
  NES.onHistoryChange?.()
}

type Placement = Pick<ToneNote, 'midi' | 'ticks' | 'durationTicks'>
function changeSelected(description: string, change: (note: Placement) => Placement) {
  if (noteSelection.size === 0) return
  const notes = [...noteSelection]
  const place = (to: Placement[]) => {
    notes.forEach((n, i) => Object.assign(n, to[i]))
    for (const n of notes) trackOf(n)?.notes.sort((a, b) => a.ticks - b.ticks)
  }
  const before = notes.map(({ midi, ticks, durationTicks }) => ({ midi, ticks, durationTicks }))
  const after = before.map(change)
  commit({ description, touched: notes, apply: () => place(after), revert: () => place(before) })
}

// One step of the quantize grid, in the note value its button names
const gridStep = () => (NES.editMidi!.header.ppq * 4) / NES.quantizeDivisorRef.current

export function repitchSelected(by: number) {
  changeSelected(`Repitch note: ${by > 0 ? 'up' : 'down'}`, n => ({ ...n, midi: Math.max(0, Math.min(MAX_MIDI, n.midi + by)) }))
  const first = noteSelection.values().next().value
  if (first) (window as any).__pliagePlayNote?.(first.midi)
}

export function moveSelected(steps: number) {
  if (!NES.editMidi) return
  const by = steps * gridStep()
  changeSelected(noteSelection.size === 1 ? 'Move note' : `Move ${noteSelection.size} notes`, n => ({ ...n, ticks: Math.max(0, n.ticks + by) }))
}

export function resizeSelected(steps: number) {
  if (!NES.editMidi) return
  const by = steps * gridStep()
  changeSelected('Resize length', n => ({ ...n, durationTicks: Math.max(Math.min(gridStep(), n.durationTicks), n.durationTicks + by) }))
}

export function deleteSelectedNotes() {
  const byTrack = new Map<ReturnType<typeof trackOf>, ToneNote[]>()
  for (const n of noteSelection) byTrack.set(trackOf(n), [...(byTrack.get(trackOf(n)) ?? []), n])
  byTrack.delete(undefined)
  for (const [track, notes] of byTrack) {
    for (const n of notes) { NES.newNotes.delete(n); noteSelection.delete(n) }
    commit(cmdRemoveNotes(track!, notes))
  }
}

// A copy of the last selected note right after it, selected in its place, so the
// arrows take it where it belongs. It keeps the hand, or a hint saved for its
// track wouldn't line up with the track's notes (handMetadata.ts).
export function addAfterSelected() {
  const source = [...noteSelection].sort((a, b) => a.ticks - b.ticks).at(-1) as any
  const track = source && trackOf(source)
  if (!track) return
  const before = new Set(track.notes)
  const cmd = cmdAddNote(track, { midi: source.midi, ticks: source.ticks + source.durationTicks, durationTicks: source.durationTicks, velocity: source.velocity })
  cmd.apply()
  const added = track.notes.find((n: ToneNote) => !before.has(n)) as any
  cmd.revert()
  added.hand = source.hand
  added.handConfidence = source.handConfidence
  added.handSource = source.handSource
  NES.newNotes.add(added)
  commit(cmd)
  noteSelection.clear()
  noteSelection.add(added)
}
