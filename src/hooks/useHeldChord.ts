import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { detectChordStructured, localizeChord } from '../utils/chordDetection'
import { STAR_MIN_NOTES, STAR_MAX_NOTES } from '../utils/starmap'
import type { LitChord } from '../components/Starmap/StarmapRing'
import type { NoteNaming } from '../types'

// ── A chord held on the MIDI keyboard (3–6 different notes), for an Explorer to
// show while it's held. Read a moment after the last key change so a rolled
// chord doesn't flicker through its first two notes. ─────────────────────────
export function useHeldChord(enabled: boolean, naming: NoteNaming): LitChord | null {
  const midiHeldKeys = useStore(s => s.midiHeldKeys)
  const accidentals = useStore(s => s.accidentals)
  const chordNamingStyle = useStore(s => s.chordNamingStyle)
  const [held, setHeld] = useState<LitChord | null>(null)
  useEffect(() => {
    if (!enabled) { setHeld(null); return }
    const id = setTimeout(() => {
      const pcs = new Set(Array.from(midiHeldKeys, m => m % 12))
      if (pcs.size < STAR_MIN_NOTES || pcs.size > STAR_MAX_NOTES) { setHeld(null); return }
      const found = detectChordStructured(midiHeldKeys)
      const lowest = Math.min(...midiHeldKeys) % 12
      const name = found ? (localizeChord(found.rawRootName, naming, accidentals, chordNamingStyle) ?? '') : ''
      setHeld({ pcs: Array.from(pcs), rootPc: found?.rootPitchClass ?? lowest, name })
    }, 40)
    return () => clearTimeout(id)
  }, [midiHeldKeys, enabled, naming, accidentals, chordNamingStyle])
  return held
}
