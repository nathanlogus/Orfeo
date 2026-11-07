import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { GripVertical } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { useDevicePixelRatio } from '../../hooks/useDevicePixelRatio'
import MixerKnob from './MixerKnob'
import { androidPianoBridge } from '../../audio/androidPiano'
import Tooltip from '../Tooltip'
import { MarqueeText } from '../MarqueeText'
import {
  setChannelChorus,
  setChannelReverb,
  setChannelPan,
  setChannelVolume,
} from '../../audio/engine'

export const CHANNEL_STRIP_W = 160

// ── VU meter constants ────────────────────────────────────────────────────────
const SEG_H    = 4    // segment height in CSS px
const SEG_GAP  = 2    // gap between segments
const SEG_UNIT = SEG_H + SEG_GAP
const VU_W     = 16   // canvas CSS width in px

// ── Draw VU — segmented bars in track color, no zone gradient ────────────────
// Active segments at full track color; inactive at dim (alpha 0.08).
function drawVU(
  canvas: HTMLCanvasElement,
  level: number,
  color: string,
  segs: number,
  canvasH: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const activeSeg = Math.floor(level * segs)
  const w = VU_W * dpr

  ctx.fillStyle = color
  for (let i = 0; i < segs; i++) {
    const y = (canvasH - (i + 1) * SEG_UNIT) * dpr
    ctx.globalAlpha = i < activeSeg ? 1 : 0.08
    ctx.fillRect(0, y, w, SEG_H * dpr)
  }
  ctx.globalAlpha = 1
}

// ── One of the strip's four toggles; `on` names its filled colour ────────────
function ToggleBtn({ label, on, tip, onClick }: { label: string; on?: 'mute' | 'solo' | 'paper'; tip: string; onClick: () => void }) {
  return (
    <Tooltip title={tip} oneLine muted>
      <button className="pr-mix-btn" aria-label={tip} aria-pressed={!!on} data-on={on} style={{ width: '100%' }} onClick={onClick}>{label}</button>
    </Tooltip>
  )
}

// ── Fader constants ───────────────────────────────────────────────────────────
const HANDLE_H = 24

// ── ChannelStrip props ────────────────────────────────────────────────────────
export interface ChannelStripProps {
  trackIndex: number
  // ── Drag-to-reorder — locked (piano/keys) strips render no grip and never
  // participate; set by MixerConsole.tsx, same pattern as TrackPanel's group
  // drag-reorder. ───────────────────────────────────────────────────────────
  locked?: boolean
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDrop?: () => void
}

// ── ChannelStrip — single 108×480 mixer channel strip ────────────────────────
export default function ChannelStrip({ trackIndex, locked, isDragging, onDragStart, onDragEnd, onDrop }: ChannelStripProps) {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine  = useStore(s => s.audioEngine)
  // ── Select only this channel's own track object, not the whole `tracks`
  // array. `updateTrack` replaces the array on every fader mousemove (dozens
  // of times a second); since unchanged entries keep their original object
  // reference, subscribing to `s.tracks` as a whole made every ChannelStrip
  // re-render on every OTHER channel's drag tick too — 8 strips re-rendering
  // per pixel of one drag, which is what was making playback stutter while
  // dragging. Narrowing the selector to just this track lets zustand bail
  // out (reference-equal) for every strip except the one actually moving. ──
  const track        = useStore(s => s.tracks.find(t => t.index === trackIndex))
  const updateTrack  = useStore(s => s.updateTrack)
  const midi         = useStore(s => s.midi)
  // Console stays mounted (display:none) after first open so internal state
  // survives hide/show — gate the VU rAF loop below on this, not just mount.
  const mixerOpen    = useStore(s => s.mixerOpen)

  const parsedTrack = midi?.tracks.find((t: any) => t.index === trackIndex)

  const knobsDisabled = audioEngine === 'gm'
  const sendsDisabled = knobsDisabled || (audioEngine === 'native' && !!androidPianoBridge())
  const sendHint = audioEngine === 'native' && androidPianoBridge()
    ? 'Android Native uses the master FX panel. Choose Studio for per-track sends.'
    : 'Switch to the Studio or Native engine to use effects.'

  // ── Fallback track color — resolved from var(--track-color-fallback) once on mount ───
  // Canvas 2D fillStyle (VU meter, below) can't consume a var() string directly, so this
  // ref caches the resolved value; index.css stays the single source of truth for it.
  const fallbackColorRef = useRef('#808080')
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--track-color-fallback').trim()
    if (v) fallbackColorRef.current = v
  }, [])

  // ── Derived display data ──────────────────────────────────────────────────
  const trackName   = track?.trackName ?? track?.gmName ?? (parsedTrack as any)?.name ?? ''
  // Fallback color for tracks with no assigned color — also feeds the Canvas VU-meter
  // fillStyle below, and Canvas 2D can't resolve a var() string, so fallbackColorRef
  // resolves var(--track-color-fallback) from index.css once on mount (see below);
  // '#808080' here only covers the sliver of first render before that effect runs.
  const trackColor  = (track as any)?.color   ?? (parsedTrack as any)?.color   ?? fallbackColorRef.current
  // MIDI channel from the file (0-based) — NOT the same as trackIndex
  const midiChannel = (parsedTrack as any)?.channel ?? 0

  const muted        = track?.muted        ?? false
  const solo         = track?.solo         ?? false
  const visible      = track?.visible      ?? true
  const showOnKeyboard = track?.showOnKeyboard ?? false

  // ── Knob/fader state — lives in store (per-track), seeded from CC data on
  // file load — lets MixerConsole diff against mixerBaseline on close to
  // detect unsaved changes and offer to persist them back into the file. ──
  const [dragging, setDragging] = useState(false)
  const chorus = track?.chorus ?? 0
  const reverb = track?.reverb ?? 0
  const pan    = track?.pan    ?? 0
  const volume = track?.volume ?? 1

  // ── Knob handlers — update store and send CC to the Samples engine ───────
  const handleChorus = useCallback((v: number) => { updateTrack(trackIndex, { chorus: v }); setChannelChorus(midiChannel, v) }, [trackIndex, midiChannel, updateTrack])
  const handleReverb = useCallback((v: number) => { updateTrack(trackIndex, { reverb: v }); setChannelReverb(midiChannel, v) }, [trackIndex, midiChannel, updateTrack])
  const handlePan    = useCallback((v: number) => { updateTrack(trackIndex, { pan: v });    setChannelPan(midiChannel, v)    }, [trackIndex, midiChannel, updateTrack])

  // ── VU meter — refs avoid re-renders in the rAF loop ─────────────────────
  const vuRef    = useRef<HTMLCanvasElement>(null)
  const vuLevel  = useRef(0)
  const colorRef = useRef(trackColor)
  const rafRef   = useRef(0)

  // ── Keep colorRef current so rAF closure always sees the latest track color ─
  useEffect(() => { colorRef.current = trackColor }, [trackColor])

  // ── VU+Fader section height — measured via ResizeObserver ─────────────────
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionH, setSectionH] = useState(250)

  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSectionH(e.contentRect.height))
    ro.observe(el)
    setSectionH(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])

  const vuCanvasH = Math.max(30, sectionH)
  const vuSegs    = Math.max(5, Math.floor(vuCanvasH / SEG_UNIT))

  // ── Resize canvas when section height OR device pixel ratio changes ────────
  // Without the dpr dependency, a live Windows-scaling change left the
  // backing store sized for the OLD ratio while drawVU (below) kept reading
  // a fresh devicePixelRatio every frame — new-ratio coordinates drawn onto
  // an old-ratio-sized canvas, clipped/mis-scaled until something else
  // happened to change the panel's layout height. ────────────────────────
  const dpr = useDevicePixelRatio()
  useLayoutEffect(() => {
    const canvas = vuRef.current
    if (!canvas) return
    canvas.width  = VU_W * dpr
    canvas.height = vuCanvasH * dpr
    canvas.style.width  = VU_W + 'px'
    canvas.style.height = vuCanvasH + 'px'
  }, [vuCanvasH, dpr])

  // ── VU subscription — watches currentTime to scan active notes by velocity ─
  // Uses useStore.subscribe (not useStore hook) so velocity updates don't cause
  // re-renders; the rAF loop picks up the ref values each frame instead.
  useEffect(() => {
    const unsub = useStore.subscribe(state => {
      const { currentTime, playbackState, midi: md, tracks: tks } = state
      if (playbackState !== 'playing' || !md) return
      const tr = tks.find(t => t.index === trackIndex)
      if (!tr || tr.muted) return
      const pt = md.tracks.find((t: any) => t.index === trackIndex)
      if (!pt) return

      let maxVel = 0
      for (const note of pt.notes) {
        // Notes are sorted by time — skip once past current window
        if (note.time > currentTime + 0.02) break
        if (currentTime < note.time + note.duration && note.velocity > maxVel)
          maxVel = note.velocity
      }
      // Scale by the channel's fader volume so dragging it visibly moves the
      // meter — previously this showed raw note velocity only, so the meter
      // never reacted to the fader at all.
      if (maxVel > 0) vuLevel.current = maxVel * tr.volume
    })
    return unsub
  }, [trackIndex])

  // ── rAF decay loop — decays level each frame, redraws segmented bars ────────
  // Gated on mixerOpen: this component stays mounted (display:none) after
  // first open, and rAF keeps firing regardless of CSS visibility — without
  // this guard the canvas fill-rect loop runs forever after the Mixer closes.
  useEffect(() => {
    if (!mixerOpen) return
    const loop = () => {
      vuLevel.current = Math.max(0, vuLevel.current - 0.013)
      if (vuRef.current) {
        drawVU(vuRef.current, vuLevel.current, colorRef.current, vuSegs, vuCanvasH)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuSegs, vuCanvasH, mixerOpen])

  // ── Fader drag ────────────────────────────────────────────────────────────
  const handleFaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (muted) return
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    const startY   = e.clientY
    const startVol = volume
    const travel   = sectionH - HANDLE_H

    const onMove = (me: PointerEvent) => {
      const v = Math.max(0, Math.min(1, startVol + -(me.clientY - startY) / travel))
      updateTrack(trackIndex, { volume: v })
      setChannelVolume(midiChannel, v)
    }
    const onUp = () => {
      setDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup',   onUp)
  }, [muted, volume, sectionH, trackIndex, midiChannel, updateTrack])

  // Muted → fader slides gracefully to bottom (0) in 150ms ease-out
  const visualVolume = muted ? 0 : volume
  const handleTop    = (1 - visualVolume) * (sectionH - HANDLE_H)

  // dB readout: standard unity mapping (volume 1 = 0 dB, 0 = −∞)
  const dbText = volume === 0 ? '−∞' : (20 * Math.log10(volume)).toFixed(1)

  const panText = pan === 0 ? t`centre` : `${pan > 0 ? 'R' : 'L'} ${Math.round(Math.abs(pan) * 100)}`

  return (
    <section
      className="pr-strip"
      aria-label={trackName}
      data-muted={muted}
      onDragOver={!locked ? (e) => e.preventDefault() : undefined}
      onDrop={!locked ? (e) => { e.preventDefault(); onDrop?.() } : undefined}
      style={{ width: CHANNEL_STRIP_W, opacity: isDragging ? 0.4 : undefined }}
    >
      <div className="pr-strip-bar" style={{ background: trackColor }} />
      <div className="pr-strip-name">
        <MarqueeText name={trackName} spanStyle={{ fontSize: 'var(--text-md)', color: '#ffffff' }} />
        {!locked && (
          <Tooltip title="Reorder" description="Drag this strip left/right to change its position in the Mixer">
          <button
            className="pr-strip-grip"
            aria-label="Reorder"
            draggable
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); onDragStart?.() }}
            onDragEnd={onDragEnd}
          >
            <GripVertical size={14} />
          </button>
          </Tooltip>
        )}
      </div>
      <span className="pr-strip-inst">Track {trackIndex + 1}{track?.gmName && track.gmName !== trackName ? ` · ${track.gmName}` : ''}</span>

      <div className="pr-strip-knobs">
        <MixerKnob
          value={chorus} onChange={handleChorus}
          accentColor="var(--paint-lime)" size={52}
          disabled={sendsDisabled} label="Chorus"
          title="Chorus" description="Thickens the tone"
          disabledHint={sendHint}
        />
        <MixerKnob
          value={reverb} onChange={handleReverb}
          accentColor="var(--paint-blue)" size={52}
          disabled={sendsDisabled} label="Reverb"
          title="Reverb" description="Adds room/space ambience"
          disabledHint={sendHint}
        />
      </div>

      <Tooltip title="Pan" description={knobsDisabled ? 'Switch to the Studio or Native engine to use Pan.' : 'Left/right position in the stereo field'} wrapperStyle={{ flexShrink: 0 }}>
        <div className="pr-strip-pan" onMouseDown={e => e.stopPropagation()}>
          <input
            type="range" min={-1} max={1} step={0.02} value={pan} disabled={knobsDisabled}
            aria-label={t`Pan`} aria-valuetext={panText}
            onChange={e => { const v = Number(e.target.value); handlePan(Math.abs(v) < 0.07 ? 0 : v) }}
          />
          <span>{t`Pan`} {panText}</span>
        </div>
      </Tooltip>

      {/* ── VU meter + Fader (flex-grow, fills remaining height) ──────────── */}
      <div ref={sectionRef} className="pr-strip-fader">
        <div style={{ position: 'relative', width: 44, cursor: muted ? 'not-allowed' : 'default' }}>
          <div className="pr-fader-track" style={{ top: 0 }}>
            <div className="pr-fader-fill" style={{ height: `${visualVolume * 100}%`, background: trackColor }} />
          </div>
          <div
            className="pr-fader-cap"
            onPointerDown={handleFaderPointerDown}
            onMouseDown={e => e.stopPropagation()}
            tabIndex={muted ? -1 : 0}
            role="slider"
            aria-label="Channel volume"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={volume}
            aria-valuetext={`${dbText} dB`}
            aria-disabled={muted}
            onKeyDown={e => {
              if (muted) return
              const step = (e.shiftKey ? 5 : 1) * 0.02
              let delta = 0
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step
              else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step
              else if (e.key === 'Home') { e.preventDefault(); updateTrack(trackIndex, { volume: 0 }); setChannelVolume(midiChannel, 0); return }
              else if (e.key === 'End') { e.preventDefault(); updateTrack(trackIndex, { volume: 1 }); setChannelVolume(midiChannel, 1); return }
              else return
              e.preventDefault()
              const v = Math.max(0, Math.min(1, volume + delta))
              updateTrack(trackIndex, { volume: v })
              setChannelVolume(midiChannel, v)
            }}
            style={{ top: handleTop, transition: dragging ? undefined : 'top 150ms ease-out' }}
          />
        </div>
        {/* VU meter — driven by MIDI velocity via useStore.subscribe */}
        <div style={{ display: 'flex', alignItems: 'flex-end', flexShrink: 0 }}>
          <canvas ref={vuRef} aria-hidden="true" style={{ display: 'block', imageRendering: 'pixelated' }} />
        </div>
      </div>
      <span className="pr-strip-db">{dbText} dB</span>

      <div className="pr-strip-btns">
        <ToggleBtn label={t`Mute`} on={muted ? 'mute' : undefined} tip={muted ? t`Unmute audio` : t`Mute audio`}
          onClick={() => useStore.getState().setTrackMuted(trackIndex, !muted)} />
        <ToggleBtn label={t`Solo`} on={solo ? 'solo' : undefined} tip={solo ? 'Unsolo track' : 'Solo track'}
          onClick={() => updateTrack(trackIndex, { solo: !solo })} />
        <ToggleBtn label={t`Roll`} on={visible ? 'paper' : undefined} tip={visible ? 'Hide notes on the Piano Roll' : 'Show notes on the Piano Roll'}
          onClick={() => updateTrack(trackIndex, { visible: !visible })} />
        <ToggleBtn label={t`Keys`} on={showOnKeyboard ? 'paper' : undefined} tip={showOnKeyboard ? 'Notes light up on keyboard' : 'Notes won’t light up on the keyboard'}
          onClick={() => updateTrack(trackIndex, { showOnKeyboard: !showOnKeyboard })} />
      </div>
    </section>
  )
}
