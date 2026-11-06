// ── Key presses for Arcade games, as they arrive ──────────────────────────────
// The store updates inside the MIDI handler, so this runs on the MIDI event
// itself, and never waits for a frame.
import { useStore } from '../store'
import { lastNoteStamp } from '../hooks/useMidiInput'
import { localizeChord } from '../utils/chordDetection'

// As midiDiagnostics: a stamp this old means the keyboard isn't stamping arrivals
const MAX_PLAUSIBLE_MS = 1000

export function onKeyDown(handle: (key: number, stamp: number, held: Set<number>) => void): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.midiHeldKeys === prev.midiHeldKeys) return
    const now = performance.now()
    const stamp = lastNoteStamp > 0 && lastNoteStamp <= now && now - lastNoteStamp < MAX_PLAUSIBLE_MS ? lastNoteStamp : now
    for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key)) handle(key, stamp, s.midiHeldKeys)
  })
}

// A chord's name the way this player reads chords everywhere else in the app
export function chordLabel(name: string): string {
  const { noteNaming, accidentals, chordNamingStyle } = useStore.getState()
  return localizeChord(name, noteNaming, accidentals, chordNamingStyle) ?? name
}
