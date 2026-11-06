import { useCallback, useRef, useState } from 'react'
import { Play, Pause, Repeat, Hourglass, Brain, ListTree, SlidersVertical, Music2, Compass, X, FolderOpen, SlidersHorizontal, Square } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { useMidiFile } from '../../hooks/useMidiFile'
import { isCountingIn, cancelCountIn } from '../../utils/countInRunner'
import { ContextMenu, ContextMenuItem, useMenuDismiss } from '../ContextMenu'
import { MetronomePopover } from './MetronomePopover'
import { endPractice } from '../../utils/practiceSession'
import { useNewVersionDot } from '../../hooks/useUpdateCheck'
import { t } from '../../utils/i18n'
import { confirmDiscardDirtyNoteEdits } from '../../utils/noteEditorState'
import { confirmDiscardDirtyTempoKey } from '../../utils/tempoKeySave'
import { isScoreFor } from '../../utils/scoreSource'
import { touchScreen } from '../../utils/touchScreen'
import PliageMark from '../PliageMark'
import Tooltip from '../Tooltip'

const NEXT_SCORE_MODE = { roll: 'both', both: 'score', score: 'roll' } as const
const METRO_H = 340

// ── One rail tile: icon over a word. `on` is a toggle that stays pressed. ───
function Tile({ label, icon, on, dot, disabled, blink, badge, title, description, onClick, onContextMenu, expanded }: {
  label: string; icon: React.ReactNode; on?: boolean; dot?: boolean; disabled?: boolean; blink?: boolean
  badge?: React.ReactNode; title: string; description?: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void; expanded?: boolean
}) {
  return (
    <Tooltip title={title} description={description} oneLine={!description} placement="right" wrapperStyle={{ flexShrink: 0 }}>
      <button className={`pr-tile${blink ? ' loop-nudge-blink' : ''}`} data-instant aria-label={title} aria-pressed={on === undefined ? undefined : on}
        aria-expanded={expanded} disabled={disabled} onClick={onClick} onContextMenu={onContextMenu}>
        {dot && <span className="pr-tile-dot" />}
        {badge}
        {icon}
        <span className="pr-tile-label">{label}</span>
      </button>
    </Tooltip>
  )
}

// ── The practice rail: back to the library, play, and every practice switch ──
export default function PracticeRail() {
  const midi = useStore((s) => s.midi)
  const playing = useStore((s) => s.playbackState === 'playing')
  const chordExplorerOpen = useStore((s) => s.chordExplorerOpen)
  const explorerPausesPlayback = useStore((s) => s.explorerPausesPlayback)
  const loopRegionActive = useStore((s) => s.loopRegionActive)
  const loopStart = useStore((s) => s.loopStart)
  const loopEnd = useStore((s) => s.loopEnd)
  const barStarts = useStore((s) => s.barStarts)
  const waitForNotes = useStore((s) => s.waitForNotes)
  const memoryMode = useStore((s) => s.memoryMode)
  const metronomeEnabled = useStore((s) => s.metronomeEnabled)
  const countInEnabled = useStore((s) => s.countInEnabled)
  const countInBars = useStore((s) => s.countInBars)
  const trackPanelOpen = useStore((s) => s.trackPanelOpen)
  const mixerOpen = useStore((s) => s.mixerOpen)
  const scoreViewMode = useStore((s) => s.scoreViewMode)
  const hasScore = useStore((s) => isScoreFor(s.scoreSource, (s.midi as any)?._filePath))
  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const { play, pause, stop, toggleLoop } = usePlayback()
  const newVersion = useNewVersionDot()
  const { openFile } = useMidiFile()
  const [metroMenu, setMetroMenu] = useState<{ x: number; y: number } | null>(null)
  const [exploreMenu, setExploreMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMetroMenu = useCallback(() => setMetroMenu(null), [])
  const closeExploreMenu = useCallback(() => setExploreMenu(null), [])

  const handlePlayPause = useCallback(() => {
    if (isCountingIn()) { cancelCountIn(); return }
    if (playing) pause(); else play()
  }, [playing, play, pause])

  const handleReset = useCallback(async () => {
    const proceed = await confirmDiscardDirtyNoteEdits('Save changes before resetting?')
    if (!proceed) return
    const proceedTempoKey = await confirmDiscardDirtyTempoKey('Save tempo/key changes before resetting?')
    if (proceedTempoKey) useStore.getState().resetAll()
  }, [])

  // ── Nudge: region selected but loop not yet activated ─────────────────────
  const nudgeLoop = !!midi && loopStart !== null && loopEnd !== null && !loopRegionActive
  const barOf = (time: number) => { let bar = 1; for (let i = 0; i < barStarts.length; i++) if (barStarts[i] <= time) bar = i + 1; return bar }
  const loopStartBar = loopStart !== null ? barOf(loopStart) : null
  const loopEndBar = loopEnd !== null && loopStartBar !== null
    ? Math.max(loopStartBar, barStarts.length === 0 || loopEnd > barStarts[barStarts.length - 1] + 0.001 ? barOf(loopEnd) : barOf(loopEnd) - 1)
    : null

  const openMenuBeside = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.currentTarget.closest('nav')!.getBoundingClientRect().right + 8, y: Math.max(8, Math.min(r.top, window.innerHeight - METRO_H - 8)) }
  }

  return (
    <nav className="pr-rail app-no-drag touch-hit" aria-label={t`Practice controls`}>
      <Tooltip title="Home" description={"Find another song.\nYour open song stays as it is."} placement="right" wrapperStyle={{ flexShrink: 0 }}>
        <button className="pr-rail-home" aria-label={t`Home`} onClick={() => useStore.getState().setHomeOpen(true)}>
          <PliageMark height={24} tone="sun" />
        </button>
      </Tooltip>
      <Tooltip title="Play / Pause (Space)" oneLine placement="right" wrapperStyle={{ flexShrink: 0 }}>
        <button className="pr-rail-play tbtn-play" data-instant aria-label={playing ? t`Pause` : t`Play`} disabled={!midi || (chordExplorerOpen && explorerPausesPlayback)} onClick={handlePlayPause}>
          {playing ? <Pause size={24} fill="currentColor" strokeWidth={0} /> : <Play size={24} fill="currentColor" strokeWidth={0} style={{ marginLeft: 3 }} />}
        </button>
      </Tooltip>

      <Tile label={t`Loop`} icon={<Repeat size={20} strokeWidth={1.8} />} on={loopRegionActive} dot={loopRegionActive} blink={nudgeLoop} disabled={!midi}
        title={loopStart !== null ? (loopRegionActive ? `Looping bars ${loopStartBar}–${loopEndBar}` : `Loop bars ${loopStartBar}–${loopEndBar}`) : 'Loop song or section'}
        description={loopStart !== null
          ? (loopRegionActive ? 'Click to disable looping.' : 'Click to enable looping.')
          : 'Click to loop the entire song, or Alt+Click & drag mouse on the piano roll to select a specific region.'}
        onClick={toggleLoop} />
      <Tile label={t`Wait`} icon={<Hourglass size={20} strokeWidth={1.8} />} on={waitForNotes} dot={waitForNotes} disabled={!midi}
        title={waitForNotes ? t`Waiting for your notes` : t`Wait for notes`}
        description={t`The song plays and holds at each note until you play it on your MIDI keyboard. Hide or mute a track to leave its notes out.`}
        onClick={() => useStore.getState().setWaitForNotes(!waitForNotes)} />
      <Tile label={t`Memory`} icon={<Brain size={20} strokeWidth={1.8} />} on={memoryMode} dot={memoryMode} disabled={!midi}
        title={memoryMode ? t`Memory on` : t`Memory`}
        description={t`Once a phrase is clean at the full level, each clean run fades its notes further until they're gone. A rough run brings them back. Runs count at 100% tempo, without Wait.`}
        onClick={() => useStore.getState().setMemoryMode(!memoryMode)} />
      <Tile label={t`Click`} on={metronomeEnabled} dot={metronomeEnabled}
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 11.4V9.1" /><path d="m12 17 6.59-6.59" /><path d="m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2" /><circle cx="20" cy="9" r="2" /></svg>}
        badge={countInEnabled ? <span className="pr-tile-badge" aria-label={t`Count-in ${countInBars} bars`}>{countInBars}</span> : undefined}
        title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
        description={touchScreen ? t`Tap for the metronome, its volume and the count-in.` : countInEnabled ? t`Click to toggle metronome ON/OFF. Right-click for volume and count-in.` : t`Click to turn it ON, right-click \nfor volume and count-in.`}
        expanded={!!metroMenu}
        onClick={(e) => {
          // No right-click on a tablet: the popover holds the switch too
          if (touchScreen) setMetroMenu(metroMenu ? null : openMenuBeside(e))
          else useStore.getState().setMetronomeEnabled(!metronomeEnabled)
        }}
        onContextMenu={(e) => { e.preventDefault(); setMetroMenu(openMenuBeside(e)) }} />
      <Tile label={t`Tracks`} icon={<ListTree size={20} strokeWidth={1.8} />} on={trackPanelOpen}
        title={trackPanelOpen ? t`Close Tracks panel` : t`Open Tracks panel`} description={t`Shows every track with its mute, solo, and visibility controls.`}
        onClick={() => useStore.getState().setTrackPanelOpen(!trackPanelOpen)} />
      <Tile label={t`Mixer`} icon={<SlidersVertical size={20} strokeWidth={1.8} />} on={mixerOpen}
        title="Console Mixer" description={t`Adjust volume, pan, and effects for every track individually.`}
        onClick={() => useStore.getState().setMixerOpen(true)} />
      <Tile label={t`Score`} icon={<Music2 size={20} strokeWidth={1.8} />} on={hasScore && scoreViewMode !== 'roll'} disabled={!hasScore}
        title={!hasScore ? t`No score for this song` : scoreViewMode === 'roll' ? t`Showing: piano roll` : scoreViewMode === 'both' ? t`Showing: score and piano roll` : t`Showing: score`}
        description={hasScore ? t`Click to switch between the piano roll, the score, or both.` : t`Scores show for MusicXML, Guitar Pro and Capella files, not MIDI or saved edits.`}
        onClick={() => useStore.getState().setScoreViewMode(NEXT_SCORE_MODE[scoreViewMode])} />
      <Tile label={t`Explore`} icon={<Compass size={20} strokeWidth={1.8} />}
        title={t`Explore`} description={t`Open the Chords or Scales Explorer.`}
        onClick={(e) => setExploreMenu(exploreMenu ? null : openMenuBeside(e))} />

      <div className="pr-rail-gap" />

      <Tile label={t`Open`} icon={<FolderOpen size={20} strokeWidth={1.8} />}
        title="Open a file (Ctrl+O)" description={"Loads a supported file from\ndisk to start a new session."} onClick={openFile} />
      <Tile label={t`Close`} icon={<X size={20} strokeWidth={1.8} />}
        title="Reset" description={"Closes the file and resets tempo,\ntranspose, and playback to defaults."} onClick={handleReset} />
      <Tile label={t`End`} icon={<Square size={20} strokeWidth={1.8} />} disabled={!midi}
        title={t`End practice`} description={t`Stops the song, and shows how it went if you played along.`}
        onClick={() => { if (isCountingIn()) cancelCountIn(); endPractice(); stop() }} />
      <Tooltip title={t`Open Setup`} description={t`The everyday switches — sound engine, note names, keyboard, piano roll and more.`} placement="right" wrapperStyle={{ flexShrink: 0 }}>
        <button className="pr-rail-setup" aria-label={newVersion ? t`Setup and settings, new version available` : t`Setup and settings`} aria-expanded={settingsPanelOpen}
          onClick={() => useStore.getState().setSettingsPanelOpen(!settingsPanelOpen)}>
          <SlidersHorizontal size={18} strokeWidth={1.8} />
          {newVersion && <span className="pr-update-dot" />}
        </button>
      </Tooltip>

      {metroMenu && <MetronomePopover x={metroMenu.x} y={metroMenu.y} onClose={closeMetroMenu} />}
      {exploreMenu && <ExploreMenu x={exploreMenu.x} y={exploreMenu.y} onClose={closeExploreMenu} />}
    </nav>
  )
}

// ── Explore: the two Explorers and the Chord Prompter, which used to live in
// the strip over the keys. ──────────────────────────────────────────────────
function ExploreMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const midi = useStore((s) => s.midi)
  const chordPrompterEnabled = useStore((s) => s.chordPrompterEnabled)
  const chordPrompterOpen = useStore((s) => s.chordPrompterOpen)
  useMenuDismiss(true, ref, onClose)
  const go = (fn: () => void) => () => { fn(); onClose() }
  return (
    <ContextMenu ref={ref} x={x} y={y} minWidth={240} ariaLabel={t`Explore`} className="app-no-drag">
      <ContextMenuItem onClick={go(() => useStore.getState().setChordExplorerOpen(true))}>{t`Chords Explorer`}</ContextMenuItem>
      <ContextMenuItem onClick={go(() => useStore.getState().setScaleExplorerOpen(true))}>{t`Scales Explorer`}</ContextMenuItem>
      {chordPrompterEnabled && (
        <ContextMenuItem disabled={!midi} onClick={go(() => useStore.getState().setChordPrompterOpen(!chordPrompterOpen))}>
          {chordPrompterOpen ? t`Hide Chord Prompter` : t`Show Chord Prompter`}
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={go(() => useStore.setState({ lockHintOpen: true }))}>{t`Lock a chord`}</ContextMenuItem>
    </ContextMenu>
  )
}
