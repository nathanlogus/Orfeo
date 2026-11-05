import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { useMenuDismiss } from '../ContextMenu'
import { warningVisible } from '../../utils/tempoWarningRules'
import { armTapSession, fmtSongTime } from '../../utils/tapTempoSession'
import type { TrustResult } from '../../utils/tempoTrust'

// ── Tempo warning (Settings → Playback & Editing → Tempo warnings) — a
// pulsing amber dot (centred under the TAP pad when the pad is on, else on
// the Key/Transpose box's corner) when the open song's bar lines and
// metronome miss its steady beat (utils/tempoTrust.ts). Click → what's off,
// "Fix with Tap Tempo", or "It's fine, don't warn me for this song". ─────

export function warningText(r: TrustResult, tapped = false): string {
  const where = r.throughout ? t`through most of the song` : t`from ${fmtSongTime(r.from ?? 0)} onward`
  // the notes can't tell "right speed, shifted" from "double/half speed" — say so
  if (r.shifted) return t`The bar lines and metronome clicks sit off the played notes ${where}. The tempo may be right, or counted at double or half speed — tap along to check.`
  const base = t`The bar lines and metronome drift off the music's beat ${where}.`
  if (!r.hintBpm) return base + ' ' + t`Check by ear.`
  return base + ' ' + (tapped
    ? t`The beat sounds closer to about ${r.hintBpm} than your tapped ${r.fileBpm} — check by ear.`
    : t`The beat sounds closer to about ${r.hintBpm} than the file's ${r.fileBpm} — check by ear.`)
}

export function TempoWarning({ anchor }: { anchor: 'pad' | 'key' }) {
  const padOn = useStore((s) => s.tapTempoPadEnabled)
  const trust = useStore((s) => s.currentTrust)
  const key = useStore((s) => s.songKey)
  const visible = useStore((s) => warningVisible(s, s.songKey))
  const tapping = useStore((s) => !!s.tapSession)
  const hasMidi = useStore((s) => !!s.midi)
  const noteEditorActive = useStore((s) => s.noteEditorActive)
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // the outside-click that closes the panel also lands on the light — don't
  // let that same click reopen it
  const closedAt = useRef(0)
  const close = useCallback(() => { closedAt.current = performance.now(); setPanel(null) }, [])
  useMenuDismiss(!!panel, panelRef, close)

  if ((anchor === 'pad') !== padOn) return null
  if (!visible || !hasMidi || !trust?.flagged || tapping || !key) return null

  const fix = () => {
    close()
    const s = useStore.getState()
    if (!s.tapTempoPadEnabled) s.setTapTempoPadEnabled(true)
    armTapSession()
  }
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <>
      {/* Absolutely positioned — no layout width (the left top-bar group has no
          spare room at 1366 px): centred under the TAP circle, or on the
          Key/Transpose box's corner when the pad is off */}
      <Tooltip title={t`Tempo looks off`} description={t`The bar lines don't match the music's beat. Click for details.`} placement="bottom" disabled={!!panel}
        wrapperStyle={anchor === 'pad'
          // 7 px below the circle (the top-bar row has room for it, see TopBar)
          ? { position: 'absolute', top: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1 }
          : { position: 'absolute', top: -4, right: 0, zIndex: 1 }}>
        <button
          className="app-no-drag"
          aria-label={t`Tempo looks off`}
          onClick={(e) => {
            if (panel || performance.now() - closedAt.current < 250) return
            const r = e.currentTarget.getBoundingClientRect()
            setPanel({ x: Math.max(196, Math.min(r.left + r.width / 2, window.innerWidth - 196)), y: r.bottom + 8 })
          }}
          style={{ background: 'none', border: 'none', padding: anchor === 'pad' ? '0 4px' : 4, cursor: 'pointer', display: 'flex' }}
        >
          <span className="orfeo-warn-pulse" style={{ width: anchor === 'pad' ? 7 : 9, height: anchor === 'pad' ? 7 : 9, borderRadius: '50%', background: 'var(--paint-pink)' }} />
        </button>
      </Tooltip>
      {panel && createPortal(
        <div
          ref={panelRef}
          className="app-no-drag orfeo-modal-glow theme-paper xp-warn"
          role="dialog"
          aria-labelledby="xp-warn-title"
          style={{ top: panel.y, left: panel.x, maxHeight: `calc(100vh - ${panel.y + 12}px)`, '--_modal-shadow': 'none' } as React.CSSProperties}
        >
          <span className="xp-warn-tag">{t`Tempo warning`}</span>
          <h2 id="xp-warn-title">{t`Tempo looks off`}</h2>
          <p>{warningText(trust)}</p>
          <p>{t`Tap Tempo fixes this: park the playhead where it goes wrong and tap along. Your MIDI file isn't changed.`}</p>
          <button className="o-btn-primary" onMouseDown={keepFocus} disabled={noteEditorActive} onClick={fix}>{t`Fix with Tap Tempo`}</button>
          <button className="o-btn-quiet" onMouseDown={keepFocus} onClick={() => { useStore.getState().dismissTempoWarning(key); close() }}>{t`It's fine, don't warn me for this song`}</button>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Library row mark — same verdict, read from the background scan's cache ──
export function TempoWarningDot({ path, onHoverChange }: { path: string; onHoverChange?: (hovering: boolean) => void }) {
  const show = useStore((s) => warningVisible(s, s.libraryTrustIndex[path]?.songKey))
  if (!show) return null
  return (
    <Tooltip title={t`Tempo looks off`} description={t`Open it and use Tap Tempo to fix its bar lines and metronome.`} placement="right">
      <span
        aria-label={t`Tempo looks off`}
        // hide the row's own "Right-click for options" tooltip while over the dot
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--paint-pink)', flexShrink: 0, display: 'inline-block' }}
      />
    </Tooltip>
  )
}
