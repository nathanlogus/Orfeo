import { useCallback, useRef, useEffect, useState } from 'react'
import { SkipBack, SkipForward, RotateCcw, Rewind, FastForward, Plus, Minus, Expand, Shrink } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { formatTime } from '../../utils/midiParser'
import { formatKey, transposeDetectedKey } from '../../utils/keyDetection'
import { buildDebugTimestamp, buildFullSongTable, formatTimeMs } from '../../utils/debugTimestamp'
import VolumeKnob from '../VolumeKnob'
import LoopRegionStrip from '../LoopRegionStrip'
import Tooltip from '../Tooltip'
import { TapTempoPad } from './TapTempoPad'
import { TempoWarning } from './TempoWarning'
import { useCurrentTempoTrust } from '../../hooks/useTempoTrustScan'
import { stepDisplayedBpm, typedBpm } from '../../utils/bpmStep'
import { ContextMenu, ContextMenuItem } from '../ContextMenu'
import { t } from '../../utils/i18n'
import { useMidiSettings } from '../../store/midiSettings'
import { shortName } from '../../utils/midiDeviceNames'
import { touchScreen } from '../../utils/touchScreen'
import { SongCoverTile, useSongCover } from './SongCover'
import { allSoundfonts, useSoundfontState } from '../../hooks/useSoundfonts'
import { useNativeAudio } from '../../audio/nativeClient'

// NOTE: no more `C` shorthand object — every color below is a literal
// `var(--token-name)` string written directly at its point of use, so the
// token being referenced is visible right here in the JSX without having to
// cross-reference a lookup table elsewhere in the file.
const SKIP_SECS = 5

// ── Windows caption-button overlay inset — the real reserved width for the
// native –/□/× buttons, read live from the Window Controls Overlay API
// (Electron's titleBarOverlay in electron/main.ts turns this on) instead of
// a fixed guess. If the group's right padding equals this exactly, its
// content's right edge lands precisely where the buttons start — zero
// horizontal overlap into their hit-region, regardless of vertical position,
// so the group can stay vertically centered like its siblings instead of
// needing to duck below the buttons' 40px zone. DPI/monitor changes fire
// `geometrychange`, so this tracks the real safe zone live. Falls back to a
// conservative constant if the API isn't present yet (first paint, or a
// non-Windows build).
// Android has no window buttons to clear, and the bar needs every pixel
const OVERLAY_INSET_FALLBACK = /Android/.test(navigator.userAgent) ? 0 : 174

function useTitlebarOverlayInset(): number {
  const [inset, setInset] = useState(OVERLAY_INSET_FALLBACK)

  useEffect(() => {
    const overlay = (navigator as any).windowControlsOverlay
    if (!overlay) return

    const update = () => {
      const rect = overlay.getTitlebarAreaRect()
      if (rect.width > 0) setInset(Math.round(window.innerWidth - rect.width - rect.x))
    }
    update()
    overlay.addEventListener('geometrychange', update)
    return () => overlay.removeEventListener('geometrychange', update)
  }, [])

  return inset
}

export default function TopBar() {
  useCurrentTempoTrust()
  const overlayInset = useTitlebarOverlayInset()
  const midi = useStore((s) => s.midi)
  const playbackState = useStore((s) => s.playbackState)
  const currentTime = useStore((s) => s.currentTime)
  const showPreciseScrubTime = useStore((s) => s.showPreciseScrubTime)
  const bpm = useStore((s) => s.bpm)
  const originalBpm = useStore((s) => s.originalBpm)
  const loopRegionEnabled  = useStore((s) => s.loopRegionEnabled)
  const loopRegionActive   = useStore((s) => s.loopRegionActive)
  const loopStart          = useStore((s) => s.loopStart)
  const loopEnd            = useStore((s) => s.loopEnd)
  const setBpm = useStore((s) => s.setBpm)
  const resetBpm = useStore((s) => s.resetBpm)
  const detectedKey = useStore((s) => s.detectedKey)
  const midiDeviceConnected = useStore((s) => s.midiDeviceConnected)
  const midiDeviceName = useStore((s) => s.midiDeviceName)
  // Model of the keyboard being played, plus any others that are plugged in
  const midiActiveKey = useMidiSettings((s) => s.activeDevice)
  const midiError = useMidiSettings((s) => s.accessError)
  const midiOthers = useMidiSettings((s) => s.devices.filter(d => d.connected && d.key !== s.activeDevice).map(d => d.name).join(', '))
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const barStarts = useStore((s) => s.barStarts)
  const chordSequence = useStore((s) => s.chordSequence)
  const presentationMode = useStore((s) => s.presentationMode)
  const songName = midi?.fileName?.replace(/\.[^.]+$/, '') ?? ''
  const cover = useSongCover((midi as any)?._filePath)
  const setPresentationMode = useStore((s) => s.setPresentationMode)

  const { pause, stop, seek, seekAndPlay } = usePlayback()
  const practiceLevel = useStore((s) => s.practiceLevel)
  const phraseResult = useStore((s) => s.phraseResult)
  const wasPlayingRef = useRef(false)

  const handleScrubStart = useCallback(() => {
    wasPlayingRef.current = playbackState === 'playing'
    if (wasPlayingRef.current) pause()
  }, [playbackState, pause])

  const handleScrubChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useStore.setState({ currentTime: parseFloat(e.target.value) })
  }, [])

  const handleScrubEnd = useCallback((e: { currentTarget: HTMLInputElement }) => {
    const t = parseFloat(e.currentTarget.value)
    if (wasPlayingRef.current) seekAndPlay(t); else seek(t)
  }, [seek, seekAndPlay])

  // A finger on a native slider sends no mouse events during a drag, and after
  // a tap the late ones would pause and seek a second time
  const handleScrubTouchEnd = useCallback((e: React.TouchEvent<HTMLInputElement>) => {
    e.preventDefault()
    handleScrubEnd(e)
  }, [handleScrubEnd])

  // ── Right-click the scrub bar → "Copy timestamp" for chord-detection bug
  // reports. Ships in every build, including packaged ones — the user tests
  // remotely (build/install, not `npm run dev`) and needs this there too.
  // Deliberately undocumented (not in HOW_TO_USE.md): a debugging tool, not
  // a feature. ────────────────────────────────────────────────────────────
  const [scrubMenu, setScrubMenu] = useState<{ x: number; y: number } | null>(null)
  const handleScrubContextMenu = useCallback((e: React.MouseEvent) => {
    if (!midi) return
    e.preventDefault()
    setScrubMenu({ x: e.clientX, y: e.clientY })
  }, [midi])
  const scrubMenuIsRange = loopStart !== null && loopEnd !== null && loopEnd > loopStart

  const handleSkip = useCallback((dir: 1 | -1) => {
    if (!midi) return
    const t = Math.max(0, Math.min(midi.duration, currentTime + dir * SKIP_SECS))
    if (playbackState === 'playing') seekAndPlay(t); else seek(t)
  }, [midi, currentTime, playbackState, seek, seekAndPlay])

  const handleTranspose = (semitones: number) => {
    if (!detectedKey) return
    useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, semitones) })
  }

  const transpose = detectedKey?.transpose ?? 0
  const duration = midi?.duration ?? 0
  const isTempoChanged = !!midi && bpm !== originalBpm
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming, accidentals) : '—'

  // ── Nudge: region selected but loop not yet activated (regardless of strip visibility) ──
  const nudgeLoop = !!midi && loopStart !== null && loopEnd !== null && !loopRegionActive

  // ── Loop label on the scrub bar ───────────────────────────────────────────
  const loopStartBar = loopStart !== null ? (() => {
    let bar = 1
    for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= loopStart) bar = i + 1 }
    return bar
  })() : null
  const loopEndBar = (loopEnd !== null && loopStartBar !== null) ? (() => {
    let rawBar = 1
    for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= loopEnd) rawBar = i + 1 }
    const pastLastBarStart = barStarts.length === 0 || loopEnd > barStarts[barStarts.length - 1] + 0.001
    return Math.max(loopStartBar, pastLastBarStart ? rawBar : rawBar - 1)
  })() : null

  // ── Live BPM — reads current tempo from _tempoMap so rubato files update ─
  const rawTempoMap = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
  const currentFileBpm = rawTempoMap?.length
    ? rawTempoMap.reduce(
        (acc: number, e: { bpm: number; time: number }) => e.time <= currentTime ? e.bpm : acc,
        rawTempoMap[0].bpm,
      )
    : bpm
  const userRatio = originalBpm > 0 ? bpm / originalBpm : 1
  const liveBpm = midi ? Math.round(currentFileBpm * userRatio) : 0

  // ── Live time signature — reads current signature from _timeSigMap so
  // songs that change bar length mid-way (e.g. 3/4 → 4/4) update too ──────
  const rawTimeSigMap = (midi as any)?._timeSigMap as { num: number; den: number; time: number }[] | undefined
  const currentTimeSig = rawTimeSigMap?.length
    ? rawTimeSigMap.reduce(
        (acc: { num: number; den: number }, e: { num: number; den: number; time: number }) => e.time <= currentTime ? e : acc,
        rawTimeSigMap[0],
      )
    : { num: midi?.timeSignatureNumerator ?? 4, den: midi?.timeSignatureDenominator ?? 4 }

  // ── Bar counter — uses same precomputed barStarts as PianoRoll ───────────
  const totalBars = barStarts.length
  // Binary search: find last index where barStarts[i] <= currentTime (= current bar index, 0-based)
  let currentBar = 0
  if (midi && barStarts.length > 0) {
    let lo = 0, hi = barStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (barStarts[mid] <= currentTime) lo = mid
      else hi = mid - 1
    }
    currentBar = lo + 1
  }

  const speedPct = originalBpm > 0 ? Math.round(bpm / originalBpm * 100) : 100
  const levelName = practiceLevel === 0 ? t`Auto` : t`of 5`
  const loopBand = duration > 0 && loopStart !== null && loopEnd !== null
    ? { left: `${loopStart / duration * 100}%`, width: `${(loopEnd - loopStart) / duration * 100}%` }
    : null

  return (
    <div className="pr-top">
      {/* The header doubles as the window's drag handle; on desktop its right edge
          stops where the caption buttons start. */}
      <header className="pr-header app-drag-region" style={{ paddingRight: Math.max(overlayInset + 12, 24) }}>
        {midi && <SongCoverTile art={cover?.art ?? null} title={songName} />}
        <div className="pr-title">
          <span className="pr-kicker">{midi ? t`Now practising` : t`No file open`}{cover?.people.length ? ` · ${cover.people[0]}` : ''}</span>
          <span className="pr-song">{songName}</span>
        </div>

        <div className="pr-readouts topbar-scroll app-no-drag touch-hit">
          {/* ── Tempo ── */}
          <div className="pr-group" data-instant data-tuck>
            <span className="pr-label">
              {t`Tempo`}
              <TapTempoPad />
              {isTempoChanged && (
                <Tooltip title="Reset tempo" description="Restores the original BPM" placement="bottom">
                  <button className="pr-reset" onClick={resetBpm} aria-label={t`Reset tempo`}><RotateCcw size={13} /></button>
                </Tooltip>
              )}
            </span>
            {/* ±1 steps the DISPLAYED tempo (file tempo at the playhead, incl. any
                tap-tempo correction), not the file's first tempo — see liveBpm. */}
            <div className="pr-steps">
              <LongPressArrow onStep={() => { const s = useStore.getState(); setBpm(stepDisplayedBpm(s.bpm, s.originalBpm, currentFileBpm, -1)) }} disabled={!midi} title="BPM -1" description={"Nudges playback tempo down\nby one beat per minute."}><Minus size={16} /></LongPressArrow>
              <Tooltip title={`Tempo: ${liveBpm || '—'} BPM`} description={t`The song's current playback tempo,\nscaled by your speed setting.\nDouble-click to type a tempo.`} placement="bottom">
                <div className="pr-value" data-changed={isTempoChanged}>
                  <BpmValue
                    shown={midi ? String(liveBpm) : '—'}
                    disabled={!midi}
                    onType={(text) => {
                      const s = useStore.getState()
                      const next = typedBpm(text, s.originalBpm, currentFileBpm)
                      if (next !== null) setBpm(next)
                    }}
                  />
                  <small>{speedPct}%</small>
                </div>
              </Tooltip>
              <LongPressArrow onStep={() => { const s = useStore.getState(); setBpm(stepDisplayedBpm(s.bpm, s.originalBpm, currentFileBpm, 1)) }} disabled={!midi} title="BPM +1" description={"Nudges playback tempo up\nby one beat per minute."}><Plus size={16} /></LongPressArrow>
            </div>
          </div>

          {/* ── Key ── (position: relative on .pr-group anchors the tempo-warning badge) */}
          <div className="pr-group" data-instant data-tuck>
            <span className="pr-label">
              {t`Key`}
              {transpose !== 0 && (
                <Tooltip title="Reset key" description={"Restores the original key"} placement="bottom">
                  <button className="pr-reset" onClick={() => useStore.setState({ detectedKey: detectedKey ? { ...detectedKey, transpose: 0 } : null })} aria-label={t`Reset key`}><RotateCcw size={13} /></button>
                </Tooltip>
              )}
            </span>
            <div className="pr-steps">
              <ArrowBtn onClick={() => handleTranspose(-1)} disabled={!midi || transpose <= -12} title="Transpose down" description={"Shifts the detected key down\nby a semitone (max −12)."}><Minus size={16} /></ArrowBtn>
              <Tooltip
                title="Key: "
                titleValue={`${displayKey}${transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose} semitones)` : ''}`}
                description={"The song's detected key, adjusted\nby any transpose applied here."}
                placement="bottom"
              >
                <div className="pr-value" data-changed={transpose !== 0}>
                  <span key={displayKey} className="o-tick">{displayKey}</span>
                  <small>{transpose === 0 ? '± 0' : `${transpose > 0 ? '+' : '−'} ${Math.abs(transpose)}`}</small>
                </div>
              </Tooltip>
              <ArrowBtn onClick={() => handleTranspose(1)} disabled={!midi || transpose >= 12} title="Transpose up" description={"Shifts the detected key up\nby a semitone (max +12)."}><Plus size={16} /></ArrowBtn>
            </div>
            <TempoWarning anchor="key" />
          </div>

          {/* ── Bar + time signature ── */}
          {midi && (
            <Tooltip title={`Bar ${currentBar} of ${totalBars}`} description={`Time signature: ${currentTimeSig.num}/${currentTimeSig.den}\nBeats in each bar, and which note value counts as one beat.`} placement="bottom">
              <div className="pr-group">
                <span className="pr-label">{t`Bar`} · {currentTimeSig.num}/{currentTimeSig.den}</span>
                <span className="pr-bar">{currentBar}<small>/ {totalBars}</small></span>
              </div>
            </Tooltip>
          )}

          {/* ── Level — how much of the song you're asked to play; a tap moves to the next ── */}
          <div className="pr-group">
            <span className="pr-label">{t`Level`}</span>
            <Tooltip
              title={practiceLevel === 0 ? t`Auto level` : practiceLevel === 5 ? t`Level 5 of 5: every note` : t`Level ${practiceLevel} of 5`}
              description={t`1 is the melody on the beats, 2 the whole melody, 3 adds the bass, 4 both hands with simpler chords, 5 everything. A sets each four bars by how you play them: two clean passes go up, a rough one goes down. Tap for the next level.`}
              placement="bottom"
            >
              <button className="pr-level" data-instant disabled={!midi} aria-label={practiceLevel === 0 ? t`Practice level automatic` : t`Practice level ${practiceLevel} of 5`}
                onClick={() => useStore.getState().setPracticeLevel((practiceLevel + 1) % 6)}>
                <span className="pr-level-tag">{practiceLevel === 0 ? 'A' : practiceLevel}</span>
                {phraseResult
                  ? <span><span className="pr-soft">{t`this phrase`}</span> {phraseResult.percent}%</span>
                  : <span className="pr-soft">{levelName}</span>}
              </button>
            </Tooltip>
          </div>

          <SoundStatus />

          {/* ── MIDI — the keyboard being played; click opens its settings ── */}
          <div className="pr-group">
            <span className="pr-label">{t`Keyboard`}</span>
            <Tooltip
              title={midiDeviceConnected ? midiDeviceName : midiError ? t`MIDI isn’t available` : t`No connected keyboards`}
              description={midiDeviceConnected
                ? (midiOthers ? t`Also connected: ${midiOthers}` + '\n' + t`Click for MIDI keyboard settings.` : t`Ready to play. Click for MIDI keyboard settings.`)
                : touchScreen ? t`Plug your keyboard into the tablet with a USB cable. Most keyboards need a USB-C adapter. You can still play on the screen.`
                : t`Connect one by USB. Click to \nopen MIDI keyboard settings.`}
              placement="bottom"
            >
              <button className="pr-midi" data-off={!midiDeviceConnected} onClick={() => useStore.getState().openSettingsWindow('midi')} aria-label={t`MIDI keyboard settings`}>
                <span className={`o-dot ${midiDeviceConnected ? 'o-dot-on' : midiError ? 'o-dot-alert' : 'o-dot-off'}`} />
                {midiDeviceConnected ? <span>{shortName(midiActiveKey || midiDeviceName)}</span>
                  : midiError ? <span>{t`MIDI unavailable`}</span>
                  : <span>{t`Connect`}<span className="pr-wide"> {t`a keyboard`}</span></span>}
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* ── Transport row. Right-click the scrub bar: see handleScrubContextMenu ── */}
      <div className="pr-transport app-no-drag touch-hit" data-instant>
        <TBtn onClick={stop} disabled={!midi} title="Go to start"><SkipBack size={20} strokeWidth={1.8} /></TBtn>
        <TBtn onClick={() => handleSkip(-1)} disabled={!midi} title={`Rewind ${SKIP_SECS}s`}><Rewind size={20} strokeWidth={1.8} /></TBtn>
        <TBtn onClick={() => handleSkip(1)} disabled={!midi} title={`Forward ${SKIP_SECS}s`}><FastForward size={20} strokeWidth={1.8} /></TBtn>
        <TBtn onClick={() => midi && seek(midi.duration)} disabled={!midi} title="Go to end"><SkipForward size={20} strokeWidth={1.8} /></TBtn>
        <span className="pr-time" data-precise={showPreciseScrubTime}>{showPreciseScrubTime ? formatTimeMs(currentTime) : formatTime(currentTime)}</span>
        <div className="pr-scrub" onContextMenu={handleScrubContextMenu}>
          <Tooltip title="Scrub position" description="Drag to jump to any point in the song.">
            <input
              type="range" min={0} max={duration || 1} step={0.01} value={currentTime}
              onMouseDown={handleScrubStart} onChange={handleScrubChange} onMouseUp={handleScrubEnd}
              onTouchStart={handleScrubStart} onTouchEnd={handleScrubTouchEnd}
              className="scrub-slider" disabled={!midi} aria-label={t`Song position`}
              aria-valuetext={t`Bar ${currentBar} of ${totalBars}`}
              style={{ '--fill': `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` } as React.CSSProperties}
            />
          </Tooltip>
          {loopBand && <div className="pr-scrub-loop" data-off={!loopRegionActive} style={loopBand} />}
          {loopBand && <span className="pr-scrub-label">{t`Loop`} · {t`bars`} {loopStartBar}–{loopEndBar}{nudgeLoop ? ` · ${t`click Loop to start`}` : ''}</span>}
        </div>
        <span className="pr-time">{formatTime(duration)}</span>
        <span className="pr-divider" />
        <VolumeKnob />
        <TBtn onClick={() => setPresentationMode(!presentationMode)} title={presentationMode ? 'Exit Presentation Mode' : 'Presentation Mode'} description={presentationMode ? 'Press Esc to leave, or click here.' : 'Distraction-free fullscreen view.\nF11 to open, Esc to close.'}>
          {presentationMode ? <Shrink size={19} strokeWidth={1.8} /> : <Expand size={19} strokeWidth={1.8} />}
        </TBtn>
      </div>

      {/* Loop Region Strip — visible only when enabled in Settings */}
      {loopRegionEnabled && <LoopRegionStrip />}

      {scrubMenu && (
        <ScrubDebugMenu
          x={scrubMenu.x}
          y={scrubMenu.y}
          isRange={scrubMenuIsRange}
          buildText={() => buildDebugTimestamp({
            currentTime, loopStart, loopEnd, barStarts, chordSequence,
          })}
          buildTableText={() => buildFullSongTable({ duration, barStarts, chordSequence })}
          onClose={() => setScrubMenu(null)}
        />
      )}
    </div>
  )
}

// ── Only while the sound isn't ready yet: a sound font loading, or the Native
// engine with no sound card to play on ─────────────────────────────────────
function SoundStatus() {
  const loading = useSoundfontState((s) => s.samplesStatus === 'loading')
  const percent = useSoundfontState((s) => Math.round(s.samplesProgress * 100))
  const fontName = useSoundfontState((s) => allSoundfonts(s.extra).find(sf => sf.id === useStore.getState().selectedSoundfont)?.name)
  const noCard = useNativeAudio((s) => s.phase === 'running' && s.status?.mode === 'none') && useStore.getState().audioEngine === 'native'
  if (!loading && !noCard) return null
  return (
    <div className="pr-group">
      <span className="pr-label">{t`Sound`}</span>
      <Tooltip
        title={loading ? t`Loading sound font… ${percent}%` : t`Native · waiting for a sound card…`}
        description={loading ? t`${fontName ?? ''} · the GM sound plays until it’s ready` : t`Another app has the sound card. Orfeo will pick it up when it’s free, or switch to Shared.`}
        placement="bottom"
      >
        <button className="pr-midi pr-sound" onClick={() => useStore.getState().openSettingsWindow('audio')} aria-label={loading ? t`Loading sound font ${percent}%` : t`Waiting for a sound card`}>
          {loading
            ? <><span>{percent}%</span><span className="o-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t`Loading sound font`}><span style={{ width: `${percent}%` }} /></span></>
            : <><span className="o-dot o-dot-warn" /><span>{t`Waiting for a sound card`}</span></>}
        </button>
      </Tooltip>
    </div>
  )
}

// ── Scrub-bar right-click menu (see handleScrubContextMenu). Copies a
// `time · bar · chord` string to the clipboard for chord-detection bug
// reports. Ships in packaged builds too (undocumented) — see the comment
// at handleScrubContextMenu.
//
// Uses execCommand('copy') on a throwaway textarea, NOT navigator.clipboard:
// the async Clipboard API rejects under Electron with "Document is not focused"
// after a context-menu interaction, so nothing lands on the OS clipboard.
// execCommand is deprecated but still the reliable path inside Electron's
// Chromium.
function writeClipboard(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
    document.body.appendChild(ta)
    ta.focus({ preventScroll: true })
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

function ScrubDebugMenu({ x, y, isRange, buildText, buildTableText, onClose }: {
  x: number; y: number; isRange: boolean
  buildText: () => string; buildTableText: () => string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Set up outside-click / Escape dismissal ONCE. onClose is reached through a
  // ref so a new onClose identity each parent render (TopBar re-renders every
  // frame during playback) doesn't tear down and rebuild the listeners.
  useEffect(() => {
    const close = () => onCloseRef.current()
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', onDown, true)
      window.addEventListener('keydown', onKey, true)
    }, 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  return (
    // app-no-drag: this menu is rendered inside TopBar's app-drag-region
    // (Electron -webkit-app-region: drag, for native window dragging).
    // Without the override, Electron's OS-level drag handling swallows the
    // mousedown/click before React's onClick ever fires — the menu item
    // looked clickable but silently did nothing. Passed as className (not a
    // wrapping div) since ContextMenu is position:fixed/out-of-flow; a
    // wrapping block div would re-enter TopBar's grid flow and disrupt its
    // column layout.
    <ContextMenu ref={ref} x={x} y={y} minWidth={220} ariaLabel="Debug timestamp" className="app-no-drag">
      <DebugCopyItem
        idleLabel={isRange ? 'Copy timestamp range' : 'Copy timestamp'}
        logTag="timestamp"
        buildText={buildText}
        onDone={() => onCloseRef.current()}
      />
      <DebugCopyItem
        idleLabel="Copy full chord table"
        logTag="chord table"
        buildText={buildTableText}
        onDone={() => onCloseRef.current()}
      />
    </ContextMenu>
  )
}

// One self-contained copy action inside the debug menu — owns its own
// idle/ok/fail label so copying the table doesn't clobber the point/range
// item's state (and vice versa) when both live in the same menu.
function DebugCopyItem({ idleLabel, logTag, buildText, onDone }: {
  idleLabel: string; logTag: string; buildText: () => string; onDone: () => void
}) {
  const [result, setResult] = useState<'idle' | 'ok' | 'fail'>('idle')

  const copy = () => {
    const text = buildText()
    const ok = writeClipboard(text)
    // Always echo to the console — a fallback copy source if the clipboard is
    // blocked, and a running log of what was reported.
    console.info(`[${logTag}] ${text}${ok ? '' : '  (clipboard write failed)'}`)
    setResult(ok ? 'ok' : 'fail')
    setTimeout(onDone, 900)
  }

  const label = result === 'ok' ? 'Copied ✓'
    : result === 'fail' ? 'Clipboard blocked — see console'
    : idleLabel

  return <ContextMenuItem onClick={copy}>{label}</ContextMenuItem>
}

// ── The tempo number: double-click to type one, Enter or clicking away sets
// it, Escape keeps the old one. Same size as the number, so nothing shifts. ──
function BpmValue({ shown, disabled, onType }: {
  shown: string; disabled: boolean; onType: (text: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const style: React.CSSProperties = { font: 'inherit', color: 'inherit', textAlign: 'center' }
  if (draft === null) {
    return <span onDoubleClick={disabled ? undefined : () => setDraft(shown)} style={style}>{shown}</span>
  }
  const finish = (save: boolean) => {
    if (save) onType(draft)
    setDraft(null)
  }
  return (
    <input
      autoFocus
      aria-label={t`Tempo in BPM`}
      inputMode="decimal"
      maxLength={5}
      value={draft}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.currentTarget.value)}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      style={{ ...style, width: `max(44px, ${shown.length}ch)`, height: 20, padding: 0, border: 'none', outline: 'none', background: 'none', boxShadow: '0 1px 0 var(--accent)' }}
    />
  )
}

// Long-press button: single click = +1, hold = accelerating repeat
function LongPressArrow({ children, onStep, disabled, title, description }: {
  children: React.ReactNode; onStep: () => void; disabled?: boolean; title?: string; description?: string
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepsRef = useRef(0)

  const stop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    stepsRef.current = 0
  }

  const start = () => {
    if (disabled) return
    onStep()
    stepsRef.current = 0
    // After 400ms hold, start repeating
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onStep()
        stepsRef.current++
      // Accelerate: start at 120ms, ramp down to 40ms after 20 steps
      }, Math.max(40, 120 - stepsRef.current * 4))
    }, 400)
  }

  useEffect(() => () => stop(), [])

  const button = (
    <button className="pr-step" disabled={disabled} aria-label={title} onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}>
      {children}
    </button>
  )
  return title ? <Tooltip title={title} description={description} placement="bottom">{button}</Tooltip> : button
}

function ArrowBtn({ children, onClick, disabled, title, description }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; description?: string
}) {
  const button = <button className="pr-step" onClick={onClick} disabled={disabled} aria-label={title}>{children}</button>
  return title ? <Tooltip title={title} description={description} placement="bottom">{button}</Tooltip> : button
}

function TBtn({ children, onClick, disabled, title, description }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title: string; description?: string
}) {
  return (
    <Tooltip title={title} description={description} placement="bottom" oneLine={!description}>
      <button className="pr-tbtn" onClick={onClick} disabled={disabled} aria-label={title}>{children}</button>
    </Tooltip>
  )
}
