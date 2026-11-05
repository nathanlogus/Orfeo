import { Download } from 'lucide-react'
import { t } from '../utils/i18n'
import '../styles/redesign-settings.css'

// ── Shown while a file is dragged over Orfeo. Pointer-events none, so it never
// blocks the drop underneath. ────────────────────────────────────────────────
export default function DropOverlay() {
  return (
    <div className="theme-studio drop-overlay">
      <div className="drop-frame" aria-hidden="true" />
      <span className="drop-disc"><Download size={34} strokeWidth={1.8} /></span>
      <span className="drop-title">{t`Drop to open`}</span>
      <span className="drop-note">{t`MIDI, MusicXML, Guitar Pro, Capella or karaoke.`}</span>
    </div>
  )
}
