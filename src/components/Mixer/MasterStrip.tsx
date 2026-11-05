import { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import MixerKnob from './MixerKnob'
import CompressorIcon from '../CompressorIcon'
import Tooltip, { TooltipBox } from '../Tooltip'
import {
  setMasterChorus,
  setMasterReverb,
  setMasterTone,
  setMasterCompressor,
  COMPRESSOR_PRESETS,
} from '../../audio/engine'
import { useDevicePixelRatio } from '../../hooks/useDevicePixelRatio'

export const MASTER_STRIP_W = 232

// ── VU meter constants ────────────────────────────────────────────────────────
const SEG_H    = 4
const SEG_GAP  = 2
const SEG_UNIT = SEG_H + SEG_GAP

// ── Aggregate pitch-band constants — 8 bands covering MIDI 21–108 ─────────────
// Each band represents ~11 semitones; column visuals reuse bars-mode dimensions.
const BAND_COUNT  = 8
const BAND_MIN    = 21   // A0
const BAND_STEP   = 11   // semitones per band

const BAR_COL_W   = 14
const BAR_COL_GAP = 2
const BAR_TOTAL_W = BAND_COUNT * BAR_COL_W + (BAND_COUNT - 1) * BAR_COL_GAP  // 126px

// Canvas 2D fillStyle/gradient/shadowColor (used below in drawBars/drawWave/segColor)
// cannot resolve CSS var() strings directly, so these are resolved once from index.css's
// --meter-* tokens via getComputedStyle (see resolveMeterColorsFromCSS, called on mount) —
// index.css stays the single source of truth; these are just its canvas-usable cache.
// Defaults here only cover the sliver before the mount effect runs.
let METER_GREEN      = '#7ac040'
let METER_YELLOW     = '#c0a020'
let METER_ORANGE     = '#c07a20'
let METER_RED        = '#c04040'

function resolveMeterColorsFromCSS() {
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  METER_GREEN      = read('--meter-green',      METER_GREEN)
  METER_YELLOW     = read('--meter-yellow',     METER_YELLOW)
  METER_ORANGE     = read('--meter-orange',     METER_ORANGE)
  METER_RED        = read('--meter-red',        METER_RED)
}

// ── One of the global buttons; `on` names its filled colour ─────────────────
function GlobalBtn({ label, on, title, description, onClick }: { label: string; on?: 'mute' | 'solo' | 'paper'; title: string; description: string; onClick: () => void }) {
  return (
    <Tooltip title={title} description={description}>
      <button className="pr-mix-btn" aria-label={title} aria-pressed={!!on} data-on={on} style={{ width: '100%' }} onClick={onClick}>{label}</button>
    </Tooltip>
  )
}

// ── CompressorPresetKnob — the preset-selector knob, no static radial
// labels (those made its footprint wider than a plain knob and threw off
// its right-alignment against Tone). Instead: hovering a tick shows THAT
// preset's info regardless of what's currently selected; hovering the
// knob's own center shows whichever preset actually IS selected. The
// hover math runs on this wrapper div, not on MixerKnob itself — mouse
// events still reach here even when the knob inside is `disabled` (that
// only sets pointer-events:none on the SVG, which makes hit-testing fall
// through to this parent), which is exactly what lets the tooltips stay
// live while `interactive=false` blocks actually dragging the knob. ───────
function CompressorPresetKnob({ presetIndex, onChange, disabled, interactive }: {
  presetIndex: number
  onChange: (v: number) => void
  disabled?: boolean
  interactive: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hoverPreset, setHoverPreset] = useState<number | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
    const dx = e.clientX - cx, dy = e.clientY - cy
    // Center zone (the knob's own body circle, r=13 of the 52px viewBox)
    // → whichever preset is actually selected right now.
    if (Math.sqrt(dx * dx + dy * dy) < rect.width * (13 / 52)) {
      setHoverPreset(presetIndex)
      return
    }
    // Ring zone → nearest tick, same angle math as MixerKnob's own
    // angleToNorm (ARC_START=135°, ARC_SWEEP=270°, dead zone below).
    let deg = Math.atan2(dy, dx) * (180 / Math.PI)
    if (deg < 0) deg += 360
    let norm: number
    if (deg >= 135) norm = (deg - 135) / 270
    else if (deg <= 45) norm = (deg + 225) / 270
    else { setHoverPreset(null); return }
    setHoverPreset(Math.round(Math.max(0, Math.min(1, norm)) * (COMPRESSOR_PRESETS.length - 1)))
  }, [presetIndex])

  const hovered = hoverPreset !== null ? COMPRESSOR_PRESETS[hoverPreset] : null
  // While the engine itself has the compressor unavailable, every tick shows
  // the same "switch engines" explanation instead of its own preset info —
  // there's nothing preset-specific to say if you can't select any of them.
  const content = hoverPreset === null ? null
    : disabled ? { title: 'Compressor', description: 'Switch to the Studio or Native engine to use the Compressor.' }
    : hovered ? { title: hovered.label, description: `${hovered.ratio}:1 ratio, ${hovered.threshold} dB threshold` }
    : null

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverPreset(null)}
      style={{ position: 'relative' }}
    >
      <MixerKnob
        value={presetIndex / (COMPRESSOR_PRESETS.length - 1)} onChange={onChange}
        accentColor="var(--paint-rose)" size={52}
        disabled={disabled || !interactive} dotCount={COMPRESSOR_PRESETS.length} tickMajorEvery={0}
      />
      <TooltipBox
        anchorRect={hoverPreset !== null ? wrapRef.current?.getBoundingClientRect() ?? null : null}
        content={content}
        visible={hoverPreset !== null}
      />
    </div>
  )
}

// ── Segment color by normalized position ──────────────────────────────────────
function segColor(i: number, total: number): string {
  const pct = i / total
  if (pct >= 0.88) return METER_RED
  if (pct >= 0.75) return METER_ORANGE
  if (pct >= 0.60) return METER_YELLOW
  return METER_GREEN
}

// ── Draw aggregate bars VU — 8 pitch-band columns ────────────────────────────
function drawBars(
  canvas: HTMLCanvasElement,
  levels: number[], attacks: number[],
  segs: number, canvasH: number, canvasW: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const xStart = ((canvasW - BAR_TOTAL_W) / 2) * dpr
  const colW   = BAR_COL_W * dpr
  const gap    = BAR_COL_GAP * dpr

  for (let col = 0; col < BAND_COUNT; col++) {
    const level     = levels[col] ?? 0
    const attack    = attacks[col] ?? 0
    const activeSeg = Math.floor(level * segs)
    const xOff      = xStart + col * (colW + gap)

    for (let i = 0; i < segs; i++) {
      const y = (canvasH - (i + 1) * SEG_UNIT) * dpr
      const h = SEG_H * dpr
      if (i < activeSeg) {
        ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 1
      } else if (i === activeSeg && attack > 0) {
        // Attack flash uses zone color — prevents white bleed on red segments
        ctx.fillStyle = segColor(i, segs)
        ctx.globalAlpha = 0.5 + 0.5 * attack
      } else {
        ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 0.08
      }
      ctx.fillRect(xOff, y, colW, h)
    }
  }
  ctx.globalAlpha = 1
}

// ── Draw wave VU — one lime line; idle breathing keeps it alive between notes
// levels: smoothly lerped 0-1 values per band;
// breathOffsets: per-band sine offsets applied when signal is absent.
function drawWave(
  canvas: HTMLCanvasElement,
  levels: number[],
  breathOffsets: number[],
  canvasH: number, canvasW: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const W = canvasW * dpr
  const H = canvasH * dpr
  const N = levels.length

  // Apply per-band breathing offsets to displayed levels
  const display = levels.map((v, i) => Math.min(1, Math.max(0, v + breathOffsets[i])))

  // Map band levels to canvas points — bottom = silence, top = full level
  const pts = display.map((v, i) => ({
    x: (N === 1 ? W / 2 : (i / (N - 1)) * W),
    y: H * (1 - v),
  }))

  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < N - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    ctx.bezierCurveTo(mx, pts[i].y, mx, pts[i + 1].y, pts[i + 1].x, pts[i + 1].y)
  }
  ctx.strokeStyle = METER_GREEN
  ctx.lineWidth = 2 * dpr
  ctx.stroke()
}

// ── MasterStrip — 160×574 ─────────────────────────────────────────────────────
export default function MasterStrip() {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine         = useStore(s => s.audioEngine)
  const masterVolume        = useStore(s => s.masterVolume)
  const setMasterVolume     = useStore(s => s.setMasterVolume)
  const masterCompEnabled   = useStore(s => s.masterCompEnabled)
  const setMasterCompEnabled = useStore(s => s.setMasterCompEnabled)
  const masterCompPreset    = useStore(s => s.masterCompPreset)
  const setMasterCompPreset = useStore(s => s.setMasterCompPreset)
  // ── Signature of the fields these global buttons actually care about —
  // mute/visible/keyboard/drum/group — NOT volume/pan/chorus/reverb. Those
  // four change on every fader/knob mousemove; subscribing to the whole
  // `tracks` array re-rendered MasterStrip (and its heavier siblings) on
  // every tick of any drag, contributing to the playback stutter reported
  // while dragging Console faders. ──────────────────────────────────────────
  const trackSignature = useStore(s =>
    s.tracks.map(t => `${t.index}:${t.muted ? 1 : 0}:${t.visible ? 1 : 0}:${t.showOnKeyboard ? 1 : 0}:${t.isDrum ? 1 : 0}:${t.group ?? ''}`).join('|'))
  const tracks = useMemo(() => useStore.getState().tracks, [trackSignature])
  const updateTrack         = useStore(s => s.updateTrack)
  const autoMuteNonKeyboard = useStore(s => s.autoMuteNonKeyboard)
  const setTrackMuteFilter  = useStore(s => s.setTrackMuteFilter)
  const vuDisplayMode       = useStore(s => s.vuDisplayMode)
  const setVuDisplayMode    = useStore(s => s.setVuDisplayMode)
  // Console stays mounted (display:none) after first open so internal state
  // survives hide/show — gate the VU rAF loop below on this, not just mount.
  const mixerOpen           = useStore(s => s.mixerOpen)

  // ── Resolve meter colors from CSS tokens once on mount — see resolveMeterColorsFromCSS ──
  useEffect(() => { resolveMeterColorsFromCSS() }, [])

  const knobsDisabled = audioEngine === 'gm'

  // ── Knob local state ──────────────────────────────────────────────────────
  const [chorus, setChorusState] = useState(0)
  const [reverb, setReverbState] = useState(0)
  const [tone,   setToneState]   = useState(0)

  // ── Master Volume's live value tooltip — visible on hover OR while dragging ──
  const volumeKnobWrapRef = useRef<HTMLDivElement>(null)
  const [volumeHover, setVolumeHover] = useState(false)
  const [volumeDragging, setVolumeDragging] = useState(false)

  // ── VU refs — bars uses hard levels+attacks; wave uses lerped levels+peaks ─
  const vuRef        = useRef<HTMLCanvasElement>(null)
  const vuLevels     = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const vuAttacks    = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const waveTargets  = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const waveLevels   = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const breathPhase  = useRef(0)
  const breathAmp    = useRef(0)
  const rafRef       = useRef(0)

  // ── VU section dimensions — measured via ResizeObserver ──────────────────
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionH, setSectionH] = useState(150)
  const [sectionW, setSectionW] = useState(204)

  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setSectionH(e.contentRect.height)
      setSectionW(e.contentRect.width)
    })
    ro.observe(el)
    setSectionH(el.getBoundingClientRect().height)
    setSectionW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // No label row in either mode — full canvas height used
  const vuCanvasH = Math.max(30, sectionH - 12)
  const vuSegs    = Math.max(5, Math.floor(vuCanvasH / SEG_UNIT))

  // ── Resize canvas — also on device pixel ratio change, see ChannelStrip's
  // identical fix for why: the draw functions below read a fresh DPR every
  // frame, so the backing store has to keep up with a live Windows-scaling
  // change too, not just a layout resize. ────────────────────────────────
  const dpr = useDevicePixelRatio()
  useLayoutEffect(() => {
    const canvas = vuRef.current
    if (!canvas) return
    canvas.width  = sectionW * dpr
    canvas.height = vuCanvasH * dpr
    canvas.style.width  = sectionW + 'px'
    canvas.style.height = vuCanvasH + 'px'
  }, [sectionW, vuCanvasH, dpr])

  // ── VU subscription — aggregate pitch-band levels across all non-muted tracks ──
  // Scans every non-muted track's notes at currentTime, maps each sounding note
  // to one of BAND_COUNT pitch bands; both bars and wave targets are updated here.
  useEffect(() => {
    const unsub = useStore.subscribe(state => {
      const { currentTime, playbackState, midi: md, tracks: tks } = state
      if (playbackState !== 'playing' || !md) return

      const targets = new Array(BAND_COUNT).fill(0)

      for (const tr of tks) {
        if (tr.muted) continue
        const pt = md.tracks.find((t: any) => t.index === tr.index)
        if (!pt) continue
        for (const note of pt.notes) {
          if (note.time > currentTime + 0.02) break
          if (currentTime >= note.time && currentTime < note.time + note.duration) {
            const band = Math.min(BAND_COUNT - 1, Math.max(0,
              Math.floor((note.midi - BAND_MIN) / BAND_STEP),
            ))
            if (note.velocity > targets[band]) targets[band] = note.velocity
          }
        }
      }

      for (let i = 0; i < BAND_COUNT; i++) {
        if (targets[i] > vuLevels.current[i]) vuAttacks.current[i] = 1
        if (targets[i] > 0) vuLevels.current[i] = targets[i]
        // Wave targets track peak; rAF decay brings them down gradually
        if (targets[i] > waveTargets.current[i]) waveTargets.current[i] = targets[i]

      }
    })
    return unsub
  }, [])

  // ── rAF loop — decay bars + lerp wave + peaks, advance breathing, redraw ──
  // Gated on mixerOpen: this component stays mounted (display:none) after
  // first open, and rAF keeps firing regardless of CSS visibility — without
  // this guard the canvas fill-rect loop runs forever after the Mixer closes.
  useEffect(() => {
    if (!mixerOpen) return
    const loop = () => {
      for (let i = 0; i < BAND_COUNT; i++) {
        // Bars: hard decay
        vuLevels.current[i]    = Math.max(0, vuLevels.current[i]  - 0.013)
        vuAttacks.current[i]   = Math.max(0, vuAttacks.current[i] - 0.06)
        // Wave: decay target, lerp display level, slow peak decay
        waveTargets.current[i] = Math.max(0, waveTargets.current[i] - 0.013)
        waveLevels.current[i] += (waveTargets.current[i] - waveLevels.current[i]) * 0.12
      }
      // Idle breathing — amplitude lerps in when all bands silent, out when active
      const maxLevel = Math.max(...waveLevels.current)
      const isIdle   = maxLevel < 0.04
      breathAmp.current   += ((isIdle ? 0.018 : 0) - breathAmp.current) * 0.02
      breathPhase.current += 0.018
      const breathOffsets  = Array.from({ length: BAND_COUNT }, (_, i) =>
        Math.sin(breathPhase.current + i * 0.5) * breathAmp.current,
      )
      if (vuRef.current) {
        if (vuDisplayMode === 'wave') {
          drawWave(vuRef.current, waveLevels.current, breathOffsets, vuCanvasH, sectionW)
        } else {
          drawBars(vuRef.current, vuLevels.current, vuAttacks.current, vuSegs, vuCanvasH, sectionW)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuDisplayMode, vuSegs, vuCanvasH, sectionW, mixerOpen])

  // ── Knob handlers ─────────────────────────────────────────────────────────
  const handleChorus = useCallback((v: number) => { setChorusState(v); setMasterChorus(v) }, [])
  const handleReverb = useCallback((v: number) => { setReverbState(v); setMasterReverb(v) }, [])
  const handleTone   = useCallback((v: number) => { setToneState(v);   setMasterTone(v)   }, [])

  // ── Compressor preset knob — snapped to 5 discrete positions (0-1 knob
  // value quantized to the nearest of COMPRESSOR_PRESETS' 5 indices). ──────
  const handleCompPreset = useCallback((v: number) => {
    const preset = Math.round(v * (COMPRESSOR_PRESETS.length - 1))
    setMasterCompPreset(preset)
    setMasterCompressor(masterCompEnabled, preset)
  }, [masterCompEnabled, setMasterCompPreset])
  const handleCompToggle = useCallback(() => {
    const next = !masterCompEnabled
    setMasterCompEnabled(next)
    setMasterCompressor(next, masterCompPreset)
  }, [masterCompEnabled, masterCompPreset, setMasterCompEnabled])

  // ── Global action state — derived from all track states ───────────────────
  const allMuted       = tracks.length > 0 && tracks.every(t => t.muted)
  const allVisible     = tracks.length > 0 && tracks.every(t => t.visible)
  const allOnKeyboard  = tracks.length > 0 && tracks.every(t => t.showOnKeyboard)

  // ── Global action handlers ─────────────────────────────────────────────────
  const handleMuteAll = useCallback(() => {
    const target = !allMuted
    tracks.forEach(t => useStore.getState().setTrackMuted(t.index, target))
  }, [allMuted, tracks])

  const handleVisibleAll = useCallback(() => {
    const target = !allVisible
    tracks.forEach(t => updateTrack(t.index, { visible: target }))
  }, [allVisible, tracks, updateTrack])

  const handleKeyboardAll = useCallback(() => {
    const target = !allOnKeyboard
    tracks.forEach(t => updateTrack(t.index, { showOnKeyboard: target }))
  }, [allOnKeyboard, tracks, updateTrack])

  // ── Focus on/off — the store's own flag (Tracks panel uses the same) ──────
  const isCurrentlyFiltered = useStore(s => s.focusActive)

  const volumePct = Math.round(masterVolume * 100)
  const comboHint = 'Switch to the Studio or Native engine to use the Compressor.'

  return (
    <section className="pr-master" aria-label={t`Master`} style={{ '--pr-knob-body': 'var(--ink-800)' } as React.CSSProperties}>
      <div className="pr-master-head">
        <span>{t`Master`}</span>
        <div className="o-seg" role="group" aria-label={t`Meter`}>
          <button aria-pressed={vuDisplayMode === 'wave'} onClick={() => setVuDisplayMode('wave')}>{t`Wave`}</button>
          <button aria-pressed={vuDisplayMode === 'bars'} onClick={() => setVuDisplayMode('bars')}>{t`Bars`}</button>
        </div>
      </div>

      <div ref={sectionRef} className="pr-master-meter">
        <canvas ref={vuRef} aria-hidden="true" style={{ display: 'block', imageRendering: 'pixelated', flexShrink: 0 }} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10 }}>
        <div
          ref={volumeKnobWrapRef}
          className="pr-master-fader"
          style={{ flex: '0 0 56px' }}
          onMouseEnter={() => setVolumeHover(true)}
          onMouseLeave={() => setVolumeHover(false)}
        >
          <input
            type="range" min={0} max={100} step={1} value={volumePct}
            aria-label={t`Master volume`}
            onPointerDown={() => setVolumeDragging(true)}
            onPointerUp={() => setVolumeDragging(false)}
            onChange={e => setMasterVolume(Number(e.target.value) / 100)}
            style={{ '--fill': `${volumePct}%` } as React.CSSProperties}
          />
          <TooltipBox
            anchorRect={(volumeHover || volumeDragging) ? volumeKnobWrapRef.current?.getBoundingClientRect() ?? null : null}
            content={{ title: 'Master Volume', description: `${volumePct}%` }}
            placement="left"
            visible={volumeHover || volumeDragging}
            readout={volumeDragging}
          />
        </div>

        <div className="pr-master-grid">
          <MixerKnob
            value={chorus} onChange={handleChorus}
            accentColor="var(--paint-lime)" size={52}
            disabled={knobsDisabled} label="Chorus"
            title="Chorus" description="Thickens the overall mix by layering slightly detuned copies of it"
            disabledHint="Switch to the Studio or Native engine to use Chorus."
          />
          <MixerKnob
            value={reverb} onChange={handleReverb}
            accentColor="var(--paint-blue)" size={52}
            disabled={knobsDisabled} label="Reverb"
            title="Reverb" description="Adds room/space ambience to the mix"
            disabledHint="Switch to the Studio or Native engine to use Reverb."
          />
          <MixerKnob
            value={tone} onChange={handleTone}
            accentColor="var(--paint-blue)" size={52}
            disabled={knobsDisabled} bipolar label="Tone"
            title="Tone" description="Tilts the overall EQ darker or brighter"
            disabledHint="Switch to the Studio or Native engine to use Tone."
          />
          <div className="pr-knob-cell">
            <Tooltip
              title={knobsDisabled ? 'Compressor' : masterCompEnabled ? 'Compressor on' : 'Compressor off'}
              description={knobsDisabled ? comboHint : 'Automatically pulls down the loudest peaks so playback stays clear of digital clipping, without a blanket volume cut. Click to toggle.'}
            >
              <button className="pr-comp" aria-label={t`Compressor`} aria-pressed={masterCompEnabled} disabled={knobsDisabled} onClick={handleCompToggle}>
                <CompressorIcon size={22} />
              </button>
            </Tooltip>
            <span className="pr-knob-label">{t`Compressor`}</span>
          </div>
          {/* Hovering a tick shows that preset's info; disabled while the compressor is off */}
          <div className="pr-knob-cell">
            <CompressorPresetKnob
              presetIndex={masterCompPreset} onChange={handleCompPreset}
              disabled={knobsDisabled} interactive={masterCompEnabled}
            />
            <span className="pr-knob-label">{t`Strength`}</span>
          </div>
          <div className="pr-knob-cell" style={{ justifyContent: 'center', height: 70 }}>
            <span className="pr-master-db">{masterVolume === 0 ? '−∞ dB' : `${(20 * Math.log10(masterVolume)).toFixed(1)} dB`}</span>
          </div>
        </div>
      </div>

      <div className="pr-strip-btns">
        <GlobalBtn label={allMuted ? t`Unmute all` : t`Mute all`} on={allMuted ? 'mute' : undefined}
          title={allMuted ? 'Unmute all tracks' : 'Mute all tracks'}
          description={allMuted ? 'Restore every track to its own mute state' : 'Silence every track at once'} onClick={handleMuteAll} />
        <GlobalBtn label={allVisible ? t`Hide all` : t`Show all`}
          title={allVisible ? 'Hide all on the piano roll' : 'Show all on the piano roll'}
          description={allVisible ? 'Hide every track’s falling notes on the Piano Roll' : 'Show every track’s falling notes on the Piano Roll'} onClick={handleVisibleAll} />
        <GlobalBtn label={t`All on keys`} on={allOnKeyboard ? 'paper' : undefined}
          title={allOnKeyboard ? 'Hide all on keyboard' : 'Show all on keyboard'}
          description={allOnKeyboard ? 'Stop every track lighting up the on-screen keyboard' : 'Every track lights up the on-screen keyboard'} onClick={handleKeyboardAll} />
        {autoMuteNonKeyboard && (
          <GlobalBtn label={t`Focus on keys`} on={isCurrentlyFiltered ? 'solo' : undefined}
            title={isCurrentlyFiltered ? t`Focus on the keys` : t`Playing all tracks`}
            description={isCurrentlyFiltered ? t`Hearing keys, bass & drums, seeing only the keys. Click to bring back all tracks as they were.` : t`Click to hear only keys, bass & drums and see only the keys — good for practising`}
            onClick={() => setTrackMuteFilter(!isCurrentlyFiltered)} />
        )}
      </div>
    </section>
  )
}
