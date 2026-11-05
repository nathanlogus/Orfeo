// ── ExplorerOctaveControl ────────────────────────────────────────────────────
// "Octave ˄ ˅ ↺" — moves everything the Chord and Scales Explorers play up or
// down by whole octaves (shared setting, so both explorers stay in step).
// Whatever's lit on the keyboard right now moves with it.

import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import Tooltip from './Tooltip'
import { t } from '../utils/i18n'
import { EXPLORER_OCTAVE_MIN, EXPLORER_OCTAVE_MAX, shiftNotesByOctaves } from '../utils/explorerShared'

// showLabel: false where the surrounding layout already names the control.
export default function ExplorerOctaveControl({ showLabel = true }: { showLabel?: boolean }) {
  const octave = useStore(s => s.explorerOctave)

  const moveTo = (next: number) => {
    const clamped = Math.max(EXPLORER_OCTAVE_MIN, Math.min(EXPLORER_OCTAVE_MAX, next))
    const state = useStore.getState()
    const delta = clamped - state.explorerOctave
    if (delta === 0) return
    state.setExplorerOctave(clamped)
    if (state.explorerKeys.size === 0) return
    const notes = Array.from(state.explorerKeys)
    const shifted = shiftNotesByOctaves(notes, delta)
    if (!shifted) return
    const colors = new Map<number, string>()
    notes.forEach((m, i) => { const c = state.explorerKeyColors.get(m); if (c) colors.set(shifted[i], c) })
    state.setExplorerKeys(new Set(shifted), colors)
  }

  return (
    <div className="xp-row-ctl">
      {showLabel && <span className="xp-note">{t`Octave`}</span>}
      <Tooltip oneLine title={t`Octave up`}>
        <button className="o-icon-btn" aria-label={t`Octave up`} onClick={() => moveTo(octave + 1)} disabled={octave >= EXPLORER_OCTAVE_MAX}><ChevronUp size={18} /></button>
      </Tooltip>
      <Tooltip oneLine title={t`Octave down`}>
        <button className="o-icon-btn" aria-label={t`Octave down`} onClick={() => moveTo(octave - 1)} disabled={octave <= EXPLORER_OCTAVE_MIN}><ChevronDown size={18} /></button>
      </Tooltip>
      <Tooltip oneLine title={t`Reset octave`}>
        <button className="o-icon-btn" aria-label={t`Reset octave`} onClick={() => moveTo(0)} disabled={octave === 0}><RotateCcw size={15} /></button>
      </Tooltip>
    </div>
  )
}
