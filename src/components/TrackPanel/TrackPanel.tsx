import { useMemo, useState, useRef, useEffect } from 'react'
import { Eye, Volume2, VolumeX, ChevronDown, GripVertical, Music2, Focus, X, Pencil } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { GM_GROUPS } from '../../utils/gmInstruments'
import type { TrackState } from '../../types'
import { MarqueeText } from '../MarqueeText'
import { usePlayback } from '../../hooks/usePlayback'
import { NES } from '../../utils/noteEditorState'
import Tooltip from '../Tooltip'
import PianoKeysIcon from '../PianoKeysIcon'
import { NoteCounter } from '../Keyboard/KeyboardControls'

const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

// ── EyeClosed — custom icon replacing lucide EyeOff ──────────────────────────
function EyeClosed({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-.722-3.25"/>
      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
      <path d="m20 15-1.726-2.05"/>
      <path d="m4 15 1.726-2.05"/>
      <path d="m9 18 .722-3.25"/>
    </svg>
  )
}

// ── PencilSparkles icon — open MIDI Playback Editor (not in installed lucide-react v0.503.0, inlined) ──
function PencilSparklesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3H8"/><path d="m15.007 5.008 3.987 3.986"/><path d="M20 15v4"/><path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="M22 17h-4"/><path d="M4 5v4"/><path d="M6 7H2"/><path d="M9 2v2"/>
    </svg>
  )
}

// ── Track panel — collapsible right drawer with instrument group list and track controls
export default function TrackPanel() {
  // ── Lightweight track display-signature — NOT the live `tracks` array. Same
  // root cause as MixerConsole.tsx/ChannelStrip.tsx/MasterStrip.tsx: every
  // fader/pan/chorus/reverb drag replaces the whole `tracks` array (new
  // reference) many times a second, but none of those fields are rendered
  // here — only group/name/color/mute/solo/visibility/keyboard/channel/
  // program/isDrum are. Subscribing to `s.tracks` directly reproduced the
  // same fader-drag stutter already fixed in the Mixer's own components; a
  // joined string is value-equal across renders whenever none of these
  // display-relevant fields changed. ──────────────────────────────────────
  const trackSignature = useStore((s) => s.tracks.map((t) =>
    `${t.index}:${t.group ?? ''}:${t.trackName ?? ''}:${t.gmName}:${t.color}:${t.muted}:${t.solo}:${t.visible}:${t.showOnKeyboard}:${(t as any).channel}:${t.program}:${t.isDrum}`
  ).join('|'))
  const tracks = useMemo(() => useStore.getState().tracks, [trackSignature])
  const midi = useStore((s) => s.midi)
  const trackPanelOpen = useStore((s) => s.trackPanelOpen)
  const setTrackPanelOpen = useStore((s) => s.setTrackPanelOpen)
  const updateTrack = useStore((s) => s.updateTrack)
  const muteGroup = useStore((s) => s.muteGroup)
  const setTrackMuteFilter = useStore((s) => s.setTrackMuteFilter)
  const autoMuteNonKeyboard = useStore((s) => s.autoMuteNonKeyboard)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // ── Drag-to-reorder — session-only display order, never written to the file.
  // Piano/keys always stays pinned first (see `grouped` below) — group drag is
  // simply disabled for it, and it's excluded from any custom order snapshot.
  const [customGroupOrder, setCustomGroupOrder] = useState<string[] | null>(null)
  const [customTrackOrder, setCustomTrackOrder] = useState<Record<string, number[]>>({})
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)
  const [draggedTrack, setDraggedTrack] = useState<{ group: string; index: number } | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null)
  // ── Global visibility toggle — same allVisible pattern as the Console
  // Mixer's MasterStrip, reading/writing the same track.visible field so
  // both controls always agree. ─────────────────────────────────────────
  const setAllVisible = (visible: boolean) => tracks.forEach((t) => updateTrack(t.index, { visible }))
  const midiEditorOpen          = useStore((s) => s.midiEditorOpen)
  const noteEditorEnabled       = useStore((s) => s.noteEditorEnabled)
  const noteEditorActive        = useStore((s) => s.noteEditorActive)
  const setNoteEditorActive     = useStore((s) => s.setNoteEditorActive)
  const noteEditorSoloTrackIndex = useStore((s) => s.noteEditorSoloTrackIndex)
  const soloTrackForEdit        = useStore((s) => s.soloTrackForEdit)
  const playbackState           = useStore((s) => s.playbackState)
  const { pause } = usePlayback()

  // ── Open editor — sets store flag; MidiEditor floating modal reads from store ─
  // Gated on confirmPendingImportBeforeEdit: an imported foreign-format file
  // must be saved as a real .mid before any Orfeo editing tool can touch it.
  const handleOpenEditor = async () => {
    if (!midi) return
    const { confirmPendingImportBeforeEdit } = await import('../../utils/foreignFormatImport')
    if (!(await confirmPendingImportBeforeEdit())) return
    useStore.getState().setMidiEditorOpen(true)
  }

  // ── Toggle note edit mode — moved here from TopBar; same gating (only
  // visible/enabled when noteEditorEnabled in Settings, and a file is loaded) ──
  const handleToggleNoteEditor = async () => {
    if (noteEditorActive) {
      setNoteEditorActive(false)
      NES.reset()
      return
    }
    const { confirmPendingImportBeforeEdit } = await import('../../utils/foreignFormatImport')
    if (!(await confirmPendingImportBeforeEdit())) return
    if (playbackState === 'playing') pause()
    NES.reset()
    setNoteEditorActive(true)
  }

  // ── Group tracks — partition by GM group key. Default order is GROUP_ORDER;
  // customGroupOrder/customTrackOrder (drag-reorder, session-only) override it
  // when present. Piano always renders first regardless — pinned, not draggable.
  const grouped = useMemo(() => {
    const map = new Map<string, TrackState[]>()
    for (const track of tracks) {
      const g = track.group ?? 'sfx'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(track)
    }
    const present = GROUP_ORDER.filter(g => map.has(g))
    const nonPiano = present.filter(g => g !== 'piano')
    const orderedNonPiano = customGroupOrder
      ? [...customGroupOrder.filter(g => nonPiano.includes(g)), ...nonPiano.filter(g => !customGroupOrder!.includes(g))]
      : nonPiano
    const orderedKeys = present.includes('piano') ? ['piano', ...orderedNonPiano] : orderedNonPiano

    return orderedKeys.map(g => {
      const groupTracks = map.get(g)!
      const order = customTrackOrder[g]
      const orderedTracks = order
        ? [...order.map(idx => groupTracks.find(t => t.index === idx)).filter((t): t is TrackState => !!t),
           ...groupTracks.filter(t => !order.includes(t.index))]
        : groupTracks
      return { key: g, label: GM_GROUPS[g]?.label ?? g, tracks: orderedTracks }
    })
  }, [tracks, customGroupOrder, customTrackOrder])

  // ── Group drag-to-reorder — piano is never draggable and never a valid drop
  // target's displacement (it's excluded from the reorderable list entirely,
  // so nothing can end up ahead of it). ────────────────────────────────────
  const reorderGroups = (draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey || draggedKey === 'piano' || targetKey === 'piano') return
    const base = customGroupOrder ?? grouped.filter(g => g.key !== 'piano').map(g => g.key)
    // ── Direction-aware insert — splicing at a flat `without.indexOf(target)`
    // always inserts BEFORE the target regardless of drag direction, which
    // only reads right when dragging upward. Dragging downward needs to
    // insert AFTER the target (the dragged item's removal shifts everything
    // below it up by one), or the reflow stalls/oscillates on every
    // downward hover instead of actually passing the target row — this was
    // the "up works, down doesn't" bug. ─────────────────────────────────────
    const movingDown = base.indexOf(targetKey) > base.indexOf(draggedKey)
    const without = base.filter(k => k !== draggedKey)
    const targetIdx = without.indexOf(targetKey) + (movingDown ? 1 : 0)
    without.splice(targetIdx, 0, draggedKey)
    setCustomGroupOrder(without)
  }

  // ── Track drag-to-reorder within a single group ───────────────────────────
  const reorderTracks = (groupKey: string, draggedIndex: number, targetIndex: number) => {
    if (draggedIndex === targetIndex) return
    const groupTracksNow = grouped.find(g => g.key === groupKey)?.tracks.map(t => t.index) ?? []
    const base = customTrackOrder[groupKey] ?? groupTracksNow
    // ── Direction-aware insert — see reorderGroups above for why: inserting
    // at a flat `without.indexOf(target)` only reads right moving upward;
    // downward drags need +1 or the reflow stalls on every downward hover. ──
    const movingDown = base.indexOf(targetIndex) > base.indexOf(draggedIndex)
    const without = base.filter(i => i !== draggedIndex)
    const targetIdx = without.indexOf(targetIndex) + (movingDown ? 1 : 0)
    without.splice(targetIdx, 0, draggedIndex)
    setCustomTrackOrder(prev => ({ ...prev, [groupKey]: without }))
  }

  const hasSolo = tracks.some(t => t.solo)

  // ── Focus on/off — the store's own flag (the Mixer uses the same) ─────────
  const isCurrentlyFiltered = useStore((s) => s.focusActive)

  // ── Toggle group collapse — adds/removes group key from collapsed set ─────
  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group); else next.add(group)
      return next
    })
  }

  // ── isGroupMuted — true when every track in the group is muted ───────────
  const isGroupMuted = (groupKey: string) =>
    tracks.filter(t => t.group === groupKey).every(t => t.muted)

  return (
    <aside className="pr-tracks" data-open={trackPanelOpen} aria-label={t`Tracks`}>
      {trackPanelOpen && (
        <div className="pr-tracks-inner touch-hit">
          <div className="pr-tracks-head">
            <h2>{t`Tracks`}</h2>
            <span className="o-note"><NoteCounter /></span>
            <button className="o-close" aria-label={t`Close tracks`} onClick={() => setTrackPanelOpen(false)}><X size={16} strokeWidth={2} /></button>
          </div>

          {/* ── Mute-filter quick toggle — visible only when Selective Tracks Playback is on in Settings ── */}
          {midi && autoMuteNonKeyboard && (
            <Tooltip
              title={isCurrentlyFiltered ? t`Focus on the keys` : t`Playing all tracks`}
              description={isCurrentlyFiltered ? t`Hearing keys, bass & drums, seeing only the keys.\nClick to bring back all tracks as they were.` : t`Click to hear only keys, bass & drums\nand see only the keys — good for practising`}
              wrapperStyle={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}
            >
              <button className="pr-focus" data-instant aria-pressed={isCurrentlyFiltered} onClick={() => setTrackMuteFilter(!isCurrentlyFiltered)}>
                <Focus size={22} strokeWidth={1.8} />
                <span className="pr-focus-text">
                  <span>{t`Focus on the keys`}</span>
                  <span>{isCurrentlyFiltered ? t`Hearing keys, bass & drums · seeing only the keys` : t`Playing all tracks`}</span>
                </span>
                <span style={{ fontSize: 'var(--text-base)' }}>{isCurrentlyFiltered ? t`On` : t`Off`}</span>
              </button>
            </Tooltip>
          )}

          {/* Track list */}
          <div className="pr-track-list">
            {!midi && <div className="o-note">{t`Open a MIDI file to see tracks`}</div>}

            {grouped.map(({ key, label, tracks: groupTracks }) => {
              const collapsed = collapsedGroups.has(key)
              const groupMuted = isGroupMuted(key)
              const isPiano = key === 'piano'
              const handleId = `group:${key}`

              return (
                <div
                  key={key}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: draggedGroup === key ? 0.4 : 1 }}
                  onDragOver={!isPiano ? (e) => e.preventDefault() : undefined}
                  onDrop={!isPiano ? () => { if (draggedGroup) reorderGroups(draggedGroup, key); setDraggedGroup(null) } : undefined}
                >
                  {/* Group header row */}
                  <div className="pr-track-group">
                    <button
                      className="pr-track-group-name"
                      aria-expanded={!collapsed}
                      onClick={() => toggleGroupCollapse(key)}
                      draggable={!isPiano}
                      onDragStart={!isPiano ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setDraggedGroup(key) } : undefined}
                      onDragEnd={() => setDraggedGroup(null)}
                      onMouseEnter={() => setHoveredHandle(handleId)}
                      onMouseLeave={() => setHoveredHandle(h => h === handleId ? null : h)}
                      style={{ cursor: isPiano ? 'pointer' : (hoveredHandle === handleId ? 'grab' : 'pointer') }}
                    >
                      {!isPiano && hoveredHandle === handleId
                        ? <GripVertical size={14} />
                        : <ChevronDown size={14} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }} />}
                      {label} · {groupTracks.length}
                    </button>

                    {/* ── Collapsed: colored square per track — visual legend only ── */}
                    {collapsed && (
                      <div className="pr-track-swatches">
                        {groupTracks.map(t => (
                          <Tooltip key={t.index} title={t.trackName ?? t.gmName} description="Track's color in the piano roll">
                            <span style={{ display: 'block', background: t.color }} />
                          </Tooltip>
                        ))}
                      </div>
                    )}

                    <Tooltip
                      title={groupMuted ? `Unmute all ${label}` : `Mute all ${label}`}
                      description={groupMuted ? t`Unmute and show every track in ${label}` : t`Mute and hide every track in ${label} at once`}
                    >
                      <button aria-label={groupMuted ? `Unmute all ${label}` : `Mute all ${label}`} onClick={() => muteGroup(key, !groupMuted)}
                        style={{ width: 44, height: 36, justifyContent: 'center', color: groupMuted ? 'var(--paint-pink)' : 'inherit' }}>
                        {groupMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                    </Tooltip>
                  </div>

                  {/* Track rows */}
                  {!collapsed && groupTracks.map((track) => {
                    const effectivelyMuted = track.muted || (hasSolo && !track.solo)
                    return (
                      <TrackRow
                        key={track.index}
                        track={track}
                        dimmed={effectivelyMuted}
                        onMute={() => useStore.getState().setTrackMuted(track.index, !track.muted)}
                        onSolo={() => updateTrack(track.index, { solo: !track.solo })}
                        onVisible={() => updateTrack(track.index, { visible: !track.visible })}
                        onKeyboard={() => updateTrack(track.index, { showOnKeyboard: !track.showOnKeyboard })}
                        onSoloForEdit={noteEditorActive ? () => soloTrackForEdit(track.index) : undefined}
                        isSoloedForEdit={noteEditorSoloTrackIndex === track.index}
                        isDragging={draggedTrack?.group === key && draggedTrack.index === track.index}
                        isHandleHovered={hoveredHandle === `track:${key}:${track.index}`}
                        onHandleHover={(hovered) => setHoveredHandle(hovered ? `track:${key}:${track.index}` : null)}
                        onDragStart={() => setDraggedTrack({ group: key, index: track.index })}
                        onDragEnd={() => setDraggedTrack(null)}
                        onDragOverRow={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          // Live reflow — reorder as the dragged row passes over others,
                          // matching how modern apps visibly move rows before drop.
                          if (draggedTrack && draggedTrack.group === key && draggedTrack.index !== track.index) {
                            reorderTracks(key, draggedTrack.index, track.index)
                            setDraggedTrack({ group: key, index: draggedTrack.index })
                          }
                        }}
                        onDropRow={() => setDraggedTrack(null)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div className="pr-track-cols" aria-hidden="true"><span>{t`Sound`}</span><span>{t`Solo`}</span><span>{t`Roll`}</span><span>{t`Keys`}</span></div>

          <div className="pr-tracks-actions">
            <Tooltip
              title={!midi ? 'Open a MIDI file first' : midiEditorOpen ? 'MIDI Playback Editor is open' : 'MIDI Playback Editor'}
              description={!midi ? 'Load a MIDI file to edit its playback.' : midiEditorOpen ? "Already open — check for it among your other windows." : 'Edit what you want to hear and see: rename tracks, reassign instruments, merge/split ...'}
              wrapperStyle={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
            >
              <button className="pr-paper-btn" aria-pressed={midiEditorOpen} disabled={!midi} onClick={midi && !midiEditorOpen ? handleOpenEditor : undefined}><PencilSparklesIcon size={18} />{t`Playback Editor`}</button>
            </Tooltip>
            {noteEditorEnabled && midi && (
              <Tooltip
                title={noteEditorActive ? 'Exit note edit mode' : 'MIDI note editor'}
                description={noteEditorActive ? 'Returns to normal playback view.' : 'Add, delete and move individual notes directly on the piano roll. Assign notes to Left/Right hand.'}
                wrapperStyle={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
              >
                <button className="pr-paper-btn" aria-pressed={noteEditorActive} onClick={handleToggleNoteEditor}><Pencil size={18} strokeWidth={1.8} />{t`Note Editor`}</button>
              </Tooltip>
            )}
          </div>
          {midi && (
            <div className="pr-tracks-actions">
              <button className="o-btn" onClick={() => setAllVisible(true)}>{t`Show all tracks`}</button>
              <button className="o-btn" onClick={() => setAllVisible(false)}>{t`Hide all tracks`}</button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

// ── Track row: drag handle, colour meter, name and details, four toggles
function TrackRow({
  track, dimmed, onMute, onSolo, onVisible, onKeyboard, onSoloForEdit, isSoloedForEdit,
  isDragging, isHandleHovered, onHandleHover, onDragStart, onDragEnd, onDragOverRow, onDropRow,
}: {
  track: TrackState; dimmed: boolean
  onMute: () => void; onSolo: () => void; onVisible: () => void; onKeyboard: () => void
  onSoloForEdit?: () => void; isSoloedForEdit?: boolean
  isDragging?: boolean; isHandleHovered?: boolean; onHandleHover?: (hovered: boolean) => void
  onDragStart?: () => void; onDragEnd?: () => void
  onDragOverRow?: (e: React.DragEvent) => void; onDropRow?: () => void
}) {
  // Friendly channel/program label
  const ch = (track as any).channel != null ? (track as any).channel + 1 : track.index + 1
  const prog = track.isDrum ? 'drums' : `prog ${track.program + 1}`
  const noteCount = useStore(s => (s.midi as any)?.tracks?.find((t: any) => t.index === track.index)?.notes?.length ?? 0)

  // ── Color-line VU meter — Settings-gated (Playback & Practice). Same
  // velocity-scan + decay mechanism as the Console Mixer's ChannelStrip VU
  // meter, but drives a CSS transform (not canvas/height) so N simultaneous
  // track rows never trigger layout reflow, just compositor work. The
  // bottom PILL_FLOOR fraction stays solid at full track color always —
  // the guaranteed color identifier the Mixer's own meter doesn't need,
  // since here it's the only thing telling tracks apart without opening it. ──
  const trackVuColorEnabled = useStore(s => s.trackVuColorEnabled)
  const vuFillRef = useRef<HTMLDivElement>(null)
  const vuLevel   = useRef(0)
  // ── One piano track played by both hands, with Hand Assignment on: a blue and
  // a pink meter side by side, each following its own hand, so the mode shows at
  // a glance. A track already split to one hand keeps its single meter. ─────────
  const showHandLabels = useStore(s => s.showHandLabels)
  const trackNotes = useStore(s => (s.midi as any)?.tracks?.find((t: any) => t.index === track.index)?.notes)
  const twoHands = useMemo(() => showHandLabels && !!trackNotes?.some((n: any) => n.hand === 'L') && !!trackNotes?.some((n: any) => n.hand === 'R'),
    [showHandLabels, trackNotes])
  const vuFillLhRef = useRef<HTMLDivElement>(null)
  const vuLevelLh   = useRef(0)
  useEffect(() => {
    if (!trackVuColorEnabled) return
    const unsub = useStore.subscribe(state => {
      const { currentTime, playbackState, midi: md, tracks: tks } = state
      if (playbackState !== 'playing' || !md) return
      const tr = tks.find(t => t.index === track.index)
      if (!tr || tr.muted) return
      const pt = (md as any).tracks?.find((t: any) => t.index === track.index)
      if (!pt) return
      let maxVel = 0, maxVelLh = 0
      for (const note of pt.notes) {
        // Notes are sorted by time — skip once past current window
        if (note.time > currentTime + 0.02) break
        if (currentTime >= note.time + note.duration) continue
        if (twoHands && note.hand === 'L') { if (note.velocity > maxVelLh) maxVelLh = note.velocity }
        else if (note.velocity > maxVel) maxVel = note.velocity
      }
      if (maxVel > 0) vuLevel.current = maxVel * tr.volume
      if (maxVelLh > 0) vuLevelLh.current = maxVelLh * tr.volume
    })
    let raf = 0
    const loop = () => {
      vuLevel.current = Math.max(0, vuLevel.current - 0.013)
      vuLevelLh.current = Math.max(0, vuLevelLh.current - 0.013)
      if (vuFillRef.current) vuFillRef.current.style.transform = `scaleY(${Math.min(1, vuLevel.current)})`
      if (vuFillLhRef.current) vuFillLhRef.current.style.transform = `scaleY(${Math.min(1, vuLevelLh.current)})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { unsub(); cancelAnimationFrame(raf) }
  }, [trackVuColorEnabled, track.index, twoHands])

  // The colour pill beside the name: a VU meter, or a plain bar with the meters off
  const pill = (color: string, fillRef: React.RefObject<HTMLDivElement | null>, style?: React.CSSProperties) => trackVuColorEnabled ? (
    <div style={{
      width: 12, height: 44, borderRadius: 3, flexShrink: 0,
      opacity: dimmed ? 0.6 : 1, position: 'relative', overflow: 'hidden', ...style,
    }}>
      {/* Dim tint — fills the whole pill so it always reads as this track's color ── */}
      <div style={{ position: 'absolute', inset: 0, background: color, opacity: 0.18 }} />
      {/* Floor — bottom 25%, full color, always on regardless of playback state ── */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '25%', background: color }} />
      {/* VU fill — grows upward from the floor with playback level (transform, not height) ── */}
      <div ref={fillRef} style={{
        position: 'absolute', left: 0, right: 0, bottom: '25%', height: '75%',
        background: color, transform: 'scaleY(0)', transformOrigin: 'bottom',
      }} />
    </div>
  ) : (
    <div style={{ width: 12, height: 44, background: color, borderRadius: 3, flexShrink: 0, opacity: dimmed ? 0.6 : 1, ...style }} />
  )

  return (
    <div
      className="pr-track-row"
      data-instant
      data-edit={!!isSoloedForEdit}
      data-pick={!!onSoloForEdit}
      onClick={onSoloForEdit}
      onDragOver={onDragOverRow}
      onDrop={onDropRow}
      style={{ opacity: isDragging ? 0.4 : dimmed ? 0.55 : 1 }}
    >
      <div
        className="pr-track-grip"
        draggable
        onDragStart={e => {
          e.stopPropagation()
          // Reorder is driven entirely by React state (draggedTrack), not
          // dataTransfer — but leaving dataTransfer completely untouched
          // made the OS/Chromium drag cursor default to the "not allowed"
          // no-drop badge for the whole drag, even over valid drop
          // targets with dropEffect='move' set. Declaring a real payload
          // + effectAllowed here is what actually lets the browser show
          // a plain "move" cursor instead.
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', '')
          onDragStart?.()
        }}
        onDragEnd={() => onDragEnd?.()}
        onMouseEnter={() => onHandleHover?.(true)}
        onMouseLeave={() => onHandleHover?.(false)}
        onClick={e => e.stopPropagation()}
        style={{ color: isHandleHovered ? 'var(--stone)' : undefined }}
      >
        <GripVertical size={12} />
      </div>
      {/* Left hand left of right hand */}
      {twoHands && pill('var(--hand-lh)', vuFillLhRef, { width: 6 })}
      {pill(twoHands ? 'var(--hand-rh)' : track.color, vuFillRef, twoHands ? { width: 6 } : undefined)}
      <div className="pr-track-info">
        <MarqueeText name={track.trackName ?? track.gmName} spanStyle={{ fontSize: 17, letterSpacing: '-0.03em', color: '#ffffff' }} />
        {track.trackName && track.trackName !== track.gmName && <span className="pr-track-meta">{track.gmName}</span>}
        <span className="pr-track-meta">#{track.index + 1} · ch {ch} · {prog} · {noteCount} notes</span>
      </div>
      <div className="pr-track-btns">
        <IBtn onClick={onMute} on={track.muted ? 'mute' : undefined} label={track.muted ? t`Unmute audio` : t`Mute audio`}>
          {track.muted ? <VolumeX size={18} strokeWidth={1.8} /> : <Volume2 size={18} strokeWidth={1.8} />}
        </IBtn>
        <IBtn onClick={onSolo} on={track.solo ? 'solo' : undefined} label={track.solo ? 'Unsolo track' : 'Solo track'}>
          <Music2 size={18} strokeWidth={1.8} />
        </IBtn>
        <IBtn onClick={onVisible} on={track.visible ? 'paper' : undefined} label={track.visible ? 'Hide notes on the Piano Roll' : 'Show notes on the Piano Roll'}>
          {track.visible ? <Eye size={18} strokeWidth={1.8} /> : <EyeClosed size={18} strokeWidth={1.8} />}
        </IBtn>
        <IBtn onClick={onKeyboard} on={track.showOnKeyboard ? 'paper' : undefined} label={track.showOnKeyboard ? 'Notes light up on keyboard' : 'Notes are not lit on keyboard'}>
          <PianoKeysIcon width={18} height={13} />
        </IBtn>
      </div>
    </div>
  )
}

// ── IBtn — one 44px toggle in a track row; `on` names its filled colour ──────
function IBtn({ children, onClick, on, label }: { children: React.ReactNode; onClick: () => void; on?: 'mute' | 'solo' | 'paper'; label: string }) {
  return (
    <Tooltip title={label} oneLine muted>
      <button className="pr-track-btn" aria-label={label} aria-pressed={!!on} data-on={on} onClick={e => { e.stopPropagation(); onClick() }}>
        {children}
      </button>
    </Tooltip>
  )
}
