import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import './styles/redesign-practice.css'
import TopBar from './components/Transport/TopBar'
import PracticeRail from './components/Transport/PracticeRail'
import PresentationBar from './components/Transport/PresentationBar'
import ResultsScreen from './components/Transport/ResultsScreen'
import { SetBar, SetSummary } from './components/Transport/SetBar'
import { closeSet } from './utils/setSession'
import PianoRoll from './components/PianoRoll/PianoRoll'
import ScoreView from './components/ScoreView'
import { isScoreFor } from './utils/scoreSource'
import Keyboard from './components/Keyboard/Keyboard'
import KeyboardControls, { LockHint, StepPill } from './components/Keyboard/KeyboardControls'
import TrackPanel from './components/TrackPanel/TrackPanel'
import SettingsPanel from './components/SettingsPanel/SettingsPanel'
import SettingsWindow from './components/Settings/SettingsWindow'
import { useUpdateService } from './hooks/useUpdateCheck'
import { useSoundfontService } from './hooks/useSoundfonts'
import HomePage from './components/Home/HomePage'
import LessonBanner from './components/Lessons/LessonBanner'
import LessonPanel from './components/Lessons/LessonPanel'
import { useStore } from './store'
import { useMidiSettings } from './store/midiSettings'
import FloatingKeyboard from './components/Keyboard/FloatingKeyboard'
import ChordExplorer from './components/ChordExplorer'
import ScaleExplorer from './components/ScaleExplorer'
import LockedChordModal from './components/LockedChordModal'
import MidiEditor from './components/MidiEditor/MidiEditor'
import MixerConsole from './components/Mixer/MixerConsole'
import NoteEditorToolbar, { NoteActions } from './components/NoteEditor/NoteEditorToolbar'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import Tooltip from './components/Tooltip'
import { confirmDialog } from './utils/confirmController'
import { parseMidiBuffer } from './utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from './utils/keyDetection'
import {
  resolveAndTrackImport,
  confirmPendingImportBeforeSwitch,
  base64ToBytes,
  getCachePath,
} from './utils/foreignFormatImport'
import { useMidiFile } from './hooks/useMidiFile'
import { usePlayback } from './hooks/usePlayback'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMetronome } from './hooks/useMetronome'
import { useChordSequence } from './hooks/useChordSequence'
import { useMidiInput } from './hooks/useMidiInput'
import { runNoteEditorRoundTripTest } from './utils/noteEditorRoundTripTest'
import { runHandAssignmentTest } from './utils/handAssignmentTest'
import { runHandMetadataTest } from './utils/handMetadataTest'
import { runChordVocabularyTest } from './utils/chordVocabularyTest'
import { runBeatGridTest } from './utils/beatGridTest'
import { runTrackChordRoleTest } from './utils/trackChordRoleTest'
import { runChordSequenceBuilderTest } from './utils/chordSequenceBuilderTest'
import { runMidiDiagnosticsTest } from './utils/midiDiagnosticsTest'
import { NES, confirmDiscardDirtyNoteEdits } from './utils/noteEditorState'
import { confirmDiscardDirtyTempoKey, saveTempoKeyChanges } from './utils/tempoKeySave'
import { isTapCapturing, registerTap, cancelTap } from './utils/tapTempoSession'
import { isCountingIn, cancelCountIn } from './utils/countInRunner'
import { stepEvents } from './utils/stepThrough'
import { useCountIn } from './hooks/useCountIn'
import { CountInOverlay } from './components/CountInOverlay'
import { useSupportNoteService } from './hooks/useSupportNote'
import { isExporting } from './audio/exportAudio'
import { SupportNote } from './components/SupportNote'
import DropOverlay from './components/DropOverlay'
import { t } from './utils/i18n'

export default function App() {
  // ── Update status + sound-set progress: one listener each for the app's
  // whole life (their off* calls remove every listener on the channel), so
  // they live here, not in the drawer — it unmounts in presentation mode. ──
  useUpdateService()
  useSoundfontService()
  useSupportNoteService()
  const midi = useStore((s) => s.midi)
  const homeOpen = useStore((s) => s.homeOpen)
  const lessonActive = useStore((s) => !!s.lessonRun)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const appTheme = useStore((s) => s.appTheme)
  // A theme switch repaints everything at once: nothing eases through it
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add('theme-switching')
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
    return () => cancelAnimationFrame(frame)
  }, [appTheme])
  const presentationMode = useStore((s) => s.presentationMode)
  const noteEditorActive = useStore((s) => s.noteEditorActive)
  const scoreViewMode = useStore((s) => s.scoreViewMode)
  const scoreBytes = useStore((s) => isScoreFor(s.scoreSource, (s.midi as any)?._filePath) ? s.scoreSource.bytes : null)
  // the Note Editor draws on the roll, so it always gets it, under a sheet of its own notes
  const liveSheet = useStore((s) => s.noteEditorActive && s.noteEditorSheet)
  const showScore = !!scoreBytes && scoreViewMode !== 'roll' && !noteEditorActive
  const showRoll = !showScore || scoreViewMode === 'both'
  // Home covers the whole window: the practice rail and bars step aside for it
  const homeVisible = !midi || homeOpen
  // With the roll's own playbar hidden, notes land on the keys: this line marks it
  const midiError = useMidiSettings((s) => s.accessError)
  const [midiErrorSeen, setMidiErrorSeen] = useState(false)
  const { openFile } = useMidiFile()
  const { play, pause, stop } = usePlayback()
  useAudioEngine()
  useMidiInput()
  useMetronome()
  useCountIn()
  useChordSequence()

  // ── Mixer Console — Ctrl+Shift+M toggles open; also wired to the Console drawer icon ──

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false)
  const [dropError, setDropError]   = useState<string | null>(null)
  const dropErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Presentation Mode header hover reveal ─────────────────────────────────
  const [headerVisible, setHeaderVisible] = useState(false)
  const hideHeaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Show a timed error message, clearing any previous timer ──────────────
  const showDropError = useCallback((msg: string) => {
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
    setDropError(msg)
    dropErrorTimer.current = setTimeout(() => setDropError(null), 2500)
  }, [])

  // ── App zoom hint — "Zoom 125%", shown briefly whenever the level changes,
  // from either the Ctrl +/-/0 shortcuts (main process, before-input-event)
  // or the Settings → Appearance control. Both funnel through the same
  // main-process zoom:changed push, so this is the one place that reacts to
  // either source. Same transient-toast shape as the drop-error message
  // above, just a shorter 1s window since this is informational, not
  // something the user needs to read and act on. ───────────────────────────
  const [zoomHint, setZoomHint] = useState<string | null>(null)
  const zoomHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const onZoomChanged = ({ percent, capped }: { percent: number; capped: boolean }) => {
      if (zoomHintTimer.current) clearTimeout(zoomHintTimer.current)
      setZoomHint(`Zoom ${percent}%${capped ? ' (max)' : ''}`)
      zoomHintTimer.current = setTimeout(() => setZoomHint(null), 1000)
    }
    window.electronAPI.onZoomChanged(onZoomChanged)
    return () => window.electronAPI.offZoomChanged(onZoomChanged)
  }, [])

  // ── Parse and load a MIDI file by OS path into the player ───────────────
  // Handles foreign formats (MusicXML, Guitar Pro) by converting via alphaTab.
  // Checks for a valid on-disk cache before converting; sets pendingImportedFile
  // when conversion is done in-memory and not yet written to disk.
  // loadRequestIdRef guards against overlapping loads (e.g. two files dropped in
  // quick succession) racing to setMidi() out of order — see the matching guard
  // in SettingsPanel.tsx's handleLoadFile for the library-click equivalent.
  const loadRequestIdRef = useRef(0)
  const loadFileIntoPlayer = useCallback(async (filePath: string) => {
    const requestId = ++loadRequestIdRef.current
    const canDiscard = await confirmDiscardDirtyNoteEdits('Save changes before opening this file?')
    if (!canDiscard || requestId !== loadRequestIdRef.current) return
    const canDiscardTempoKey = await confirmDiscardDirtyTempoKey('Save tempo/key changes before opening this file?')
    if (!canDiscardTempoKey || requestId !== loadRequestIdRef.current) return

    const proceed = await confirmPendingImportBeforeSwitch(filePath)
    if (!proceed || requestId !== loadRequestIdRef.current) return // user cancelled — stay on current file

    const result = await window.electronAPI.loadMidiFromPath(filePath)
    if (!result || requestId !== loadRequestIdRef.current) return

    let base64    = result.base64
    let resolvedFilePath = filePath
    let parseName = result.fileName
    const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null

    try {
      const resolved = await resolveAndTrackImport(filePath, base64, result.fileName, libraryFolder)
      base64 = resolved.base64
      resolvedFilePath = resolved.filePath
      parseName = resolved.fileName
    } catch (e: any) {
      showDropError(e?.message ?? 'Could not convert this file to MIDI.')
      return
    }
    if (requestId !== loadRequestIdRef.current) return

    const bytes  = base64ToBytes(base64)
    // _filePath = original source, or the on-disk .mid cache once a foreign-format
    // import has been saved — editing tools must save against a real .mid, not
    // the foreign source file (see resolveAndTrackImport).
    const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, resolvedFilePath)
    useStore.getState().setMidi(parsed)
    const raw = parsed as any
    if (raw._keySignature != null) {
      useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
    } else {
      useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
    }
  }, [showDropError])

  // ── Load a dropped file by its real OS path ───────────────────────────────
  // Stops playback, copies into the library if the file is external, rescans,
  // then parses and loads directly — does not call store.loadLibraryFile because
  // parseMidiBuffer is not imported in store/index.ts and would fail at runtime.
  const loadDroppedFilePath = useCallback(async (filePath: string) => {
    stop()

    // Cast needed: library fields are implemented but not declared in PliageStore interface
    const store         = useStore.getState() as any
    const libraryFolder = store.libraryFolder as string | null

    if (!libraryFolder) {
      // No library configured — load directly from wherever the file lives
      await loadFileIntoPlayer(filePath)
      return
    }

    const normLib  = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const normFile = filePath.replace(/\\/g, '/').toLowerCase()
    const isInside = normFile.startsWith(normLib + '/')

    if (isInside) {
      await loadFileIntoPlayer(filePath)
      return
    }

    // File is outside the library — copy in, rescan, then load the copy
    try {
      const destPath = await window.electronAPI.copyMidiToLibrary(filePath, libraryFolder)
      const files    = await window.electronAPI.scanMidiFolder(libraryFolder)
      store.setLibraryFiles(files)
      await loadFileIntoPlayer(destPath)
    } catch (err) {
      console.error('[Pliage] copyMidiToLibrary failed:', err)
      showDropError('Could not copy file into library.')
    }
  }, [stop, showDropError, loadFileIntoPlayer])

  // ── Validate that a DataTransfer item is a supported file format ─────────────
  function isSupportedFile(file: File): boolean {
    return /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i.test(file.name)
  }

  // ── dragover: prevent browser default navigation + show highlight ─────────
  // OS file drags trigger the import overlay. Internal drags (TrackPanel/
  // Console/Library row reorders — no 'Files' type) still get preventDefault
  // here so the cursor stays a plain 'move' whenever the pointer crosses a
  // gap between row-level drop targets — without it, Chromium falls back to
  // the native no-drop icon in every such gap, which reads as a blinking
  // red circle during any internal drag.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) { e.preventDefault(); return }
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  // ── dragleave: only clear highlight when leaving the container entirely ────
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  // ── drop: validate, then load or confirm ─────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!isSupportedFile(file)) {
      showDropError('Unsupported file type. Pliage accepts .mid, .musicxml, .mxl, .gp/.gp5, .cap, and .kar files.')
      return
    }

    const filePath = window.electronAPI.getPathForFile(file)

    if (useStore.getState().midi !== null) {
      // A file is already loaded — ask before replacing
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
      const label    = fileName.length > 40 ? fileName.slice(0, 37) + '…' : fileName
      const choice   = await confirmDialog({
        message: `Load "${label}"? This will replace the currently open file.`,
        buttons: ['Load File', 'Cancel'],
      })
      if (choice === 0) await loadDroppedFilePath(filePath)
    } else {
      await loadDroppedFilePath(filePath)
    }
  }, [loadDroppedFilePath, showDropError])


  // ── Dev-only: expose Phase 0 round-trip test on window ───────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__pliageNoteEditorRoundTripTest = runNoteEditorRoundTripTest
      ;(window as any).__pliageHandAssignmentTest = runHandAssignmentTest
      ;(window as any).__pliageHandMetadataTest = runHandMetadataTest
      ;(window as any).__pliageChordVocabularyTest = runChordVocabularyTest
      ;(window as any).__pliageBeatGridTest = runBeatGridTest
      ;(window as any).__pliageTrackChordRoleTest = runTrackChordRoleTest
      ;(window as any).__pliageChordSequenceBuilderTest = runChordSequenceBuilderTest
      ;(window as any).__pliageMidiDiagnosticsTest = runMidiDiagnosticsTest
    }
  }, [])

  // ── Resolve all pending state before closing — single authoritative handler ─
  // main.ts sends app:save-before-close on every close attempt; this handler
  // runs each check in sequence via confirmDialog() and only calls confirmClose()
  // when everything is resolved. Returning without calling confirmClose() leaves
  // the app open (user cancelled one of the dialogs).
  useEffect(() => {
    const handler = async () => {
      // 1. Note Editor unsaved changes
      if (NES.dirty) {
        const choice = await confirmDialog({
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in the Note Editor.',
          buttons: ['Save', 'Discard', 'Cancel'],
        })
        if (choice === 2) return  // Cancel — leave app open
        if (choice === 0) {
          const ok = await NES.onSaveRequest?.()
          if (!ok) return         // save failed or cancelled — leave app open
        }
        // Discard (1) or successful save — fall through
      }

      // 2. Tempo/Key unsaved changes (only if the Settings toggle is on)
      {
        const s = useStore.getState()
        const tempoKeyDirty = s.saveTempoKeyChangesEnabled && !!s.midi &&
          (s.bpm !== s.originalBpm || (s.detectedKey?.transpose ?? 0) !== 0)
        if (tempoKeyDirty) {
          const choice = await confirmDialog({
            title: 'Unsaved Tempo/Key Changes',
            message: 'You have unsaved tempo/key changes.',
            buttons: ['Save', 'Discard', 'Cancel'],
          })
          if (choice === 2) return  // Cancel — leave app open
          if (choice === 0) {
            const ok = await saveTempoKeyChanges()
            if (!ok) return
          }
        }
      }

      // 3. Pending imported file (MusicXML/GP converted but not yet saved as .mid)
      const pending = useStore.getState().pendingImportedFile
      if (pending) {
        const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null
        const cachePath = getCachePath(pending.sourcePath, libraryFolder)
        const choice = await confirmDialog({
          message: `Save imported file "${pending.fileName}" as a MIDI file?`,
          detail: `The original file is never modified.`,
          buttons: ['Save as MID', "Don't Save", 'Cancel'],
        })
        if (choice === 2) return  // Cancel — leave app open
        if (choice === 0) {
          await (window.electronAPI as any).writeCachedImport(cachePath, pending.midiBase64)
        }
        useStore.getState().setPendingImportedFile(null)
      }

      // Nothing left pending — tell main process it is safe to close
      window.electronAPI.confirmClose()
    }
    window.electronAPI.onSaveBeforeClose(handler)
    return () => window.electronAPI.offSaveBeforeClose()
  }, [])

  // ── Presentation Mode side effects — OS fullscreen + Note Editor teardown ──
  useEffect(() => {
    window.electronAPI.setFullScreen(presentationMode)
    if (presentationMode) {
      setHeaderVisible(false)
      useStore.getState().setNoteEditorActive(false)
    }
  }, [presentationMode])

  // ── Unsolo edit track when Note Editor exits ─────────────────────────────
  useEffect(() => {
    let prev = useStore.getState().noteEditorActive
    return useStore.subscribe((s) => {
      if (!s.noteEditorActive && prev) useStore.getState().unsoloTrackForEdit()
      prev = s.noteEditorActive
    })
  }, [])

  // ── Enter Presentation Mode with NES dirty-check guard ───────────────────
  // If Note Editor has unsaved changes, prompts Save/Discard/Cancel before
  // entering. Mirrors the pattern in SettingsPanel.handleLoadFile.
  const enterPresentationMode = useCallback(async () => {
    const { noteEditorActive } = useStore.getState()
    if (noteEditorActive && NES.dirty) {
      const choice = await confirmDialog({
        title: 'Unsaved Changes',
        message: 'Save note editor changes before entering Presentation Mode?',
        detail: 'Your edits will be preserved in the file.',
        buttons: ['Save', 'Discard', 'Cancel'],
      })
      if (choice === 2) return
      if (choice === 0) {
        const ok = await NES.onSaveRequest?.()
        if (!ok) return
      }
      NES.dirty = false
    }
    useStore.getState().setPresentationMode(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + , opens/closes Settings from anywhere — even while typing in its search box
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        const s = useStore.getState()
        if (s.settingsWindowOpen) s.closeSettingsWindow(); else s.openSettingsWindow()
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // The Results screen sits over everything: Esc closes it, and nothing plays under it
      if (useStore.getState().practiceResult) {
        if (e.key === 'Escape') useStore.setState({ practiceResult: null })
        return
      }
      if (useStore.getState().setRun?.stage === 'summary') {
        if (e.key === 'Escape') closeSet()
        return
      }
      // Settings window open: only Esc (it closes itself) and Ctrl + , get through
      if (useStore.getState().settingsWindowOpen && e.key !== 'Escape' && !(e.ctrlKey && e.key === ',')) return
      const { playbackState } = useStore.getState()
      switch (e.key) {
        case 'F11':
          e.preventDefault()
          if (useStore.getState().presentationMode) useStore.getState().setPresentationMode(false)
          else enterPresentationMode()
          break
        case ' ':
          e.preventDefault()
          // During a Tap Tempo session Space is a tap, not play/pause
          if (isTapCapturing()) { if (!e.repeat) registerTap(); break }
          // Space during a count-in stops it (nothing plays)
          if (isCountingIn()) { cancelCountIn(); break }
          // An export pauses the song and keeps it paused until it finishes
          if (isExporting()) break
          // An Explorer that paused the song keeps Space for itself
          if ((useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen) && useStore.getState().explorerPausesPlayback) break
          if (playbackState === 'playing') pause()
          else play()
          break
        case 'ArrowRight':
        case 'ArrowLeft': {
          // → / ← step to the next / previous played event (Shift: a bar).
          // A focused fader or knob uses the arrows itself (and has already
          // handled this press), so leave those alone.
          if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) break
          if ((e.target as HTMLElement | null)?.closest?.('[role="slider"], select, [contenteditable="true"]')) break
          const s = useStore.getState()
          if (!s.stepThroughEnabled || !s.midi || s.chordExplorerOpen || s.scaleExplorerOpen || s.lockedChordModalOpen || s.tapSession || isCountingIn()) break
          e.preventDefault()
          stepEvents(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey)
          break
        }
        case 'Escape':
          // The Settings window closes itself on Escape — never stop the song
          if (useStore.getState().settingsWindowOpen) break
          if (isCountingIn()) { cancelCountIn(); break }
          if (useStore.getState().tapSession) { cancelTap(); break }
          if (useStore.getState().presentationMode) { useStore.getState().setPresentationMode(false); break }
          // Chord Explorer, Scale Explorer, and the Locked Chord modal all have
          // their own Escape handler (closes the panel without stopping
          // playback) — none of them call stopPropagation, and this listener
          // (registered at app mount) fires before theirs, so skip stop() here
          // while any is open or it would fire in addition to the close.
          if (useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen || useStore.getState().lockedChordModalOpen) break
          stop()
          break
        case 'o':
        case 'O':
          if (e.ctrlKey) { e.preventDefault(); openFile() }
          break
        case 'm':
        case 'M':
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault()
            const s = useStore.getState()
            s.setMixerOpen(!s.mixerOpen)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [play, pause, stop, openFile, enterPresentationMode])

  // ── Global: blur non-text controls after a real mouse click ─────────────
  // `:focus-visible` (index.css) is spec-correct, not buggy — but it isn't
  // "did THIS keypress activate THIS element," it's "is the page's input
  // modality currently keyboard AND does this element currently have
  // focus." A mouse click leaves a button focused (normal browser
  // behavior); the very next keypress ANYWHERE — including Space for
  // play/pause, which is a global shortcut here and doesn't even depend on
  // focus — flips that modality flag and the stale-focused button suddenly
  // shows its ring, for a keypress that had nothing to do with it. Blurring
  // right after a genuine mouse click removes the stale focus so there's
  // nothing left for a later keypress to light up.
  // `event.detail === 0` is what distinguishes a real pointer click from a
  // synthetic 'click' the browser fires when Enter/Space activates a
  // focused element via the keyboard — that case is skipped so real
  // keyboard activation keeps its ring exactly as intended. Text-entry
  // elements are excluded since clicking into an input must keep it
  // focused to type. ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.detail === 0) return
      const el = e.target
      // Element, not HTMLElement — most of this app's buttons render an SVG
      // icon as their visible content, and a click's real target is often
      // that <svg>/<path>, not the <button> itself. SVGElement is NOT an
      // HTMLElement (separate DOM interfaces), so the HTMLElement check
      // silently rejected every icon-button click before ever reaching
      // .closest() — confirmed live via a real CDP-dispatched click on the
      // Play button, which stayed focused because of exactly this. .closest()
      // itself works fine starting from an SVG element in any current browser.
      if (!(el instanceof Element)) return
      const focusable = el.closest<HTMLElement>('button, a[href], [role="button"], [tabindex]')
      if (!focusable) return
      if (focusable.matches('input, textarea, select') || focusable.isContentEditable) return
      focusable.blur()
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  // A song that opens, by any route, is what the home page was for
  useEffect(() => { if (midi) useStore.getState().setHomeOpen(false) }, [midi])

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--ui-floor)', overflow: 'hidden', display: 'flex', fontFamily: 'var(--font-ui)' }}>

      {!presentationMode && !homeVisible && <PracticeRail />}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Presentation Mode: TopBar slides in from top on hover ─────────────
          In normal mode TopBar is in-flow; in PM it becomes a fixed overlay.
          On Home it only hides: it carries the tap-tempo and tempo-trust hooks. ── */}
      {presentationMode ? (
        <>
          <PresentationBar />
          {/* Hover zone — 8px strip at top edge that reveals the header ────── */}
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, height: 8,
              zIndex: 10001,
              pointerEvents: headerVisible ? 'none' : 'auto',
            }}
            onMouseEnter={() => {
              if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
              setHeaderVisible(true)
            }}
          />
          {/* Sliding TopBar wrapper — translates up when hidden ────────────── */}
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
              transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)',
              transition: 'transform 0.25s ease',
            }}
            onMouseEnter={() => {
              if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
            }}
            onMouseLeave={() => {
              if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
              hideHeaderTimerRef.current = setTimeout(() => setHeaderVisible(false), 400)
            }}
          >
            <TopBar />
          </div>
        </>
      ) : (
        <div style={{ display: homeVisible ? 'none' : 'block', flexShrink: 0 }}><TopBar /></div>
      )}

      {/* ── Drop zone — spans the full area below TopBar including both drawers ── */}
      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!presentationMode && <SettingsPanel />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {lessonActive && <LessonBanner />}
          <div data-piano-roll-area style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {showScore && (
              <div className="pr-score-bar">
                <span className="o-note">{t`Tap a note to jump there`}</span>
                <div className="o-seg" role="group" aria-label={t`View`}>
                  {([['roll', t`Roll`], ['score', t`Score`], ['both', t`Both`]] as const).map(([mode, label]) => (
                    <button key={mode} aria-pressed={scoreViewMode === mode} onClick={() => useStore.getState().setScoreViewMode(mode)}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            {showScore && <ScoreView bytes={scoreBytes} style={{ flex: showRoll ? '0 0 50%' : 1 }} />}
            {liveSheet && <ScoreView bytes={null} live style={{ flex: '1.5 1 0' }} />}
            {noteEditorActive && <NoteActions />}
            {showRoll && midi && <div style={{ flex: 1, minHeight: 0 }}><PianoRoll /></div>}
            {!presentationMode && <StepPill />}
            <LockHint />
            <CountInOverlay />
            <SetBar />
          </div>
          {keyboardMode === 'docked' && <div className="pr-playbar" aria-hidden="true" />}
          {keyboardMode === 'docked' && <Keyboard />}
          {keyboardMode === 'docked' && <KeyboardControls />}
        </div>
        {!presentationMode && <TrackPanel />}
        {(!midi || homeOpen) && <HomePage />}
        {lessonActive && <LessonPanel />}

        {/* ── Drag-over highlight overlay — pointer-events none so it doesn't ─
            block any child interaction; visible only while dragging ── */}
        {isDragOver && <DropOverlay />}
      </div>
      </div>

      {/* TopBar is the window's drag handle; with it hidden, this keeps the window movable */}
      {homeVisible && <div className="app-drag-region" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 16, zIndex: 61 }} />}

      {keyboardMode === 'floating' && <FloatingKeyboard />}
      <SettingsWindow />
      <ChordExplorer />
      <ScaleExplorer />
      <LockedChordModal />

      {/* ── Drop error toast — briefly shown for invalid file types. Click-to-
          dismiss alongside the 2.5s auto-clear timeout — if the user's eyes
          were on the file they dropped rather than this bottom-center toast,
          the explanation could otherwise vanish before it's read. ────────── */}
      {dropError && (
        <Tooltip title="Dismiss" description="Click anywhere on this message to close it.">
        <div
          role="alert"
          className="o-toast"
          onClick={() => {
            if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
            setDropError(null)
          }}
          style={{ cursor: 'pointer' }}>
          <span className="o-dot o-dot-alert" />{dropError}
        </div>
        </Tooltip>
      )}

      {/* ── Zoom level hint — briefly shown on Ctrl +/-/0 or the Settings →
          Appearance control, no click-to-dismiss (it clears itself quickly
          and carries nothing worth pausing to read/dismiss). ─────────────── */}
      {zoomHint && (
        <div
          role="status" className="o-toast" style={{ pointerEvents: 'none' }}>
          <span className="o-dot o-dot-on" />{zoomHint}
        </div>
      )}

      {/* ── No Web MIDI: the top bar shows it too, this says what to do ── */}
      {midiError && !midiErrorSeen && (
        <div role="alert" className="o-toast">
          <span className="o-dot o-dot-alert" />
          {/Android/.test(navigator.userAgent) ? t`MIDI isn’t available: the tablet didn’t allow it. Check Pliage’s permissions in Android settings.` : t`MIDI isn’t available: ${midiError}`}
          <button className="o-btn" onClick={() => setMidiErrorSeen(true)}>{t`Dismiss`}</button>
        </div>
      )}

      <SupportNote />

      {/* ── Mixer Console — floating modal, toggled via Ctrl+Shift+M or Console drawer icon ── */}
      <MixerConsole />

      <ResultsScreen />
      <SetSummary />

      {/* ── MIDI Playback Editor — floating modal, opened via Track Panel pencil icon ── */}
      <MidiEditor />

      {/* ── Note Editor Toolbar — floating draggable toolbar, toggled via pencil icon or Ctrl+Shift+N.
          Mounted only while active (not always-rendered with its own internal early return) — its
          Snap/Quantize/Note-names/Reassign-hands/Tool display state is all local useState seeded
          once from the NES module singleton, and NES.reset() (called on every close) mutates that
          singleton but has no way to push the change into an already-mounted component's state.
          Keeping the component always-mounted meant every one of those toggles silently kept
          whatever it displayed last across a close/reopen — most visibly Reassign Hands: NES.reset()
          correctly zeroed the real NES.reassignHandsMode, but the toolbar kept showing the OLD
          (stale) amber "on" state, so the very next click computed its `next` value off the real
          (already-false) NES value instead of the display's (stale-true) one — silently reading as
          unresponsive on that first click, and meanwhile every reassign-mode code path elsewhere
          (PianoRoll's context menu, hand-coloring) was correctly reading the real off value, so LH/
          RH options never appeared even though the icon looked on. Forcing a real unmount/remount
          on every open makes every local useState re-seed fresh from NES, which is what every
          consumer already assumed. ── */}
      {noteEditorActive && <NoteEditorToolbar />}

      {/* ── Confirm Dialog — themed replace for all native confirm/messageBox popups ── */}
      <ConfirmDialogHost />

    </div>
  )
}
