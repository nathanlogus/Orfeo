import { useStore } from '../store'
import { miniKeyboardLayout } from '../utils/miniKeyboard'

// The real keyboard is behind a full-screen Explorer: this lights the same keys,
// in the same "accent root" rule. `held`: notes played on a piano, shown instead.
export default function ExplorerMiniKeyboard({ label, held }: { label: string; held?: number[] }) {
  const explorerKeys = useStore(s => s.explorerKeys)
  const keyColors = useStore(s => s.explorerKeyColors)
  const notes = held ?? Array.from(explorerKeys)
  const lit = new Set(notes)
  const { whites, blacks } = miniKeyboardLayout(notes)
  const state = (midi: number) => !lit.has(midi) ? undefined : !held && keyColors.get(midi) === 'var(--accent-root)' ? 'root' : 'on'
  return (
    <div className="xp-mini" role="img" aria-label={label}>
      {whites.map(k => <i key={k.midi} data-lit={state(k.midi)} />)}
      {blacks.map(k => <b key={k.midi} data-lit={state(k.midi)} style={{ left: `${k.x}%`, width: `${62 / whites.length}%` }} />)}
    </div>
  )
}
