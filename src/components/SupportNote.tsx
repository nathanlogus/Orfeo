import { useRef } from 'react'
import { Heart, X } from 'lucide-react'
import { useSupportNote, requestStoreReview, closeSupportNote } from '../hooks/useSupportNote'
import { useDraggableDialog, dialogFitsScreen } from '../hooks/useDraggableDialog'
import Tooltip from './Tooltip'
import { t } from '../utils/i18n'
import '../styles/redesign-settings.css'

// ── "Enjoying Pliage?" — a small note in the corner every 5th launch (see
// hooks/useSupportNote.ts), switchable in Settings › Appearance.
//   Store build: offers the Store's own review window — Rate Pliage · Later ·
//     Don't show again; rating or "Don't show again" ends it for good.
//   Every other build: Review · Join the community · Sponsor, and "Disable
//     for 30 days"; the × waits for the next 5th launch. ─────────────────────
const REVIEW_URL = 'https://alternativeto.net/software/orfeo/about/'
const COMMUNITY_URL = 'https://www.reddit.com/r/Orfeo_Piano/'
const SPONSOR_URL = 'https://ko-fi.com/squarebow'

// Reddit's logo (Simple Icons, CC0) — Lucide has no brand icons
function RedditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z" />
    </svg>
  )
}

export function SupportNote() {
  const open = useSupportNote((s) => s.noteOpen)
  const store = useSupportNote((s) => s.preview?.store ?? s.store)
  const panelRef = useRef<HTMLDivElement>(null)
  const { onDragStart, placed } = useDraggableDialog(panelRef)
  if (!open) return null
  const visit = (url: string) => { closeSupportNote('later'); window.electronAPI.openExternal(url) }
  return (
    <div ref={panelRef} role="dialog" aria-label={t`Enjoying Pliage?`} className="pliage-modal-glow theme-studio note-panel" style={{ ...dialogFitsScreen, ...placed }}>
      <div className="o-disc" style={{ right: -40, top: -40, width: 140, height: 140 }} aria-hidden="true" />
      <div className="o-triangle" style={{ right: 70, top: 30, width: 40, height: 36 }} aria-hidden="true" />
      <Tooltip title={t`Close`} oneLine placement="top" wrapperStyle={{ position: 'absolute', right: 12, top: 12 }}>
        <button onClick={() => closeSupportNote('later')} aria-label={t`Close`} className="note-close"><X size={16} strokeWidth={2} /></button>
      </Tooltip>
      <div onPointerDown={onDragStart} className="o-window-head" style={{ paddingTop: 56 }}>
        <h2 className="o-title">{t`Enjoying Pliage?`}</h2>
      </div>
      {store ? (
        <>
          <p className="note-text">{t`Pliage is here to make your musical journey a little more enjoyable, one note at a time. A rating in the Microsoft Store helps other musicians find it, and it only takes a moment.`}</p>
          <button className="o-btn-primary o-btn-lg" onClick={() => void requestStoreReview()}>{t`Rate Pliage`}</button>
          <div className="note-links">
            <button className="o-link" onClick={() => closeSupportNote('later')}>{t`Later`}</button>
            <button className="o-link" onClick={() => closeSupportNote('never')}>{t`Don't show again`}</button>
          </div>
        </>
      ) : (
        <>
          <p className="note-text">{t`Pliage is here to make your musical journey a little more enjoyable, one note at a time. It's free and made by one musician. Here's how you can help it grow.`}</p>
          <button className="o-btn-primary o-btn-lg" onClick={() => visit(REVIEW_URL)}>{t`Review`}</button>
          <div className="note-pair">
            <button className="o-btn" onClick={() => visit(SPONSOR_URL)}><Heart size={16} strokeWidth={1.75} />{t`Sponsor`}</button>
            <button className="o-btn" onClick={() => visit(COMMUNITY_URL)}><RedditIcon />{t`Join the community`}</button>
          </div>
          <div className="note-links">
            <button className="o-link" onClick={() => closeSupportNote('snooze')}>{t`Disable for 30 days`}</button>
          </div>
        </>
      )}
    </div>
  )
}
