import { useStore } from '../store'
import { miniKeyboardRange } from '../utils/miniKeyboard'
import PianoKeys from './Keyboard/PianoKeys'

// The real keyboard is behind a full-screen Explorer: this lights the same keys,
// in the same "accent root" rule. `held`: notes played on a piano, shown instead.
export default function ExplorerMiniKeyboard({ label, held }: { label: string; held?: number[] }) {
  const explorerKeys = useStore(s => s.explorerKeys)
  const keyColors = useStore(s => s.explorerKeyColors)
  const notes = held ?? Array.from(explorerKeys)
  const lit = new Set(notes)
  const { low, high } = miniKeyboardRange(notes)
  const state = (midi: number) => !lit.has(midi) ? undefined : !held && keyColors.get(midi) === 'var(--accent-root)' ? 'root' : 'on'
  return <PianoKeys min={low} max={high - 1} className="xp-mini" role="img" aria-label={label} keyProps={midi => ({ 'data-lit': state(midi) })} />
}
