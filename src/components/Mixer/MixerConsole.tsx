import { useRef, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { useStore } from '../../store'
import { bringToFront, MODAL_BASE_Z } from '../../utils/modalFocus'
import ChannelStrip from './ChannelStrip'
import MasterStrip from './MasterStrip'
import StagePanel from './StagePanel'
import { confirmDialog } from '../../utils/confirmController'
import { parseMidiBuffer } from '../../utils/midiParser'
import { songKey } from '../../utils/songIdentity'
import { carryCorrection } from '../../utils/tempoCorrection'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { KEYBOARD_GROUPS } from '../../utils/keyboardGroups'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { changedChannels } from '../../utils/mixerChanges'
import { setChannelChorus, setChannelPan, setChannelReverb, setChannelVolume } from '../../audio/engine'
import { t } from '../../utils/i18n'

// ── MixerConsole — the whole screen: every channel, then the master ───────────
// Opened via Ctrl+Shift+M or the Mixer tile on the practice rail.

// Every channel back to the file's values, in the store and the sound alike
function resetMix() {
  const { tracks, mixerBaseline, midi, updateTrack } = useStore.getState()
  for (const track of changedChannels(tracks, mixerBaseline)) {
    const base = mixerBaseline[track.index]
    const channel = midi?.tracks.find(m => m.index === track.index)?.channel ?? 0
    updateTrack(track.index, base)
    setChannelVolume(channel, base.volume)
    setChannelPan(channel, base.pan)
    setChannelChorus(channel, base.chorus)
    setChannelReverb(channel, base.reverb)
  }
}

// ── Track sort order — matches TrackPanel GROUP_ORDER ────────────────────────
const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

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
  useEffect(() => { if (mixerOpen) setEverOpened(true) }, [mixerOpen])
  const songName = useStore(s => s.midi?.fileName?.replace(/\.[^.]+$/, '') ?? '')
  const mixChanged = useStore(s => mixerOpen && changedChannels(s.tracks, s.mixerBaseline).length > 0)

  // ── Close — diffs live channel values against the file-load baseline; if any
  // channel's volume/pan/reverb/chorus changed, offers to save before closing.
  // Save writes a new _PLIAGE_vN file (same versioning as editor:save) and
  // switches the app to it; Discard drops the changes; Cancel keeps the mixer
  // open. Nothing to diff (Master strip, mute/solo/etc.) — those stay session-only. ──
  const requestClose = useCallback(async () => {
    const { tracks: liveTracks, mixerBaseline, midi } = useStore.getState()
    const changed = changedChannels(liveTracks, mixerBaseline)
    if (changed.length === 0 || !midi) { setMixerOpen(false); return }

    const filePath = (midi as any)._filePath ?? ''
    const choice = await confirmDialog({
      title: 'Save mixer changes?',
      message: `Volume, pan, reverb, and chorus were changed for ${changed.length} channel(s).`,
      buttons: ['Save & Reload', 'Discard', 'Cancel'],
    })
    if (choice === 2) return // Cancel — leave mixer open
    if (choice === 1) { resetMix(); setMixerOpen(false); return }

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

  // ── Z-index — bringToFront on mousedown so last-clicked modal is on top ────
  const [zIndex, setZIndex] = useState(MODAL_BASE_Z)

  // ── Modal semantics — focus trap while open, restores focus on close ──────
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, mixerOpen && everOpened)

  // ── Drag-to-pan state for the channel strip row ───────────────────────────
  const scrollRef    = useRef<HTMLDivElement>(null)
  const panGesture = useRef<{ id: number; x: number; y: number; left: number; dragging: boolean } | null>(null)
  const suppressClickUntil = useRef(0)
  const [panning, setPanning] = useState(false)

  // ── Document-level move/up for strip-row pan drag ─────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const gesture = panGesture.current, row = scrollRef.current
      if (!gesture || e.pointerId !== gesture.id || !row) return
      const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y
      if (!gesture.dragging) {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return
        if (Math.abs(dy) >= Math.abs(dx)) { panGesture.current = null; return }
        gesture.dragging = true
        setPanning(true)
      }
      row.scrollLeft = gesture.left - dx
      e.preventDefault()
    }
    const onUp = (e: PointerEvent) => {
      const gesture = panGesture.current
      if (!gesture || e.pointerId !== gesture.id) return
      if (gesture.dragging) { suppressClickUntil.current = Date.now() + 60; setPanning(false) }
      panGesture.current = null
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // ── Start strip-row pan drag ──────────────────────────────────────────────
  const handleScrollPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.button !== 0 || !scrollRef.current) return
    if (e.target instanceof Element && e.target.closest('button, input, select, textarea, a, [role="slider"], [draggable="true"], [data-no-pan]')) return
    panGesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, dragging: false }
  }, [])

  // ── Horizontal scroll via vertical wheel on strip row ────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const row = scrollRef.current
    if (!row) return
    const raw = e.shiftKey ? (e.deltaY || e.deltaX) : (e.deltaX || e.deltaY)
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? row.clientWidth : 1
    const next = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, row.scrollLeft + raw * unit))
    if (next === row.scrollLeft) return
    e.preventDefault()
    row.scrollLeft = next
  }, [])

  const handleStripKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== scrollRef.current || !scrollRef.current) return
    const row = scrollRef.current
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      row.scrollBy({ left: (e.key === 'ArrowLeft' ? -1 : 1) * Math.max(160, row.clientWidth * .65), behavior: 'smooth' })
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      row.scrollTo({ left: e.key === 'Home' ? 0 : row.scrollWidth, behavior: 'smooth' })
    }
  }, [])

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
      className="pliage-modal-glow app-no-drag touch-hit pr-mixer"
      data-instant
      onMouseDown={() => setZIndex(bringToFront())}
      style={{ display: mixerOpen ? 'flex' : 'none', zIndex } as CSSProperties}
    >

      {/* ── Header ─ keeps the window movable, and clears its caption buttons ── */}
      <div className="pr-mixer-head app-drag-region">
        <button className="pr-mixer-back app-no-drag" onClick={requestClose}><ArrowLeft size={16} strokeWidth={2} />{t`Practice`}</button>
        <h2>{t`Mixer`}</h2>
        <span className="o-note">{songName} · {t`your mix is saved into the song`}</span>
        <div style={{ flex: 1 }} />
        <button className="o-btn app-no-drag" disabled={!mixChanged} onClick={resetMix}>{t`Reset mix`}</button>
        <button className="o-btn-primary app-no-drag" onClick={requestClose}>{t`Done`}</button>
        <button className="o-close app-no-drag" aria-label="Close mixer" onClick={requestClose}><X size={18} /></button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <StagePanel />
      <div className="pr-mixer-body">

        {/* ── Scrollable channel strip row ────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="mixer-scroll pr-mixer-strips"
          role="region"
          aria-label="Mixer channel strips"
          tabIndex={0}
          onPointerDown={handleScrollPointerDown}
          onClickCapture={e => {
            if (Date.now() < suppressClickUntil.current) { e.preventDefault(); e.stopPropagation(); suppressClickUntil.current = 0 }
          }}
          onKeyDown={handleStripKeyDown}
          onWheel={handleWheel}
          style={{ cursor: panning ? 'grabbing' : 'grab' }}
        >
          {displayTracks.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flex: 1,
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
        <MasterStrip />

      </div>
    </div>
  )
}
