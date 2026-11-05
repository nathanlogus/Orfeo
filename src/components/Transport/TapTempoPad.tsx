import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { ContextMenu, ContextMenuItem, ContextMenuDivider, useMenuDismiss } from '../ContextMenu'
import { confirmDialog } from '../../utils/confirmController'
import { useTapTempo } from '../../hooks/useTapTempo'
import { describeCorrection, correctionToSong, formatBarPattern, type TempoSegment } from '../../utils/tempoCorrection'
import { TempoWarning } from './TempoWarning'
import { startCountIn } from '../../utils/countInRunner'
import { useDraggableDialog } from '../../hooks/useDraggableDialog'
import '../../styles/redesign-tools.css'
import {
  armTapSession, finishFromPad, shiftPreviewDownbeat, nudgePreview,
  keepTap, tapAgain, cancelTap, registerTap, resetSongTempo, removeTappedTempo, fmtSongTime,
  editKeptTempo, toggleListenMetronome, setUseFileGrid, keepOriginal, setBarPattern, changeBarsFromHere, repeatHintsNow, tryRepeatHint,
} from '../../utils/tapTempoSession'

const NUDGE_SEC = 0.01
const MENU_WIDTH = 250

// Panel buttons never take keyboard focus — a focused button would also be
// "clicked" by the next Space press (Space is the tap / listen-back key).
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

// ── Tap Tempo pad — TAP button beside the BPM box (Settings →
// Playback & Editing → "Tap Tempo"). Click #1 starts a session from the
// playhead; taps come from Space, any MIDI key or the big TAP in the panel.
// Click #2, or Done in the panel, finishes: the song pauses
// and a panel shows the measured tempo, where the "1" sits, a fine-tune
// nudge, and Keep / Tap again / Cancel. A small amber dot on the pad means
// this song has saved tapped tempos; right-click lists them (each removable)
// and offers a full reset. ───────────────────────────────────────────────
export function TapTempoPad() {
  useTapTempo()
  const enabled = useStore((s) => s.tapTempoPadEnabled)
  const mode = useStore((s) => s.tapTempoMode)
  const midi = useStore((s) => s.midi)
  const noteEditorActive = useStore((s) => s.noteEditorActive)
  const ses = useStore((s) => s.tapSession)
  const playing = useStore((s) => s.playbackState === 'playing')
  const warningsOn = useStore((s) => s.tempoWarningsEnabled)
  const dismissed = useStore((s) => (s.songKey ? !!s.tempoWarningDismissed[s.songKey] : false))
  // in song time: a song opened with its empty bars skipped runs earlier
  const storedCorrection = useStore((s) => (s.songKey ? s.tempoCorrections[s.songKey] : undefined))
  const lead = useStore((s) => s.midi?._leadSec ?? 0)
  const correction = storedCorrection && lead ? correctionToSong(storedCorrection, lead) : storedCorrection
  const saved = describeCorrection(correction)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const padWrapRef = useRef<HTMLDivElement>(null)
  // Panel is portalled to <body> with fixed coords — TopBar clips anything
  // that hangs below it, so an absolutely-positioned child was cut off.
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { onDragStart, placed, reset: resetPanelDrag } = useDraggableDialog(panelRef)
  const sessionOpen = !!ses
  useLayoutEffect(() => {
    if (!sessionOpen) { setPanelPos(null); resetPanelDrag(); return }
    const place = () => {
      const r = padWrapRef.current?.getBoundingClientRect()
      if (r) setPanelPos({ x: r.left + r.width / 2, y: r.bottom + 6 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [sessionOpen, resetPanelDrag])

  useMenuDismiss(!!menu, menuRef, closeMenu)

  // A session must never outlive its pad (Settings toggle off, Note Editor
  // opened) — Space/MIDI keys would stay captured with no panel on screen
  const padUsable = enabled && !!midi && !noteEditorActive
  useEffect(() => { if (!padUsable && sessionOpen) cancelTap() }, [padUsable, sessionOpen])

  if (!enabled) return null
  const disabled = !midi || noteEditorActive
  const capturing = !!ses && ses.phase !== 'preview'

  const onPadDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || disabled) return
    e.preventDefault()
    if (!ses) armTapSession()
    else if (capturing) finishFromPad()
  }

  const onReset = async () => {
    setMenu(null)
    const choice = await confirmDialog({
      title: t`Reset tempo`,
      message: t`Go back to this song's own tempo and bar lines?`,
      detail: t`All tapped tempos saved for this song will be removed.`,
      buttons: [t`Reset`, t`Cancel`],
    })
    if (choice === 0) resetSongTempo()
  }

  const seg = ses?.segment ?? null
  const fittedBpm = seg ? (60 / seg.period).toFixed(1) : null
  const savedText = saved.length
    ? t`Kept for this song: ` + saved.map(x => `${x.bpm.toFixed(1)} bpm from ${fmtSongTime(x.start)}`).join(', ') + '. ' + t`Right-click to adjust or remove.`
    : ''

  const pad = (
    <button
      data-instant
      className="app-no-drag xp-tap-pad"
      data-live={ses ? '' : undefined}
      onMouseDown={onPadDown}
      onContextMenu={(e) => {
        e.preventDefault()
        if (disabled || ses) return
        const r = e.currentTarget.getBoundingClientRect()
        setMenu({ x: Math.max(8, r.left + r.width / 2 - MENU_WIDTH / 2), y: r.bottom + 6 })
      }}
      disabled={disabled}
      aria-label={t`Tap Tempo`}
    >
      {capturing ? ses!.taps.length : t`TAP`}
      {saved.length > 0 && !ses && <i aria-hidden />}
    </button>
  )

  const panelWidth = Math.min(740, window.innerWidth - 32)
  // the beat a tap just landed on: every tap in beat mode, the 1 in bar mode
  const beat = ses && ses.taps.length > 0 ? (mode === 'bar' ? 1 : ((ses.taps.length - 1) % 4) + 1) : 0

  return (
    <div ref={padWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <TempoWarning anchor="pad" />
      {/* No tooltip while a session is open — it would cover the panel */}
      {ses ? pad : (
        <Tooltip
          disabled={!!menu}
          title={t`Tap Tempo`}
          description={(savedText ? savedText + ' ' : '') + (mode === 'bar'
            ? t`Fix tempo: click, then tap SPACE on the 1. Click again when done to keep or discard.`
            : t`Fix tempo: click, then tap SPACE on every beat. Click again when done to keep or discard.`)}
          placement="bottom"
        >
          {pad}
        </Tooltip>
      )}

      {ses && panelPos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby="xp-tap-title"
          data-instant
          className="app-no-drag orfeo-modal-glow theme-studio xp-tap"
          style={{
            top: panelPos.y,
            left: Math.max(16, Math.min(panelPos.x - panelWidth / 2, window.innerWidth - panelWidth - 16)),
            maxHeight: `calc(100vh - ${panelPos.y + 12}px)`,
            ...placed,
          }}
        >
          <div className="xp-tap-head" onPointerDown={onDragStart}>
            <h2 id="xp-tap-title">{t`Tap Tempo`}</h2>
            <button className="o-btn" onMouseDown={keepFocus} onClick={cancelTap}>{t`Cancel`}</button>
          </div>
          {capturing ? (
            <>
              <div className="xp-seg" data-tile role="group" aria-label={t`How to tap`} style={{ alignSelf: 'flex-start' }}>
                <button aria-pressed={mode === 'beat'} disabled={ses.taps.length > 0} onMouseDown={keepFocus} onClick={() => setTapMode('beat')}>{t`Tap every beat · 1 2 3 4`}</button>
                <button aria-pressed={mode === 'bar'} disabled={ses.taps.length > 0} onMouseDown={keepFocus} onClick={() => setTapMode('bar')}>{t`Tap once a bar, on the 1`}</button>
              </div>
              <div className="xp-tap-row">
                <button className="xp-tap-big" aria-label={t`Tap`} onMouseDown={keepFocus} onPointerDown={registerTap}>{t`TAP`}</button>
                <div className="xp-tap-side">
                  <div className="xp-beats" role="img" aria-label={t`Beat ${beat} of 4`}>
                    {[1, 2, 3, 4].map(n => <span key={n} data-on={n === beat ? (n === 1 ? '1' : '') : undefined}>{n}</span>)}
                  </div>
                  <span className="xp-tap-status">{ses.message ?? t`Taps: ${ses.taps.length}`}</span>
                  <span className="xp-tap-note">{t`Space, the TAP pad or any key on your piano. Start on a 1, whenever you're ready.`}</span>
                </div>
              </div>
              <div className="xp-tap-actions">
                <span className="xp-tap-note" style={{ flex: 1 }}>{t`Esc cancels`}</span>
                <button className="o-btn-primary o-btn-lg" onMouseDown={keepFocus} onClick={finishFromPad}>{t`Done`}</button>
              </div>
            </>
          ) : seg && (
            <>
              <div className="xp-tap-bpm">
                {seg.map ? t`Copied bars` : <>{fittedBpm} <small>{t`bpm`} · {seg.pattern ? formatBarPattern(seg) : `${seg.beatsPerBar}/${seg.den}`}</small></>}
              </div>
              <span className="xp-tap-status">
                <span className={`o-dot ${seg.map || ses.insert || ses.editIndex != null || ses.snapped ? 'o-dot-on' : 'o-dot-warn'}`} />
                <span>
                  {seg.map ? null : t`From ${fmtSongTime(seg.start)} onward. `}
                  {seg.map ? t`Bars and tempo from ${ses.copiedFrom ?? t`another version`}. Your song's notes stay exactly as they are.`
                    : ses.insert ? t`Same tempo, new bars. What comes later stays as it is.`
                    : ses.editIndex != null ? t`Adjusting a kept tempo.`
                    : ses.snapped ? t`Lined up with the song's notes.`
                    : t`Couldn't line up with the notes here — using your taps as they are.`}
                </span>
              </span>

              <div className="xp-tap-btns">
                <button className="xp-tap-btn" style={{ background: 'var(--ink-800)', flex: '0 1 auto' }} onMouseDown={keepFocus} onClick={() => { if (playing) useStore.setState({ playbackState: 'paused' }); else if (!startCountIn()) useStore.setState({ playbackState: 'playing' }) }}>
                  {playing ? t`❚❚ Pause` : t`▶ Listen`}
                </button>
                <button className="xp-tap-btn" style={{ flex: '0 1 auto' }} aria-pressed={ses.listenMetronome !== false} onMouseDown={keepFocus} onClick={toggleListenMetronome}>
                  {ses.listenMetronome !== false ? t`Metronome: on` : t`Metronome: off`}
                </button>
              </div>

              {ses.fileMatch != null && (
                <div className="xp-tap-card">
                  <span>
                    {ses.fileMatch === 2 ? t`Your beat lands exactly on every 2nd beat of the file: its bar lines are right, it just counts twice as fast.`
                      : ses.fileMatch === 0.5 ? t`Your beat lands exactly between the file's beats: its bar lines are right, it just counts half as fast.`
                      : t`Your beat matches the file's own beat exactly: its tempo is already right here.`}
                  </span>
                  <span>{t`Bar lines`}</span>
                  <div className="xp-tap-btns">
                    <button className="xp-tap-btn" aria-pressed={!!seg.snap} onMouseDown={keepFocus} onClick={() => setUseFileGrid(true)}>{t`Keep the file's`}</button>
                    <button className="xp-tap-btn" aria-pressed={!seg.snap} onMouseDown={keepFocus} onClick={() => setUseFileGrid(false)}>{t`From my taps`}</button>
                  </div>
                </div>
              )}

              {!seg.map && <RepeatHintRow seg={seg} />}

              {seg.map ? (
                <div className="xp-tap-card">
                  <span>{t`Clicks`}</span>
                  <NudgeClicks />
                </div>
              ) : seg.snap ? (
                <span className="xp-tap-note">{t`Only the tempo number changes. The file's bar lines, time signatures and clicks stay exactly as they are.`}</span>
              ) : (
                <>
                  <div className="xp-tap-grid">
                    <div className="xp-tap-card">
                      <span>{t`Move the 1`}</span>
                      <div className="xp-tap-btns">
                        <button className="xp-tap-btn" onMouseDown={keepFocus} onClick={() => shiftPreviewDownbeat(-1)}>{t`◀ 1 beat earlier`}</button>
                        <button className="xp-tap-btn" onMouseDown={keepFocus} onClick={() => shiftPreviewDownbeat(1)}>{t`1 beat later ▶`}</button>
                      </div>
                      <span>{t`Clicks`}</span>
                      <NudgeClicks />
                    </div>
                    <BarPatternField seg={seg} />
                  </div>
                  <span className="xp-tap-note">{t`Listen first, then adjust while it plays: "Move the 1" if the bar lines start on the wrong beat, "Clicks" if the metronome is a hair ahead of or behind the music.`}</span>
                </>
              )}

              <div className="xp-tap-actions">
                {ses.nearOriginal && <button className="o-btn-quiet o-btn-lg" onMouseDown={keepFocus} onClick={keepOriginal}>{t`Original is fine`}</button>}
                <div className="o-spacer" />
                {!seg.map && <button className="o-btn o-btn-lg" onMouseDown={keepFocus} onClick={tapAgain}>{t`Tap again`}</button>}
                <button className="o-btn-primary o-btn-lg" onMouseDown={keepFocus} onClick={keepTap}>{t`Keep for this song`}</button>
              </div>
              <span className="xp-tap-note">{t`Kept tempos are remembered by Orfeo every time you open this song (your MIDI file isn't changed). Right-click TAP later to adjust or remove them.`}</span>
            </>
          )}
        </div>,
        document.body,
      )}

      {menu && (
        <ContextMenu ref={menuRef} x={menu.x} y={menu.y} minWidth={MENU_WIDTH} ariaLabel={t`Tap Tempo menu`} className="app-no-drag">
          <div style={{ padding: '6px 14px 4px', fontSize: 'var(--text-sm)', color: 'var(--ui-text-soft)' }}>
            {saved.length ? t`Tapped tempos for this song` : t`No tapped tempos for this song`}
          </div>
          {saved.map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <ContextMenuItem onClick={() => { setMenu(null); editKeptTempo(i) }}>
                  <span style={{ flex: 1 }}>{x.bpm.toFixed(1)} {t`bpm from`} {fmtSongTime(x.start)}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ui-text-soft)' }}>{t`Adjust`}</span>
                </ContextMenuItem>
              </div>
              <button
                onClick={() => { removeTappedTempo(i); if (saved.length <= 1) setMenu(null) }}
                aria-label={t`Remove this tapped tempo`}
                style={{ background: 'none', border: 'none', color: 'var(--ui-text-soft)', cursor: 'pointer', padding: '6px 12px', display: 'flex' }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <ContextMenuDivider />
          <ContextMenuItem onClick={() => { setMenu(null); changeBarsFromHere() }} disabled={!midi || noteEditorActive}>{t`Change bars from here`}</ContextMenuItem>
          {warningsOn && dismissed && (
            <ContextMenuItem onClick={() => { const k = useStore.getState().songKey; if (k) useStore.setState((s) => { const next = { ...s.tempoWarningDismissed }; delete next[k]; return { tempoWarningDismissed: next } }); setMenu(null) }}>{t`Show tempo warning again`}</ContextMenuItem>
          )}
          <ContextMenuItem onClick={onReset} disabled={saved.length === 0} danger>{t`Reset to the file's own tempo`}</ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  )
}

// The panel changes how the taps are read, so it's only offered before the first
function setTapMode(mode: 'beat' | 'bar') { useStore.getState().setTapTempoMode(mode) }

function NudgeClicks() {
  return (
    <div className="xp-tap-btns">
      <button className="xp-tap-btn" onMouseDown={keepFocus} onClick={() => nudgePreview(-NUDGE_SEC)}>{t`◀ 10 ms earlier`}</button>
      <button className="xp-tap-btn" onMouseDown={keepFocus} onClick={() => nudgePreview(NUDGE_SEC)}>{t`10 ms later ▶`}</button>
    </div>
  )
}

// ── A suggestion, shown only when the music repeats over a length the bars
// can't fit. It may be a riff crossing the bar lines, so it's a button to try. ─
function RepeatHintRow({ seg }: { seg: TempoSegment }) {
  const shown = formatBarPattern(seg)
  const found = useMemo(repeatHintsNow, [seg.start, seg.period, seg.anchor, shown])
  if (found.length === 0) return null
  const [first, second] = found
  return (
    <div className="xp-tap-card">
      <span>
        {second ? t`The music comes round every ${first.beats} beats in some parts and ${second.beats} in others, which these bars don't fit.`
          : t`The music comes round every ${first.beats} beats, which these bars don't fit.`}
      </span>
      <div className="xp-tap-btns">
        {found.map(hint => {
          const pattern = hint.pattern.join(' ')
          return <button key={hint.beats} className="xp-tap-btn" onMouseDown={keepFocus} onClick={() => tryRepeatHint(hint)}>{t`Try ${pattern}`}</button>
        })}
      </div>
    </div>
  )
}

// ── Bar lengths from this tempo on: one number, or a repeating pattern such as
// 3 3 3 4. Enter applies it and hands Space back for listening. ──────────────
function BarPatternField({ seg }: { seg: TempoSegment }) {
  const shown = formatBarPattern(seg)
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const apply = () => {
    if (draft === null) return
    if (setBarPattern(draft)) { setDraft(null); setBad(false) } else setBad(true)
  }
  return (
    <label className="xp-tap-card">
      {t`Beats in a bar`}
      <input
        aria-label={t`Beats in a bar`}
        data-bad={bad ? '' : undefined}
        value={draft ?? shown}
        onChange={e => { setDraft(e.currentTarget.value); setBad(false) }}
        onBlur={apply}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') { apply(); e.currentTarget.blur() }
          else if (e.key === 'Escape') { setDraft(null); setBad(false); e.currentTarget.blur() }
        }}
      />
      <span style={{ fontSize: 'var(--text-xs)' }}>
        {bad ? t`Use numbers from 1 to 32, like 4 or 3 3 3 4.`
          : t`One number, or a pattern that repeats, like 3 3 3 4. Press Enter to hear it.`}
      </span>
    </label>
  )
}
