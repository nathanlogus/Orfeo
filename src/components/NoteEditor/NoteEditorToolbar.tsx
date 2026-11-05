import { useEffect, useState, useReducer, useRef, useCallback, useMemo, useSyncExternalStore } from 'react'
import { PenLine, SquareDashed, CircleDashed, Save, Undo2, Redo2, X, ChevronDown } from 'lucide-react'
import { useStore } from '../../store'
import { NES, buildNoteEditSummary, type NETool } from '../../utils/noteEditorState'
import { confirmDialog } from '../../utils/confirmController'
import { editableCopyToBuffer } from '../../utils/noteEditorCommands'
import { restoreLeadForSave } from '../../utils/smfLead'
import { buildHandExportHint } from '../../utils/handMetadata'
import { parseMidiBuffer } from '../../utils/midiParser'
import { songKey } from '../../utils/songIdentity'
import { carryCorrection } from '../../utils/tempoCorrection'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { getPianoRollAreaRect } from '../../utils/modalAnchors'
import { HAND_ASSIGN_GROUPS } from '../../utils/keyboardGroups'
import ExplorerMenu from '../ExplorerMenu'
import { noteSelection, selectionHand, assignSelectedHand } from './noteSelection'
import '../../styles/redesign-tools.css'

const HANDS = [
  { hand: 'L', label: 'Left hand', colour: 'var(--hand-lh)' },
  { hand: 'R', label: 'Right hand', colour: 'var(--hand-rh)' },
] as const

// Docks over the top bar, exactly as tall and as wide as it is: the roll keeps its
// size and the rail keeps Play. Opening it never moves a note on screen.
const dockRect = () => {
  const roll = getPianoRollAreaRect()
  return { left: roll?.left ?? 0, height: roll?.top ?? 0 }
}

// ── NoteEditorToolbar ─────────────────────────────────────────────────────────
// Docked along the top — appears when noteEditorActive is true.
// Reads/writes NES.* directly; subscribes to NES.onHistoryChange for re-renders.
export default function NoteEditorToolbar() {
  const noteEditorActive        = useStore(s => s.noteEditorActive)
  const setNoteEditorActive     = useStore(s => s.setNoteEditorActive)
  const noteEditorEnabled       = useStore(s => s.noteEditorEnabled)
  const unsoloTrackForEdit      = useStore(s => s.unsoloTrackForEdit)
  const soloTrackForEdit        = useStore(s => s.soloTrackForEdit)
  const noteEditorSoloTrackIndex = useStore(s => s.noteEditorSoloTrackIndex)
  // ── Display-relevant signature, not the live `tracks` array — same root
  // cause as TrackPanel.tsx/etc: the only read below (line ~402) is group/
  // isDrum, but every fader/pan/chorus/reverb drag replaced the whole array.
  const trackSignature = useStore(s => s.tracks.map(t => `${t.index}:${t.group ?? ''}:${t.isDrum}`).join('|'))
  const tracks                  = useMemo(() => useStore.getState().tracks, [trackSignature])
  const soloTrack               = useStore(s => s.tracks.find(t => t.index === s.noteEditorSoloTrackIndex))
  const velocityPanelOpen       = useStore(s => s.velocityPanelOpen)
  const setVelocityPanelOpen    = useStore(s => s.setVelocityPanelOpen)

  // ── Force re-render on history changes (push/undo/redo) ───────────────────
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // ── Local display state ───────────────────────────────────────────────────
  const [hintText,        setHintText]      = useState(NES.hoverHint)
  const [snapEnabled,     setSnapDisplay]   = useState(NES.snapRef.current)
  const [quantize,        setQuantizeDisplay] = useState(NES.quantizeDivisorRef.current)
  const [showNoteNames,   setNoteNamesDisplay] = useState(NES.showNoteNamesRef.current)
  const [activeTool,      setActiveToolDisplay] = useState<NETool>(NES.activeTool)
  const [reassignHands,   setReassignHandsDisplay] = useState(NES.reassignHandsMode)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  // ── Icon hover hint — replaces native `title` tooltips for every icon in
  // this panel. Hovering an icon shows its description in the hint strip
  // instead of a browser tooltip popup; moving off it reverts to the normal
  // tool-based context-aware text. Scoped entirely to hovering inside the
  // panel — the piano roll's own hover hints (NES.hoverHint) are untouched. ─
  const [iconHint, setIconHint] = useState<string | null>(null)
  // ── The notes selected on the roll, and the hand picker that assigns them ──
  useSyncExternalStore(noteSelection.subscribe, noteSelection.getVersion)
  useEffect(() => () => noteSelection.clear(), [])
  const [handMenuOpen, setHandMenuOpen] = useState(false)
  const closeHandMenu = useCallback(() => setHandMenuOpen(false), [])
  const handTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handler = () => setActiveToolDisplay(NES.activeTool)
    NES.onToolChange = handler
    return () => { if (NES.onToolChange === handler) NES.onToolChange = null }
  }, [])
  useEffect(() => {
    const handler = () => setReassignHandsDisplay(NES.reassignHandsMode)
    NES.onReassignHandsModeChange = handler
    return () => { if (NES.onReassignHandsModeChange === handler) NES.onReassignHandsModeChange = null }
  }, [])

  useEffect(() => {
    // Cleanup compared NES.onHistoryChange to `forceUpdate` (the dispatch),
    // but the assignment stores a NEW wrapper closure `() => forceUpdate()`
    // — never equal, so cleanup could never actually null the stale
    // handler. A resize/move interaction that pushed to history could then
    // silently update a detached instance's handler (left behind by an
    // earlier hot-reload) instead of the currently-rendered toolbar's, so
    // its Undo icon never re-rendered enabled — Ctrl+Z and the context
    // menu's Undo both read NES.history fresh each time, so they worked
    // regardless. Store the actual handler reference so cleanup can match it.
    const handler = () => forceUpdate()
    NES.onHistoryChange = handler
    return () => { if (NES.onHistoryChange === handler) NES.onHistoryChange = null }
  }, [])

  // ── Subscribe to hover hint changes from PianoRoll — context-aware: the
  // hint changes with tool/hover/selection state as the mouse moves. ───────
  useEffect(() => {
    const handler = () => setHintText(NES.hoverHint)
    NES.onHintChange = handler
    return () => { if (NES.onHintChange === handler) NES.onHintChange = null }
  }, [])

  // ── Force-exit edit mode when noteEditorEnabled is toggled off ────────────
  useEffect(() => {
    if (!noteEditorEnabled && noteEditorActive) {
      setNoteEditorActive(false)
      NES.reset()
    }
  }, [noteEditorEnabled, noteEditorActive, setNoteEditorActive])

  // ── Save handler — shown as a button in the toolbar, also registered on NES ──
  // Returns true on successful save, false if cancelled or failed.
  const handleSave = useCallback(async (): Promise<boolean> => {
    const sourcePath = (useStore.getState().midi as any)?._filePath as string | undefined
    if (!sourcePath || !NES.editMidi) return false

    // ── Inject hand-assignment export hint before encoding — same mechanism
    // the Playback Editor's editor:save uses server-side, done here instead
    // since noteEditor:save receives pre-encoded bytes with no track data of
    // its own to inject into. Without this, hand tags on NES.editMidi's
    // notes (copied in from the store at edit-mode entry — see
    // copyHandTagsOntoEditBuffer) never reach the saved file: editing
    // anything and saving silently discarded whatever hand tags existed.
    const editMidi = NES.editMidi
    const keptMeta = ((editMidi.header as any).meta ?? []).filter(
      (m: any) => !(typeof m.text === 'string' && (m.text.startsWith('ORFEO_HAND_MAP:') || m.text.startsWith('ORFEO_TRACK_HAND:')))
    )
    ;(editMidi.header as any).meta = keptMeta
    editMidi.tracks.forEach(track => {
      if (!track.notes.some((n: any) => n.hand !== undefined)) return
      // (track as any).index — the compacted (non-empty-tracks-only) index
      // midiToEditableCopy() stamps on this exact object, NOT the raw
      // forEach position. restoreHandTagsFromHints() on reload matches
      // ORFEO_HAND_MAP's trackIndex against ParsedTrack.index, which is
      // that same compacted numbering — using the raw loop index here
      // (as this used to) wrote the hint under the wrong track whenever an
      // empty filler track preceded the real one, so the manual/computed
      // tags silently failed to restore on the very next load.
      const hint = buildHandExportHint((track as any).index, track.name, track.notes as any)
      track.name = hint.name
      if (hint.meta) (editMidi.header as any).meta.push(hint.meta)
    })

    // A song opened with its empty bars skipped is saved with them put back:
    // the switch never changes a song on disk (utils/prepareSong.ts)
    const open   = useStore.getState().midi
    const lead   = open?._leadTick ?? 0
    const buf    = editableCopyToBuffer(lead > 0 && open?._origRaw ? restoreLeadForSave(NES.editMidi, open._origRaw, lead) : NES.editMidi)
    const bytes  = new Uint8Array(buf)
    let binary   = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)

    const saveSummary = buildNoteEditSummary(NES.history.appliedDescriptions())

    // Silent auto-version into the source's sibling Orfeo/ folder — same
    // convention as the Playback Editor and Mixer Console saves, no save
    // dialog (a dialog defaulting to a not-yet-created folder can silently
    // fall back to wherever the OS last had one open, e.g. Downloads).
    const result = await window.electronAPI.saveNoteEditor({ filePath: sourcePath, base64, summary: saveSummary })
    if (!result.ok) return false

    NES.dirty = false
    // Once saved, edits are no longer "unsaved" — clear the new/edited
    // note markers so the roll drops the outline-only fill and pulsing
    // border and everything renders with normal properties again.
    NES.newNotes.clear()
    NES.editedNotes.clear()
    NES.needsFlatRebuild = true
    NES.onHistoryChange?.()
    if (result.filePath) useStore.getState().notifyLibrarySaved(result.filePath)

    if (result.base64 && result.fileName && result.filePath) {
      const b   = atob(result.base64)
      const arr = new Uint8Array(b.length)
      for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i)
      const parsed = parseMidiBuffer(arr.buffer, result.fileName, result.filePath)
      // keep the song's tap-tempo correction on the saved version (timing unchanged)
      const moved = carryCorrection(useStore.getState().tempoCorrections, useStore.getState().songKey, songKey(arr.buffer), 1)
      if (moved) useStore.setState({ tempoCorrections: moved })
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
      // setMidi() just rebuilt `tracks` fresh from the reloaded file (all
      // visible by default) — it has no memory of the Hand toggle's visual
      // isolation, which lived only in the old (now-replaced) tracks array.
      // Re-solo the piano track post-reload if Hand mode is still on, or
      // the roll silently un-isolates back to all-11-tracks-visible right
      // after every save. noteEditorSoloTrackIndex is cleared first since
      // it may still equal the new piano track's index from before reload
      // — soloTrackForEdit would read that as "already soloed" and toggle
      // it OFF instead of re-applying it.
      // Deferred one tick — setMidi's `tracks` replacement can still be
      // getting picked up by other subscribers/effects reacting to the
      // same state change (e.g. TrackPanel, PianoRoll's store-ref sync);
      // running this synchronously right after setMidi risked a later
      // effect's own re-render clobbering the isolation right back.
      setTimeout(() => {
        if (!NES.reassignHandsMode) return
        const freshTracks = useStore.getState().tracks
        const kbTrack = freshTracks.find(t => HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum)
        if (kbTrack) {
          useStore.setState({ noteEditorSoloTrackIndex: null, preSoloTrackVisibility: null })
          useStore.getState().soloTrackForEdit(kbTrack.index, { keepPlayhead: true })
        }
      }, 0)
    }
    return true
  }, [])

  // ── Register save handler on NES so SettingsPanel and app-close can call it ──
  useEffect(() => {
    NES.onSaveRequest = handleSave
    return () => { if (NES.onSaveRequest === handleSave) NES.onSaveRequest = null }
  }, [handleSave])

  // ── Close handler — defined before early return (it's a useCallback/hook) ─
  const doClose = useCallback(async () => {
    if (NES.dirty) {
      setShowCloseConfirm(true)
      return
    }
    unsoloTrackForEdit()
    setNoteEditorActive(false)
    NES.reset()
  }, [setNoteEditorActive, unsoloTrackForEdit])

  const doConfirmSaveAndClose = useCallback(async () => {
    setShowCloseConfirm(false)
    const saved = await handleSave()
    if (!saved) return   // user cancelled save dialog — stay in editor
    unsoloTrackForEdit()
    setNoteEditorActive(false)
    NES.reset()
  }, [handleSave, setNoteEditorActive, unsoloTrackForEdit])

  const doConfirmDiscardAndClose = useCallback(() => {
    setShowCloseConfirm(false)
    unsoloTrackForEdit()
    setNoteEditorActive(false)
    NES.reset()
  }, [setNoteEditorActive, unsoloTrackForEdit])

  // ── Follows the top bar when the window (or the app's zoom) resizes it ─────
  const [dock, setDock] = useState(dockRect)
  useEffect(() => {
    const place = () => setDock(dockRect())
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])


  // ── Setters — update NES ref AND local display state ──────────────────────
  const setSnap = (v: boolean) => {
    NES.snapRef.current = v
    setSnapDisplay(v)
  }
  const setQuantize = (d: typeof NES.quantizeDivisorRef.current) => {
    NES.quantizeDivisorRef.current = d
    setQuantizeDisplay(d)
  }
  const toggleNoteNames = () => {
    const next = !NES.showNoteNamesRef.current
    NES.showNoteNamesRef.current = next
    setNoteNamesDisplay(next)
  }
  const doUndo = () => {
    if (NES.history.undo()) { NES.syncEditedNotes(); NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
  }
  const doRedo = () => {
    if (NES.history.redo()) { NES.syncEditedNotes(); NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
  }
  const doReset = async () => {
    if (NES.dirty) {
      const choice = await confirmDialog({
        title: 'Reset Note Editor',
        message: 'Discard all changes in this editing session?',
        buttons: ['Discard', 'Cancel'],
        destructiveIndex: 0,
      })
      if (choice !== 0) return
    }
    noteSelection.clear() // the reset rebuilds every note: these ones are gone
    NES.onResetRequest?.()
  }
  // Clicking the already-active tool turns it back off (returns to Select,
  // the default) instead of doing nothing — click = active, click again =
  // inactive, same toggle behavior every other mode button here already has.
  const setTool = (t: NETool) => {
    const next = NES.activeTool === t ? 'select' : t
    NES.activeTool = next
    setActiveToolDisplay(next)
  }
  // ── Reassign-hands toggle — separate from the Settings LH/RH algorithm
  // toggle; this only controls whether the editor shows hand colors and
  // Assign LH/RH right now. Turning it on visually isolates the piano/keys
  // track on the roll and keyboard (soloTrackForEdit hides every other
  // track's `visible` — audio is untouched, purely visual), forcing it even
  // if some other track happens to be soloed — correction always happens on
  // exactly one track anyway, so there's never a reason to be looking at 11
  // others while doing it. Turning it back off restores whatever was
  // visible before — the isolation is scoped to Hand mode, not a permanent
  // visibility change. ──────────────────────────────────────────────────
  const toggleReassignHands = () => {
    const next = !NES.reassignHandsMode
    NES.reassignHandsMode = next
    setReassignHandsDisplay(next)
    if (next) {
      const kbTrack = tracks.find(t => HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum)
      // keepPlayhead — engaging hand-reassign mode must not move the playhead;
      // the user is paused at a specific bar to correct a note they just heard.
      if (kbTrack && noteEditorSoloTrackIndex !== kbTrack.index) soloTrackForEdit(kbTrack.index, { keepPlayhead: true })
    } else {
      unsoloTrackForEdit()
    }
  }

  const canUndo = NES.history.canUndo
  const canRedo = NES.history.canRedo
  const selected = noteSelection.size
  const hand = selectionHand()
  const handNow = HANDS.find(h => h.hand === hand)

  // ── Static per-tool blurb (line 1) + live hover-driven hint (line 2) —
  // context-aware: line 2 changes with tool/hover/selection state as
  // PianoRoll's updateHoverState reports it, falling back to a per-tool
  // idle blurb when the cursor is outside the roll (NES.defaultHint). ──────
  const toolTooltip: Record<NETool, [string, string]> = {
    select: ['Select — click/shift-click notes, drag to move/resize', 'Drag empty space to pan · Shift+wheel to scrub finely'],
    pen:    ['Pen — Alt+click empty space to add a note', 'Click a note to mark it for delete'],
    marquee:['Marquee — drag a box over a cluster to select it', 'Shift+drag adds to the current selection'],
    lasso:  ['Lasso — drag through notes to select them', 'Shift+drag adds to the current selection'],
  }
  const [tipLine1, tipLine2] = toolTooltip[activeTool]

  // ── Renders "Label — description" text with the label dimmed-amber —
  // shared by tipLine1 and every icon's hover hint so they read as one
  // consistent system. ──────────────────────────────────────────────────
  const renderTip = (text: string) => {
    const dashIdx = text.indexOf(' — ')
    if (dashIdx === -1) return text
    return (
      <>
        <b>{text.slice(0, dashIdx)}</b>
        {text.slice(dashIdx)}
      </>
    )
  }
  // ── Icon hover handlers — set/clear the row-3 hint instead of a native
  // `title` tooltip. ────────────────────────────────────────────────────
  const hintHandlers = (hint: string) => ({
    onMouseEnter: () => setIconHint(hint),
    onMouseLeave: () => setIconHint(null),
  })

  const tools: { id: NETool; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'marquee', label: 'Marquee', hint: 'Marquee — drag a box over a cluster to select it', icon: <SquareDashed size={16} /> },
    { id: 'lasso', label: 'Lasso', hint: 'Freehand select — drag through notes to select them', icon: <CircleDashed size={16} /> },
    { id: 'pen', label: 'Pen', hint: 'Pen — Alt+click to add, click a note to mark for delete', icon: <PenLine size={16} /> },
  ]
  const shows = [
    { label: 'Note names', on: showNoteNames, toggle: toggleNoteNames, hint: 'Note names — show pitch labels on notes' },
    { label: 'Assign hands', on: reassignHands, toggle: toggleReassignHands, hint: 'Reassign hands — show LH/RH colors and enable Assign LH/RH' },
    { label: 'Velocity', on: velocityPanelOpen, toggle: () => setVelocityPanelOpen(!velocityPanelOpen), hint: velocityPanelOpen ? 'Velocity lane — hide the velocity editor' : noteEditorSoloTrackIndex !== null ? 'Velocity lane — edit velocity for the soloed track' : 'Velocity lane — solo a track to edit its velocity' },
    { label: 'Snap', on: snapEnabled, toggle: () => setSnap(!snapEnabled), hint: snapEnabled ? 'Snap ON — moving, resizing or adding a note rounds its timing to the grid' : 'Snap OFF — moved/resized/added notes keep their exact dragged timing' },
  ]

  return (
    <div
      role="toolbar"
      aria-label="Note Editor toolbar"
      data-instant
      className="orfeo-modal-glow theme-studio xp-ne"
      style={{ left: dock.left, minHeight: dock.height }}
    >
      {/* ── Yellow header — what's selected and its hand, the track, undo/redo, save ── */}
      <div className="xp-ne-head">
        <PenLine size={22} aria-hidden />
        <span className="xp-ne-title">Editing notes</span>
        <button ref={handTriggerRef} className="xp-ne-pick" aria-label="Hand of the selected notes" aria-haspopup="listbox" aria-expanded={handMenuOpen} disabled={selected === 0} onClick={() => setHandMenuOpen(v => !v)} {...hintHandlers('Hand — assign the selected notes to the left or right hand')}>
          {handNow && <span className="xp-ne-swatch" style={{ background: handNow.colour }} />}
          <span>{handNow?.label ?? (hand === 'mixed' ? 'Mixed hands' : 'Hand')}</span>
          <ChevronDown size={14} />
        </button>
        <span className="xp-ne-count" role="status">{selected} {selected === 1 ? 'note' : 'notes'} selected</span>
        <span className="xp-ne-track">
          {soloTrack && <span className="xp-ne-swatch" style={{ background: soloTrack.color }} />}
          <span>{soloTrack ? soloTrack.trackName : 'Click a track in the Tracks panel to solo it for editing'}</span>
        </span>
        <div className="o-spacer" />
        <button className="xp-ne-round" aria-label="Undo" onClick={doUndo} disabled={!canUndo} {...hintHandlers('Undo — revert the last edit (Ctrl+Z)')}><Undo2 size={18} /></button>
        <button className="xp-ne-round" aria-label="Redo" onClick={doRedo} disabled={!canRedo} {...hintHandlers('Redo — reapply the last undone edit (Ctrl+Y)')}><Redo2 size={18} /></button>
        <button className="xp-ne-link" onClick={() => void doReset()} {...hintHandlers('Reset — discard all edits and restore original')}>Reset</button>
        <button className="xp-ne-save" onClick={() => void handleSave()} {...hintHandlers('Save & Reload — save edits as a new versioned copy (_ORFEO_vN)')}><Save size={16} /> Save &amp; Reload</button>
        <button className="xp-ne-round" aria-label="Close" onClick={() => void doClose()} {...hintHandlers('Close — exit edit mode')}><X size={18} /></button>
      </div>

      {/* ── Black band — tools, what's shown, quantize grid ──────────────────── */}
      <div className="xp-ne-tools">
        <span className="xp-note">Tools</span>
        <div className="xp-seg" data-accent data-tile role="group" aria-label="Tools">
          {tools.map(tool => (
            <button key={tool.id} aria-pressed={activeTool === tool.id} onClick={() => setTool(tool.id)} {...hintHandlers(tool.hint)}>{tool.icon}{tool.label}</button>
          ))}
        </div>
        <span className="xp-note" style={{ marginLeft: 8 }}>Show</span>
        {shows.map(item => (
          <button key={item.label} className="xp-ne-show" aria-pressed={item.on} onClick={item.toggle} {...hintHandlers(item.hint)}>{item.label}</button>
        ))}
        <div className="o-spacer" />
        <span className="xp-note">Quantize</span>
        <div className="xp-seg" data-tile role="group" aria-label="Quantize grid" {...hintHandlers(`Quantize grid — the grid unit Snap rounds to (currently 1/${quantize}); has no effect while Snap is off`)}>
          {([4, 8, 16, 32] as const).map(d => (
            <button key={d} aria-pressed={d === quantize} onClick={() => setQuantize(d)}>1/{d}</button>
          ))}
        </div>
      </div>

      {/* ── Live hint — a strip over the roll's edge, so the roll never moves ──── */}
      <div className="xp-ne-hint">
        {iconHint ? renderTip(iconHint) : <>{renderTip(tipLine1)} · {hintText === NES.defaultHint && selected > 0 ? 'Right-click for options' : hintText || tipLine2}</>}
      </div>

      {handMenuOpen && (
        <ExplorerMenu trigger={handTriggerRef} width={220} onClose={closeHandMenu}>
          {HANDS.map(h => (
            <button key={h.hand} aria-selected={hand === h.hand} onClick={() => { assignSelectedHand(h.hand); closeHandMenu() }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="xp-ne-swatch" style={{ background: h.colour }} />{h.label}</span>
            </button>
          ))}
        </ExplorerMenu>
      )}

      {/* ── Unsaved-changes close confirmation ────────────────────────────────── */}
      {showCloseConfirm && (
        <div className="xp-ne-confirm">
          <span style={{ flex: 1 }}>Unsaved changes</span>
          <button className="o-btn-quiet" style={{ color: '#fff', cursor: 'pointer' }} onClick={doConfirmDiscardAndClose}>Discard</button>
          <button className="xp-ne-show" aria-pressed={false} onClick={() => setShowCloseConfirm(false)}>Cancel</button>
          <button className="o-btn-primary" style={{ cursor: 'pointer' }} onClick={() => void doConfirmSaveAndClose()}>Save &amp; Exit</button>
        </div>
      )}
    </div>
  )
}
