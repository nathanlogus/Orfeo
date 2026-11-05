import { useRef, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import { bringToFront, MODAL_BASE_Z } from '../../utils/modalFocus'
import ChannelStrip, { CHANNEL_STRIP_W } from './ChannelStrip'
import MasterStrip, { MASTER_STRIP_W } from './MasterStrip'
import { getPianoRollCenterX, modalTopAboveKeyboard } from '../../utils/modalAnchors'
import { confirmDialog } from '../../utils/confirmController'
import { parseMidiBuffer } from '../../utils/midiParser'
import { songKey } from '../../utils/songIdentity'
import { carryCorrection } from '../../utils/tempoCorrection'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { KEYBOARD_GROUPS } from '../../utils/keyboardGroups'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useClampPositionOnZoom } from '../../hooks/useClampPositionOnZoom'
import { startModalDrag, MODAL_MAX_HEIGHT } from '../../utils/modalDrag'

// ── MixerConsole — floating draggable modal ───────────────────────────────────
// Opened via Ctrl+Shift+M or the Console (SlidersVertical) icon in the TrackPanel.
// Width locked to show exactly 8 channel strips + master.

// ── Modal dimensions — derived from strip geometry ────────────────────────────
// n strips × 120px + (n−1) inter-strip gaps × 8px + body-gap 8px + master 160px + padding 2×16px
const STRIP_W   = CHANNEL_STRIP_W
const STRIP_GAP = 8
const MASTER_W  = MASTER_STRIP_W
const BODY_PAD  = 16
const MAX_STRIPS = 8

// ── Track sort order — matches TrackPanel GROUP_ORDER ────────────────────────
const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

const MODAL_H_APPROX = 678  // header 72 + body-pad 16*2 + strip 574

// ── MixerConsole ──────────────────────────────────────────────────────────────
export default function MixerConsole() {
  const mixerOpen       = useStore(s => s.mixerOpen)
  const setMixerOpen    = useStore(s => s.setMixerOpen)
  // ── Lightweight track identity/order signature — NOT the live `tracks`
  // array. Grouping/ordering below only needs `index` + `group`, but every
  // fader/knob drag replaces the whole `tracks` array (new reference) many
  // times a second; subscribing to it directly forced this whole console —
  // all 8 channel strips + master — to re-render on every tick of ANY drag,
  // which is what made playback stutter while dragging. A joined string is
  // value-equal (`===`) across renders whenever index/group haven't
  // actually changed, so zustand's default Object.is check bails out for
  // volume/pan/chorus/reverb-only updates. ──────────────────────────────────
  // `muted` is included too — unlike volume/pan/etc it only ever flips on a
  // discrete click (Mute All, per-strip Mute, Focus mode), never streamed
  // continuously like a drag, so it's safe to fold into this signature
  // without reintroducing the per-tick re-render problem described above.
  const trackSignature = useStore(s => s.tracks.map(t => `${t.index}:${t.group ?? ''}:${t.muted}:${t.isDrum}`).join('|'))
  const trackMeta = useMemo(
    () => useStore.getState().tracks.map(t => ({ index: t.index, group: t.group, muted: t.muted, isDrum: t.isDrum })),
    [trackSignature],
  )

  // ── Mount guard — don't render until first open ───────────────────────────
  // everOpened keeps the component mounted after first open so all internal state
  // (pos, knob values, scroll) survives hide/show cycles.
  const [everOpened, setEverOpened] = useState(false)
  const positioned = useRef(false)

  // ── Mark ever-opened on first open; also finalize position then, using the
  // real track count — the mount-time initializer below runs before any file
  // is loaded (0 tracks), so its width guess was never right once a real
  // file's tracks were in. ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mixerOpen) return
    setEverOpened(true)
    if (positioned.current) return
    positioned.current = true
    const n = Math.min(Math.max(useStore.getState().tracks.length, 1), MAX_STRIPS)
    const w = BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W + 2
    setPos({
      x: Math.max(0, Math.round(getPianoRollCenterX() - w / 2)),
      y: modalTopAboveKeyboard(MODAL_H_APPROX, 11),
    })
  }, [mixerOpen])

  // ── Close — diffs live channel values against the file-load baseline; if any
  // channel's volume/pan/reverb/chorus changed, offers to save before closing.
  // Save writes a new _ORFEO_vN file (same versioning as editor:save) and
  // switches the app to it; Discard drops the changes; Cancel keeps the mixer
  // open. Nothing to diff (Master strip, mute/solo/etc.) — those stay session-only. ──
  const requestClose = useCallback(async () => {
    const { tracks: liveTracks, mixerBaseline, midi } = useStore.getState()
    const changed = liveTracks.filter(t => {
      const base = mixerBaseline[t.index]
      return base && (base.volume !== t.volume || base.pan !== t.pan || base.chorus !== t.chorus || base.reverb !== t.reverb)
    })
    if (changed.length === 0 || !midi) { setMixerOpen(false); return }

    const filePath = (midi as any)._filePath ?? ''
    const choice = await confirmDialog({
      title: 'Save mixer changes?',
      message: `Volume, pan, reverb, and chorus were changed for ${changed.length} channel(s).`,
      buttons: ['Save & Reload', 'Discard', 'Cancel'],
    })
    if (choice === 2) return // Cancel — leave mixer open
    if (choice === 1) { setMixerOpen(false); return } // Discard — re-seeded from file next open

    try {
      const result = await window.electronAPI.saveMixerChannels({
        filePath,
        channels: changed.map(t => ({ index: t.index, volume: t.volume, pan: t.pan, chorus: t.chorus, reverb: t.reverb })),
      })
      if (!result.ok || !result.base64 || !result.fileName || !result.filePath) {
        await confirmDialog({ title: 'Save failed', message: result.message ?? 'Could not save mixer changes.', buttons: ['OK'] })
        return // leave mixer open so the user can retry
      }
      const binary = atob(result.base64)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath)
      // keep the song's tap-tempo correction on the saved version (timing unchanged)
      const moved = carryCorrection(useStore.getState().tempoCorrections, useStore.getState().songKey, songKey(bytes.buffer), 1)
      if (moved) useStore.setState({ tempoCorrections: moved })
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      useStore.getState().setDetectedKey(
        raw._keySignature ? parseKeySignature(raw._keySignature.key, raw._keySignature.scale) : detectKeyFromTracks(parsed.tracks),
      )
      useStore.getState().notifyLibrarySaved(result.filePath)
      setMixerOpen(false)
    } catch (e: any) {
      await confirmDialog({ title: 'Save failed', message: e?.message ?? 'Could not save mixer changes.', buttons: ['OK'] })
    }
  }, [setMixerOpen])

  // ── Drag-to-reorder — session-only display order, never written to the file.
  // Piano/keys always stays pinned first — group drag is simply disabled for
  // it, same pattern as TrackPanel.tsx's group drag-reorder. ──────────────────
  const [customChannelOrder, setCustomChannelOrder] = useState<number[] | null>(null)
  const [draggedChannel, setDraggedChannel] = useState<number | null>(null)

  // ── Locked (piano/keys) — always first, in GROUP_ORDER/index order, never
  // draggable. Reorderable — everything else, defaulting to GROUP_ORDER/index,
  // overridden by customChannelOrder once the user drags a strip. ─────────────
  const lockedTracks = useMemo(() =>
    trackMeta.filter(t => KEYBOARD_GROUPS.has(t.group ?? '')).sort((a, b) => a.index - b.index),
  [trackMeta])

  const reorderableBase = useMemo(() =>
    trackMeta.filter(t => !KEYBOARD_GROUPS.has(t.group ?? '')).sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.group ?? '')
      const bi = GROUP_ORDER.indexOf(b.group ?? '')
      const ao = ai === -1 ? GROUP_ORDER.length : ai
      const bo = bi === -1 ? GROUP_ORDER.length : bi
      return ao !== bo ? ao - bo : a.index - b.index
    }),
  [trackMeta])

  const reorderableTracks = useMemo(() => {
    if (!customChannelOrder) return reorderableBase
    return [
      ...customChannelOrder.map(idx => reorderableBase.find(t => t.index === idx)).filter((t): t is typeof reorderableBase[number] => !!t),
      ...reorderableBase.filter(t => !customChannelOrder.includes(t.index)),
    ]
  }, [reorderableBase, customChannelOrder])

  const sortedTracks = useMemo(() => [...lockedTracks, ...reorderableTracks], [lockedTracks, reorderableTracks])

  // ── Focus mode display reorder — mirrors MasterStrip's isCurrentlyFiltered
  // check. While the Focus-mode filter is on, group strips by current mute
  // state (stable partition — relative order within each group untouched)
  // so the audible piano/bass/drums tracks stack together on the left and
  // everything muted collects on the right, instead of staying interleaved
  // in their normal group order. Purely a display-time reorder — leaves
  // customChannelOrder/sortedTracks (the "real" order) alone, so turning
  // Focus mode back off snaps straight back to whatever order was there
  // before. ────────────────────────────────────────────────────────────────
  const isFocusFiltered = useStore(s => s.focusActive)

  const displayTracks = useMemo(() => {
    if (!isFocusFiltered) return sortedTracks
    return [...sortedTracks.filter(t => !t.muted), ...sortedTracks.filter(t => t.muted)]
  }, [sortedTracks, isFocusFiltered])

  // ── Channel drag-to-reorder — piano/keys is never draggable and never a
  // valid drop target's displacement (excluded from the reorderable list
  // entirely, so nothing can end up ahead of it). ─────────────────────────────
  const reorderChannels = (draggedIndex: number, targetIndex: number) => {
    if (draggedIndex === targetIndex) return
    const draggedTrack = trackMeta.find(t => t.index === draggedIndex)
    const targetTrack = trackMeta.find(t => t.index === targetIndex)
    if (!draggedTrack || !targetTrack) return
    if (KEYBOARD_GROUPS.has(draggedTrack.group ?? '') || KEYBOARD_GROUPS.has(targetTrack.group ?? '')) return
    const base = customChannelOrder ?? reorderableBase.map(t => t.index)
    // ── Direction-aware insert — see TrackPanel.tsx's reorderTracks for the
    // full explanation: inserting at a flat `without.indexOf(target)` only
    // lands right when dragging upward; downward drops land one slot short
    // (just above the target instead of below it) without the +1. ──────────
    const movingDown = base.indexOf(targetIndex) > base.indexOf(draggedIndex)
    const without = base.filter(i => i !== draggedIndex)
    const targetIdx = without.indexOf(targetIndex) + (movingDown ? 1 : 0)
    without.splice(targetIdx, 0, draggedIndex)
    setCustomChannelOrder(without)
  }

  // ── Modal width — adapts to track count, capped at MAX_STRIPS ────────────
  const modalW = useMemo(() => {
    const n = Math.min(Math.max(sortedTracks.length, 1), MAX_STRIPS)
    // +2 accounts for 1px left + 1px right border (border-box sizing)
    return BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W + 2
  }, [sortedTracks.length])

  // ── Drag position — bottom edge on the keyboard header, horizontally
  // centered on the piano roll; set once on first render. ───────────────────
  const [pos, setPos] = useState(() => {
    const n = Math.min(Math.max(useStore.getState().tracks.length, 1), MAX_STRIPS)
    const w = BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W + 2
    return {
      x: Math.max(0, Math.round(getPianoRollCenterX() - w / 2)),
      y: modalTopAboveKeyboard(MODAL_H_APPROX, 11),
    }
  })

  // ── Z-index — bringToFront on mousedown so last-clicked modal is on top ────
  const [zIndex, setZIndex] = useState(MODAL_BASE_Z)

  // ── Modal semantics — focus trap while open, restores focus on close ──────
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, mixerOpen && everOpened)
  useClampPositionOnZoom(pos, setPos, modalRef)

  // ── Drag-to-pan state for the channel strip row ───────────────────────────
  const scrollRef    = useRef<HTMLDivElement>(null)
  const dragStartX   = useRef(0)
  const dragStartSL  = useRef(0)
  const [panning, setPanning] = useState(false)

  // ── Document-level move/up for strip-row pan drag ─────────────────────────
  useEffect(() => {
    if (!panning) return
    const onMove = (e: MouseEvent) => {
      if (!scrollRef.current) return
      scrollRef.current.scrollLeft = dragStartSL.current + (dragStartX.current - e.clientX)
    }
    const onUp = () => setPanning(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panning])

  // ── Start strip-row pan drag ──────────────────────────────────────────────
  const handleScrollMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    dragStartX.current  = e.clientX
    dragStartSL.current = scrollRef.current.scrollLeft
    setPanning(true)
  }, [])

  // ── Horizontal scroll via vertical wheel on strip row ────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return
    e.preventDefault()
    scrollRef.current.scrollLeft += e.deltaY
  }, [])

  // ── Header drag — moves the whole modal ──────────────────────────────────
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => startModalDrag(e, modalRef.current, pos, setPos)

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mixerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mixerOpen, requestClose])

  // ── Do not mount until first open ────────────────────────────────────────
  if (!everOpened) return null

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label="Console Mixer"
      className="orfeo-modal-glow app-no-drag touch-hit pr-mixer"
      data-instant
      onMouseDown={() => setZIndex(bringToFront())}
      style={{
        left: pos.x, top: pos.y,
        width: modalW,
        // ── Viewport width cap — the strip row below is flex:1/minWidth:0/
        // overflowX:auto, so once the window is capped that row scrolls on its
        // own. calc() tracks live window resizes with no JS listener needed. ──
        maxWidth: 'calc(100vw - 24px)',
        // A phone is shorter than the strips: they scroll, the header stays
        maxHeight: MODAL_MAX_HEIGHT,
        display: mixerOpen ? 'flex' : 'none',
        zIndex,
      } as CSSProperties}
    >

      {/* ── Header — drag handle ─────────────────────────────────────────── */}
      <div className="pr-mixer-head" onPointerDown={startDrag}>
        <h2>Mixer</h2>
        {modalW > 760 && <span className="o-note">Adjust track levels, apply effects and compress overall loudness</span>}
        <div style={{ flex: 1 }} />
        <button className="o-btn-primary" onClick={requestClose}>Done</button>
        <button className="o-close" aria-label="Close mixer" onClick={requestClose}><X size={18} /></button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: STRIP_GAP,
        padding: `0 ${BODY_PAD}px ${BODY_PAD}px`,
        alignItems: 'flex-start',
        minHeight: 0, overflowY: 'auto',
      }}>

        {/* ── Scrollable channel strip row ────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="mixer-scroll"
          onMouseDown={handleScrollMouseDown}
          onWheel={handleWheel}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', gap: STRIP_GAP,
            overflowX: 'auto',
            paddingBottom: 8,
            cursor: panning ? 'grabbing' : 'grab',
          }}
        >
          {displayTracks.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 574, flex: 1,
              color: 'var(--stone)', fontSize: 'var(--text-md)',
            }}>
              No tracks — load a MIDI file
            </div>
          ) : (
            displayTracks.map(t => {
              const locked = KEYBOARD_GROUPS.has(t.group ?? '')
              return (
                <ChannelStrip
                  key={t.index}
                  trackIndex={t.index}
                  locked={locked}
                  isDragging={draggedChannel === t.index}
                  onDragStart={() => setDraggedChannel(t.index)}
                  onDragEnd={() => setDraggedChannel(null)}
                  onDrop={() => { if (draggedChannel !== null) reorderChannels(draggedChannel, t.index); setDraggedChannel(null) }}
                />
              )
            })
          )}
        </div>

        {/* ── Master strip — always visible, never scrolls ────────────────── */}
        <div style={{ flexShrink: 0 }}>
          <MasterStrip />
        </div>

      </div>
    </div>
  )
}
