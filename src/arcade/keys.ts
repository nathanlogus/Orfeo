// ── Key presses for Arcade games, as they arrive ──────────────────────────────
// The store updates inside the MIDI handler, so this runs on the MIDI event
// itself, and never waits for a frame.
import { useStore } from '../store'
import { lastNoteStamp, lastNoteVelocity } from '../hooks/useMidiInput'
import { localizeChord } from '../utils/chordDetection'
import { menuTap, type MenuAction } from '../utils/homeMenu'
import { getNoteName } from '../utils/noteNames'

// As midiDiagnostics: a stamp this old means the keyboard isn't stamping arrivals
const MAX_PLAUSIBLE_MS = 1000

export function onKeyDown(handle: (key: number, stamp: number, held: Set<number>, velocity: number) => void): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.midiHeldKeys === prev.midiHeldKeys) return
    const now = performance.now()
    const stamp = lastNoteStamp > 0 && lastNoteStamp <= now && now - lastNoteStamp < MAX_PLAUSIBLE_MS ? lastNoteStamp : now
    for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key)) handle(key, stamp, s.midiHeldKeys, lastNoteVelocity)
  })
}

// A chord's name the way this player reads chords everywhere else in the app
export function chordLabel(name: string): string {
  const { noteNaming, accidentals, chordNamingStyle } = useStore.getState()
  return localizeChord(name, noteNaming, accidentals, chordNamingStyle) ?? name
}

// A note's name the same way
export function noteLabel(key: number): string {
  const { noteNaming, accidentals } = useStore.getState()
  return getNoteName(key, noteNaming === 'hidden' ? 'english' : noteNaming, accidentals)
}

// A chord's notes as the chord spells them, in letter names; other namings keep their own
export const spelledLabels = (keys: number[], notes: string[]) => (useStore.getState().noteNaming === 'solfege' || useStore.getState().noteNaming === 'central-european' ? keys.map(noteLabel) : notes)

// C4, D4, E4 tapped alone, as on the home menu: a chord holding one of them isn't a tap
export function onPianoTap(handle: (action: MenuAction) => void): () => void {
  let alone: number | null = null
  return useStore.subscribe((s, prev) => {
    if (s.midiHeldKeys === prev.midiHeldKeys) return
    const tap = menuTap(alone, s.midiHeldKeys, prev.midiHeldKeys)
    alone = tap.alone
    if (tap.action) handle(tap.action)
  })
}
