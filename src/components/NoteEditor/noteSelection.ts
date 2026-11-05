import { NES } from '../../utils/noteEditorState'
import type { ToneNote } from '../../utils/noteEditorCommands'
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
