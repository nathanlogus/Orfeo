/**
 * MIDI Playback Editor — floating modal (same architecture as ChordExplorer / MixerConsole)
 *
 * Replaces the previous separate BrowserWindow. Reads MIDI and track state directly
 * from the Zustand store; save/split return file data so the renderer reloads inline.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { t } from '../../utils/i18n'
import { createPortal } from 'react-dom'
import { Check, X, Save, FolderOpen, ChevronDown, ChevronRight, Search, Merge, Split, Undo2, RotateCcw, Piano, Bell, Church, Guitar, Music2, AudioWaveform, Users, Megaphone, Wind, Feather, Cpu, Globe, Drum, Radio, Waves, Sparkles, ThumbsUp, AudioLines } from 'lucide-react'
import { confirmDialog } from '../../utils/confirmController'
import { PENCIL_CURSOR } from '../../utils/cursors'
import { TRACK_COLOR_PALETTE, pianoFamilyColor, distinctTrackColor } from '../../utils/colors'
import { handHex } from '../../utils/handPalette'
import { useStore } from '../../store'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { bringToFront, MODAL_BASE_Z } from '../../utils/modalFocus'
import { KEYBOARD_GROUPS, HAND_ASSIGN_GROUPS } from '../../utils/keyboardGroups'
import { NES } from '../../utils/noteEditorState'
import { nextOrfeoBaseName } from '../../utils/orfeoVersioning'
import { getHandPreviewStats, getLowConfidencePassages } from '../../utils/handPreview'
import { withHandSuffix } from '../../utils/handMetadata'
import { getGMName, getGMGroup } from '../../utils/gmInstruments'
import { computeTempoKeyPayload } from '../../utils/tempoKeySave'
import { songKey } from '../../utils/songIdentity'
import { carryCorrection } from '../../utils/tempoCorrection'
import type { ParsedNote } from '../../types'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useClampPositionOnZoom } from '../../hooks/useClampPositionOnZoom'
import { clampModalPos, startModalDrag } from '../../utils/modalDrag'
import Tooltip from '../Tooltip'
import '../../styles/redesign-tools.css'

const MODAL_W = 1216
const MODAL_H = 744
const modalW = () => Math.min(MODAL_W, window.innerWidth - 32)

// ─── GM data ──────────────────────────────────────────────────────────────────

const GM_FAMILY_ICONS: Record<string, React.ReactNode> = {
  piano:      <Piano size={15} />,
  chromatic:  <Bell size={15} />,
  organ:      <Church size={15} />,
  guitar:     <Guitar size={15} />,
  bass:       <Music2 size={15} />,
  strings:    <AudioWaveform size={15} />,
  ensemble:   <Users size={15} />,
  brass:      <Megaphone size={15} />,
  reed:       <Wind size={15} />,
  pipe:       <Feather size={15} />,
  synth_lead: <Cpu size={15} />,
  synth_pad:  <Waves size={15} />,
  synth_fx:   <Sparkles size={15} />,
  ethnic:     <Globe size={15} />,
  percussive: <Drum size={15} />,
  sound_fx:   <Radio size={15} />,
}

const GM_FAMILIES: { key: string; label: string; programs: { num: number; name: string }[] }[] = [
  { key: 'piano', label: 'Piano', programs: [
    {num:0,name:'Acoustic Grand Piano'},{num:1,name:'Bright Acoustic Piano'},
    {num:2,name:'Electric Grand Piano'},{num:3,name:'Honky-tonk Piano'},
    {num:4,name:'Electric Piano 1'},{num:5,name:'Electric Piano 2'},
    {num:6,name:'Harpsichord'},{num:7,name:'Clavinet'},
  ]},
  { key: 'chromatic', label: 'Chromatic Perc', programs: [
    {num:8,name:'Celesta'},{num:9,name:'Glockenspiel'},{num:10,name:'Music Box'},
    {num:11,name:'Vibraphone'},{num:12,name:'Marimba'},{num:13,name:'Xylophone'},
    {num:14,name:'Tubular Bells'},{num:15,name:'Dulcimer'},
  ]},
  { key: 'organ', label: 'Organ', programs: [
    {num:16,name:'Drawbar Organ'},{num:17,name:'Percussive Organ'},{num:18,name:'Rock Organ'},
    {num:19,name:'Church Organ'},{num:20,name:'Reed Organ'},{num:21,name:'Accordion'},
    {num:22,name:'Harmonica'},{num:23,name:'Tango Accordion'},
  ]},
  { key: 'guitar', label: 'Guitar', programs: [
    {num:24,name:'Nylon Guitar'},{num:25,name:'Steel Guitar'},{num:26,name:'Jazz Guitar'},
    {num:27,name:'Clean Guitar'},{num:28,name:'Muted Guitar'},{num:29,name:'Overdriven Guitar'},
    {num:30,name:'Distortion Guitar'},{num:31,name:'Guitar Harmonics'},
  ]},
  { key: 'bass', label: 'Bass', programs: [
    {num:32,name:'Acoustic Bass'},{num:33,name:'Finger Bass'},{num:34,name:'Pick Bass'},
    {num:35,name:'Fretless Bass'},{num:36,name:'Slap Bass 1'},{num:37,name:'Slap Bass 2'},
    {num:38,name:'Synth Bass 1'},{num:39,name:'Synth Bass 2'},
  ]},
  { key: 'strings', label: 'Strings', programs: [
    {num:40,name:'Violin'},{num:41,name:'Viola'},{num:42,name:'Cello'},{num:43,name:'Contrabass'},
    {num:44,name:'Tremolo Strings'},{num:45,name:'Pizzicato Strings'},
    {num:46,name:'Orchestral Harp'},{num:47,name:'Timpani'},
  ]},
  { key: 'ensemble', label: 'Ensemble', programs: [
    {num:48,name:'String Ensemble 1'},{num:49,name:'String Ensemble 2'},
    {num:50,name:'Synth Strings 1'},{num:51,name:'Synth Strings 2'},
    {num:52,name:'Choir Aahs'},{num:53,name:'Voice Oohs'},
    {num:54,name:'Synth Voice'},{num:55,name:'Orchestra Hit'},
  ]},
  { key: 'brass', label: 'Brass', programs: [
    {num:56,name:'Trumpet'},{num:57,name:'Trombone'},{num:58,name:'Tuba'},
    {num:59,name:'Muted Trumpet'},{num:60,name:'French Horn'},{num:61,name:'Brass Section'},
    {num:62,name:'Synth Brass 1'},{num:63,name:'Synth Brass 2'},
  ]},
  { key: 'reed', label: 'Reed', programs: [
    {num:64,name:'Soprano Sax'},{num:65,name:'Alto Sax'},{num:66,name:'Tenor Sax'},
    {num:67,name:'Baritone Sax'},{num:68,name:'Oboe'},{num:69,name:'English Horn'},
    {num:70,name:'Bassoon'},{num:71,name:'Clarinet'},
  ]},
  { key: 'pipe', label: 'Pipe', programs: [
    {num:72,name:'Piccolo'},{num:73,name:'Flute'},{num:74,name:'Recorder'},
    {num:75,name:'Pan Flute'},{num:76,name:'Blown Bottle'},{num:77,name:'Shakuhachi'},
    {num:78,name:'Whistle'},{num:79,name:'Ocarina'},
  ]},
  { key: 'synth_lead', label: 'Synth Lead', programs: [
    {num:80,name:'Square Lead'},{num:81,name:'Sawtooth Lead'},{num:82,name:'Calliope Lead'},
    {num:83,name:'Chiff Lead'},{num:84,name:'Charang Lead'},{num:85,name:'Voice Lead'},
    {num:86,name:'Fifths Lead'},{num:87,name:'Bass+Lead'},
  ]},
  { key: 'synth_pad', label: 'Synth Pad', programs: [
    {num:88,name:'New Age Pad'},{num:89,name:'Warm Pad'},{num:90,name:'Polysynth Pad'},
    {num:91,name:'Choir Pad'},{num:92,name:'Bowed Pad'},{num:93,name:'Metallic Pad'},
    {num:94,name:'Halo Pad'},{num:95,name:'Sweep Pad'},
  ]},
  { key: 'synth_fx', label: 'Synth FX', programs: [
    {num:96,name:'Rain FX'},{num:97,name:'Soundtrack FX'},{num:98,name:'Crystal FX'},
    {num:99,name:'Atmosphere FX'},{num:100,name:'Brightness FX'},{num:101,name:'Goblins FX'},
    {num:102,name:'Echoes FX'},{num:103,name:'Sci-fi FX'},
  ]},
  { key: 'ethnic', label: 'Ethnic', programs: [
    {num:104,name:'Sitar'},{num:105,name:'Banjo'},{num:106,name:'Shamisen'},
    {num:107,name:'Koto'},{num:108,name:'Kalimba'},{num:109,name:'Bag Pipe'},
    {num:110,name:'Fiddle'},{num:111,name:'Shanai'},
  ]},
  { key: 'percussive', label: 'Percussive', programs: [
    {num:112,name:'Tinkle Bell'},{num:113,name:'Agogo'},{num:114,name:'Steel Drums'},
    {num:115,name:'Woodblock'},{num:116,name:'Taiko Drum'},{num:117,name:'Melodic Tom'},
    {num:118,name:'Synth Drum'},{num:119,name:'Reverse Cymbal'},
  ]},
  { key: 'sound_fx', label: 'Sound FX', programs: [
    {num:120,name:'Guitar Fret Noise'},{num:121,name:'Breath Noise'},{num:122,name:'Seashore'},
    {num:123,name:'Bird Tweet'},{num:124,name:'Telephone Ring'},{num:125,name:'Helicopter'},
    {num:126,name:'Applause'},{num:127,name:'Gunshot'},
  ]},
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditorTrack {
  index: number; name: string; gmName: string; trackName: string; program: number
  group: string; isDrum: boolean; color: string; colorSource: 'default' | 'palette' | 'custom'
  channel: number; noteCount: number
  included: boolean; mergeSelected: boolean; newProgram: number
  visible: boolean; showOnKeyboard: boolean
  isMerged?: boolean
  mergedFromIndices?: number[]
  mergedFromNames?: string[]
  // ── Staged hand-split — set on both output rows of an in-progress split
  // (see handleSplitConfirm). splitOriginIndex is the source track's editor
  // index on BOTH halves; the LH row also keeps that as its own `index`,
  // the RH row gets a synthetic one (same scheme merged rows already use)
  // so it has its own row identity for color/rename/include. Nothing hits
  // disk until Save & Reload — editor:save resolves these back to raw
  // track indices and does the actual note-splitting in one write. ────────
  splitHand?: 'L' | 'R'
  splitOriginIndex?: number
}

interface EditorState {
  fileName: string; filePath: string
  rows: EditorTrack[]
  outputPath: string
}

type MergeGroup = number[]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ── Preview only — the actual save (electron/main.ts editor:save) computes
// its own output path with the same rule (src/utils/orfeoVersioning.ts),
// this just keeps what's shown here accurate to that. ─────────────────────
function orfeoName(p: string) {
  const norm = p.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  const base = norm.substring(slash + 1).replace(/\.midi?$/i, '')
  return `${nextOrfeoBaseName(base)}.mid`
}
function baseName(p: string) { return p.split(/[\\/]/).pop() ?? p }


// ─── Instrument Picker ────────────────────────────────────────────────────────

function InstrumentPicker({ program, onChange, disabled }: {
  program: number; onChange: (p: number) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const currentName = GM_FAMILIES.flatMap(f => f.programs).find(p => p.num === program)?.name ?? `Program ${program}`
  const searchLower = search.toLowerCase()
  const filteredFamilies = search
    ? GM_FAMILIES.map(f => ({ ...f, programs: f.programs.filter(p => p.name.toLowerCase().includes(searchLower)) })).filter(f => f.programs.length > 0)
    : GM_FAMILIES

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <button className="xp-pe-inst" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={disabled}>
        <span>{currentName}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && createPortal(
        <div
          // Portaled out of the anchor's DOM subtree, so the outside-click
          // handler's `ref.current.contains(target)` check (below) would see
          // every click inside this popup as "outside" and close it
          // immediately — stopping propagation here keeps those clicks from
          // ever reaching the document listener.
          onMouseDown={e => e.stopPropagation()}
          className="theme-paper xp-pop"
          style={{ zIndex: 50000, width: 280, height: 'min(360px, calc(100vh - 24px))', overflow: 'hidden' }}
          ref={el => {
            if (!el || !ref.current) return
            const r = ref.current.getBoundingClientRect()
            const h = el.offsetHeight
            // opens upward where the row sits too low for it
            el.style.top = Math.max(12, r.bottom + 4 + h > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px'
            el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 288)) + 'px'
          }}>
          <div className="xp-inst-head">
            <label>
              <Search size={14} style={{ flexShrink: 0 }} />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" aria-label="Search instruments" />
            </label>
          </div>
          <div className="xp-inst-list">
            {filteredFamilies.map(family => {
              const expanded = search ? true : expandedFamily === family.key
              return (
                <div key={family.key}>
                  <button aria-selected={false} aria-expanded={expanded} disabled={!!search} onClick={() => setExpandedFamily(expanded ? null : family.key)}>
                    <span style={{ display: 'flex', flexShrink: 0 }}>{GM_FAMILY_ICONS[family.key] ?? <Music2 size={12} />}</span>
                    <span style={{ flex: 1 }}>{family.label}</span>
                    {!search && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                  </button>
                  {expanded && family.programs.map(p => (
                    <button key={p.num} data-program aria-selected={p.num === program} onClick={() => { onChange(p.num); setOpen(false); setSearch('') }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── HSV ↔ Hex utilities ─────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d > 0) {
    if      (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else                h = (r - g) / d + 4
    h *= 60
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}`
}

// ─── HSV Picker (rainbow square + hue slider) ─────────────────────────────────

function HsvPicker({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(HEX_RE.test(color) ? color : '#e8a027'))
  const svBoxRef  = useRef<HTMLDivElement>(null)
  const hueBoxRef = useRef<HTMLDivElement>(null)
  const dragging  = useRef<'sv' | 'hue' | null>(null)
  const hsvRef    = useRef(hsv)
  hsvRef.current  = hsv

  // ── Sync when color prop changes externally (palette click / hex input) ───────
  const lastEmitted = useRef(color)
  useEffect(() => {
    if (color === lastEmitted.current || !HEX_RE.test(color)) return
    lastEmitted.current = color
    setHsv(hexToHsv(color))
  }, [color])

  const applySv = useCallback((e: MouseEvent) => {
    if (!svBoxRef.current) return
    const r = svBoxRef.current.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))
    const next: [number, number, number] = [hsvRef.current[0], s, v]
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(...next)
    lastEmitted.current = hex
    onChange(hex)
  }, [onChange])

  const applyHue = useCallback((e: MouseEvent) => {
    if (!hueBoxRef.current) return
    const r = hueBoxRef.current.getBoundingClientRect()
    const h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360))
    const next: [number, number, number] = [h, hsvRef.current[1], hsvRef.current[2]]
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(...next)
    lastEmitted.current = hex
    onChange(hex)
  }, [onChange])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current === 'sv')  applySv(e)
      if (dragging.current === 'hue') applyHue(e)
    }
    const onUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [applySv, applyHue])

  const [h, s, v] = hsv

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* SV square */}
      <div
        ref={svBoxRef}
        onMouseDown={e => { e.preventDefault(); dragging.current = 'sv'; applySv(e.nativeEvent) }}
        style={{ width: '100%', height: 120, position: 'relative', borderRadius: 4, cursor: 'crosshair', userSelect: 'none', background: `hsl(${h}, 100%, 50%)` }}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'linear-gradient(to right, #fff, transparent)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'linear-gradient(to bottom, transparent, #000)' }} />
        <div style={{
          position: 'absolute', left: `${s * 100}%`, top: `${(1 - v) * 100}%`,
          width: 10, height: 10, borderRadius: '50%',
          border: '2px solid var(--text-white)', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
        }} />
      </div>
      {/* Hue slider */}
      <div
        ref={hueBoxRef}
        onMouseDown={e => { e.preventDefault(); dragging.current = 'hue'; applyHue(e.nativeEvent) }}
        style={{ width: '100%', height: 14, borderRadius: 4, cursor: 'crosshair', userSelect: 'none', position: 'relative', background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: `${(h / 360) * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14, borderRadius: '50%',
          background: `hsl(${h}, 100%, 50%)`,
          border: '2px solid var(--text-white)', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

// ─── Color Popover ────────────────────────────────────────────────────────────

function ColorPopover({ trackIndex, trackColor, anchor, onApplyColor, onClose }: {
  trackIndex: number
  trackColor: string
  anchor: DOMRect
  onApplyColor: (trackIndex: number, color: string, source: 'palette' | 'custom') => void
  onClose: () => void
}) {
  const [hexInput, setHexInput]   = useState(trackColor)
  const [hexError, setHexError]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ── Close on outside click ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // ── Close on Escape ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePaletteClick = (color: string) => {
    setHexInput(color)
    setHexError(false)
    onApplyColor(trackIndex, color, 'palette')
  }

  const handleHexChange = (value: string) => {
    setHexInput(value)
    if (HEX_RE.test(value)) {
      setHexError(false)
      onApplyColor(trackIndex, value, 'custom')
    } else {
      setHexError(true)
    }
  }

  // ── Position: below trigger, flip up near bottom edge ───────────────────────
  const POP_W = 240
  const POP_H = 330
  const left  = Math.min(Math.max(8, anchor.left), window.innerWidth - POP_W - 8)
  const top   = anchor.bottom + 6 + POP_H > window.innerHeight
    ? anchor.top - POP_H - 6
    : anchor.bottom + 6

  const previewColor = HEX_RE.test(hexInput) ? hexInput : trackColor

  return createPortal(
    <div
      ref={ref}
      data-no-drag
      className="theme-paper xp-pop"
      style={{ zIndex: 60000, left, top: Math.max(8, top), width: POP_W, padding: 10, gap: 8 }}
    >
      {/* ── Palette grid ──────────────────────────────────────────────────────── */}
      <div className="xp-swatches">
        {TRACK_COLOR_PALETTE.map(c => (
          <button key={c} aria-label={`Colour ${c}`} aria-pressed={c === trackColor} style={{ background: c }} onClick={() => handlePaletteClick(c)} />
        ))}
      </div>

      {/* ── Rainbow picker ────────────────────────────────────────────────────── */}
      <HsvPicker
        color={previewColor}
        onChange={hex => { setHexInput(hex); setHexError(false); onApplyColor(trackIndex, hex, 'custom') }}
      />

      {/* ── Hex input ─────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <div style={{ width: 22, height: 22, background: previewColor, borderRadius: 3, flexShrink: 0, border: '1px solid var(--border2)' }} />
          <input
            value={hexInput}
            onChange={e => handleHexChange(e.target.value)}
            placeholder="#rrggbb"
            spellCheck={false}
            style={{
              flex: 1, minWidth: 0, background: 'var(--bg-field)',
              border: `1px solid ${hexError ? 'var(--color-input-error)' : 'var(--ui-line)'}`,
              borderRadius: 3,
              color: hexError ? 'var(--color-input-error)' : 'var(--text-muted)',
              fontSize: 'var(--text-sm)', fontFamily: 'var(--font-code)',
              padding: '4px 6px', outline: 'none',
            }}
          />
        </div>
        {hexError && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-input-error)', marginTop: 3 }}>Enter a valid hex (#rrggbb)</div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ─── Track Row ────────────────────────────────────────────────────────────────

function TrackRow({ track, onToggleIncluded, onToggleMerge, onChangeProgram, onUnmerge, onSplit, onRename, onPickColor, onToggleVisible, onToggleKeyboard, showBottomBorder = true }: {
  track: EditorTrack
  onToggleIncluded: () => void
  onToggleMerge: () => void
  onChangeProgram: (p: number) => void
  onUnmerge?: () => void
  onSplit?: () => void
  onRename: (name: string) => void
  onPickColor: (trackIndex: number, anchorRect: DOMRect) => void
  onToggleVisible: () => void
  onToggleKeyboard: () => void
  // False when a hand-split info row or split preview follows this track —
  // that trailing element carries the border instead, so it groups visually
  // with ITS OWN track instead of reading as belonging to the next one.
  showBottomBorder?: boolean
}) {
  // ── Inline rename state ──────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [editValue, setEditValue]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Every control below except the Include toggle itself edits how the
  // track will be SAVED — none of that matters for a track that won't be
  // in the output at all, and leaving them clickable let you e.g. flip an
  // excluded track's piano-roll/keyboard flags with no visible effect,
  // confusing enough that the row's own dimmed 0.4 opacity wasn't reading
  // as "actually disabled." ──────────────────────────────────────────────
  const rowDisabled = !track.included

  const startEdit = () => { setEditValue(track.trackName); setEditingName(true) }
  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== track.trackName) onRename(trimmed)
    setEditingName(false)
  }
  const cancelEdit = () => setEditingName(false)

  useEffect(() => { if (editingName) inputRef.current?.select() }, [editingName])

  return (
    <div className="xp-pe-row" data-off={track.included ? undefined : ''} data-picked={track.mergeSelected || track.isMerged ? '' : undefined} style={{ borderBottom: showBottomBorder ? undefined : 'none' }}>
      {/* ── Keep ─────────────────────────────────────────────────────────────── */}
      <Tooltip title="Select track to keep it in the saved file, deselect to drop it" oneLine>
        <button className="xp-pe-keep" role="checkbox" aria-checked={track.included} aria-label={`Keep ${track.trackName}`} onClick={onToggleIncluded}>
          <span>{track.included && <Check size={15} strokeWidth={3} />}</span>
        </button>
      </Tooltip>

      {/* ── Colour ───────────────────────────────────────────────────────────── */}
      <Tooltip title="Open color picker" oneLine>
        <button className="xp-pe-swatch" aria-label={`Change colour of ${track.trackName}`} style={{ background: track.color }} disabled={rowDisabled} onClick={e => onPickColor(track.index, e.currentTarget.getBoundingClientRect())} />
      </Tooltip>

      {/* ── Track name + where it comes from ─────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        {editingName ? (
          <input
            ref={inputRef}
            className="xp-pe-rename"
            aria-label="Track name"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
            data-no-drag
          />
        ) : (
          <Tooltip title="Double-click to rename" oneLine wrapperStyle={{ display: 'block', minWidth: 0 }}>
            <span className="xp-pe-name" onDoubleClick={rowDisabled ? undefined : startEdit} style={{ cursor: rowDisabled ? 'default' : PENCIL_CURSOR }}>{track.trackName}</span>
          </Tooltip>
        )}
        <div className="xp-pe-sub">
          {track.isMerged ? (
            <span>Merged: {track.mergedFromNames?.join(' + ')}</span>
          ) : (
            <>
              <span>Channel {track.channel + 1}</span>
              {!track.isDrum && track.newProgram !== track.program && (
                <Tooltip title={`Back to the original assignment — ${track.gmName}.`} oneLine>
                  <button className="xp-pe-link" onClick={() => onChangeProgram(track.program)} disabled={rowDisabled}>
                    Reassigned <RotateCcw size={12} />
                  </button>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Instrument ───────────────────────────────────────────────────────── */}
      {track.isDrum ? (
        <Tooltip title="Not assignable — GM channel 10 is always drums." oneLine wrapperStyle={{ minWidth: 0 }}>
          <div className="xp-pe-inst" data-fixed><span>Standard Drums</span></div>
        </Tooltip>
      ) : (
        <InstrumentPicker program={track.newProgram} onChange={onChangeProgram} disabled={rowDisabled} />
      )}

      <span>{track.noteCount.toLocaleString()}</span>

      {/* ── In roll / on keys — persist into the file on save, unlike the
          TrackPanel's matching icons, which are session/playback-only. ────── */}
      <Tooltip title="Keep or remove track from showing on the piano roll in the saved file" oneLine wrapperStyle={{ justifySelf: 'start' }}>
        <button role="switch" className="o-switch" aria-checked={track.visible} aria-label={`Show ${track.trackName} in the piano roll`} onClick={onToggleVisible} disabled={rowDisabled}><span /></button>
      </Tooltip>
      <Tooltip title="Keep or remove track from showing on the keyboard in the saved file" oneLine wrapperStyle={{ justifySelf: 'start' }}>
        <button role="switch" className="o-switch" aria-checked={track.showOnKeyboard} aria-label={`Light ${track.trackName} on the keyboard`} onClick={onToggleKeyboard} disabled={rowDisabled}><span /></button>
      </Tooltip>

      {/* ── Merge / unmerge ──────────────────────────────────────────────────── */}
      {track.isMerged ? (
        <Tooltip title="Splits this merged group back into its separate original tracks." oneLine wrapperStyle={{ justifySelf: 'start' }}>
          <button className="xp-pe-mini" aria-label={`Unmerge ${track.trackName}`} onClick={onUnmerge} disabled={rowDisabled}><Undo2 size={15} /></button>
        </Tooltip>
      ) : track.splitHand ? (
        <Tooltip title="Freshly split tracks can't be merged again in the same session — save first." oneLine wrapperStyle={{ justifySelf: 'start' }}>
          <button className="xp-pe-mini" aria-label="Can't merge a freshly split track" disabled><Merge size={15} /></button>
        </Tooltip>
      ) : (
        <Tooltip title="Select two or more tracks to merge" oneLine wrapperStyle={{ justifySelf: 'start' }}>
          <button className="xp-pe-keep" data-merge role="checkbox" aria-checked={track.mergeSelected} aria-label={`Select ${track.trackName} to merge`} onClick={onToggleMerge} disabled={rowDisabled}>
            <span>{track.mergeSelected && <Merge size={14} />}</span>
          </button>
        </Tooltip>
      )}

      {/* ── Split — only for splittable tracks ───────────────────────────────── */}
      {onSplit && !track.isMerged ? (
        <Tooltip title="Split into Left/Right Hand tracks" oneLine wrapperStyle={{ justifySelf: 'start' }}>
          <button className="xp-pe-mini" aria-label={`Split ${track.trackName} into left and right hand`} onClick={onSplit} disabled={rowDisabled}><Split size={15} /></button>
        </Tooltip>
      ) : <div />}
    </div>
  )
}

// One line per note across the song, left hand under right, low-confidence
// passages shaded, with its legend.
function HandTimeline({ notes, passages, duration, flagged }: {
  notes: ParsedNote[]; passages: { start: number; end: number }[]; duration: number; flagged: boolean
}) {
  return (
    <>
      {duration > 0 && notes.length > 0 && (
        <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
          {passages.map((p, i) => (
            <rect key={`p${i}`} x={(p.start / duration) * 1000} y={0} width={Math.max(2, ((p.end - p.start) / duration) * 1000)} height={40} fill="var(--status-low-confidence)" opacity={0.28} />
          ))}
          {notes.map((n, i) => (
            <rect key={i} x={(n.time / duration) * 1000} y={n.hand === 'L' ? 21 : 2} width={1.4} height={17} fill={n.hand === 'L' ? 'var(--hand-lh)' : n.hand === 'R' ? 'var(--hand-rh)' : 'var(--hand-note-neutral)'} />
          ))}
        </svg>
      )}
      <div className="xp-pe-legend">
        <span><i style={{ background: 'var(--hand-lh)' }} />Left hand</span>
        <span><i style={{ background: 'var(--hand-rh)' }} />Right hand</span>
        {flagged && <span><i style={{ background: 'var(--status-low-confidence)', opacity: 0.6 }} />Low-confidence passage</span>}
      </div>
    </>
  )
}

const HAND_DISCLAIMER = 'Hand assignment is automated — a guideline, not a verified transcription. Use your ear, especially on flagged passages.'

// ─── Main ─────────────────────────────────────────────────────────────────────

let _mergeIdCounter = 1000

export default function MidiEditor() {
  // ── Store reads ──────────────────────────────────────────────────────────────
  const midi             = useStore((s) => s.midi)
  // ── Display-relevant signature, not the live `tracks` array — same root
  // cause as TrackPanel.tsx/ChannelStrip.tsx/etc: every fader/pan/chorus/
  // reverb drag replaces the whole array, but buildRows() below only reads
  // name/gmName/trackName/program/group/isDrum/color/colorSource/muted/
  // visible/showOnKeyboard, none of which those drags touch. ───────────────
  const trackSignature = useStore((s) => s.tracks.map((t) =>
    `${t.index}:${t.name}:${t.gmName}:${t.trackName ?? ''}:${t.program}:${t.group ?? ''}:${t.isDrum}:${t.color}:${t.colorSource ?? ''}:${t.muted}:${t.visible}:${t.showOnKeyboard}`
  ).join('|'))
  const tracks           = useMemo(() => useStore.getState().tracks, [trackSignature])
  const showHandLabels   = useStore((s) => s.showHandLabels)
  const midiEditorOpen   = useStore((s) => s.midiEditorOpen)
  const setMidiEditorOpen = useStore((s) => s.setMidiEditorOpen)
  const saveTempoKeyChangesEnabled = useStore((s) => s.saveTempoKeyChangesEnabled)
  const noteEditorEnabled = useStore((s) => s.noteEditorEnabled)

  // ── Editor state ─────────────────────────────────────────────────────────────
  const [state, setState] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string; filePath?: string } | null>(null)
  const [splitResult, setSplitResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pendingSplitIndex, setPendingSplitIndex] = useState<number | null>(null)
  // ── Which tracks' hand-split info row is expanded to show the preview
  // graphic — collapsed by default, per-track, info only (no actions). ──────
  const [expandedInfoRows, setExpandedInfoRows] = useState<Set<number>>(new Set())
  // ── One-slot undo for a STAGED split only — snapshots state.rows immediately
  // before staging replaces one row with two. Nothing has hit disk yet at that
  // point, so undoing is a pure local revert, not a file reload. Once Save &
  // Reload actually commits, the session is done — no post-save "undo the
  // file" affordance (see performSave). ─────────────────────────────────────
  const [preSplitRows, setPreSplitRows] = useState<EditorTrack[] | null>(null)
  // ── Snapshot of each row's color/name/roll/keyboard as of the last time
  // rows were freshly loaded (open, or post-save resync) — buildSaveSummary
  // diffs against this to report only what actually changed this session.
  const originalRowsRef = useRef<Map<number, { color: string; colorSource: EditorTrack['colorSource']; trackName: string; visible: boolean; showOnKeyboard: boolean; program: number }>>(new Map())
  const snapshotRows = (rows: EditorTrack[]) => {
    originalRowsRef.current = new Map(rows.map(r => [r.index, { color: r.color, colorSource: r.colorSource, trackName: r.trackName, visible: r.visible, showOnKeyboard: r.showOnKeyboard, program: r.program }]))
  }
  // ── Cancel — handleApplyColor writes color straight into the live store (so
  // TrackPanel/Keyboard/PianoRoll preview it immediately while the editor is
  // open), unlike every other edit here which stays staged in `state.rows`
  // until Save & Reload. That means closing without saving must explicitly
  // revert any track whose store color drifted from the open-time snapshot —
  // otherwise Cancel silently keeps a color pick it never should have. ──────
  const handleCancel = useCallback(() => {
    originalRowsRef.current.forEach((orig, index) => {
      const track = useStore.getState().tracks.find(t => t.index === index)
      if (track && track.color !== orig.color) {
        useStore.getState().updateTrack(index, { color: orig.color, colorSource: orig.colorSource })
      }
    })
    setMidiEditorOpen(false)
  }, [])
  // ── Z-index — bringToFront on mousedown so last-clicked modal is on top ────
  const [zIndex, setZIndex] = useState(MODAL_BASE_Z)

  // ── Drag state ───────────────────────────────────────────────────────────────
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const panelRef  = useRef<HTMLDivElement>(null)
  const positioned = useRef(false)
  useClampPositionOnZoom(pos, setPos, panelRef)
  // ── Mounted only while midiEditorOpen && state (see `if (!midiEditorOpen
  // || !state) return null` below) — always active while this exists. ──────
  useFocusTrap(panelRef, true)

  // ── Build rows from store state ───────────────────────────────────────────────
  const buildRows = useCallback((): EditorTrack[] => {
    if (!midi) return []
    return tracks.map(t => {
      // Parsed (already note-filtered, compacted) track — same index scheme as `t.index`,
      // unlike `_rawMidiTracks` (unfiltered raw array) which landed on the wrong track
      // whenever an earlier raw track had 0 notes, showing a bogus "0 notes" badge.
      const parsedTrack = (midi as any).tracks?.[t.index]
      return {
        index: t.index, name: t.name, gmName: t.gmName, trackName: t.trackName, program: t.program,
        group: t.group ?? '', isDrum: t.isDrum, color: t.color, colorSource: t.colorSource ?? 'default',
        channel: parsedTrack?.channel ?? t.index,
        noteCount: parsedTrack?.notes?.length ?? 0,
        included: !t.muted, mergeSelected: false, newProgram: t.program,
        visible: t.visible, showOnKeyboard: t.showOnKeyboard,
      }
    }).sort((a, b) => {
      const aK = KEYBOARD_GROUPS.has(a.group), bK = KEYBOARD_GROUPS.has(b.group)
      if (aK !== bK) return aK ? -1 : 1
      if (a.isDrum !== b.isDrum) return a.isDrum ? 1 : -1
      if (a.name === 'Left Hand' && b.name === 'Right Hand') return -1
      if (a.name === 'Right Hand' && b.name === 'Left Hand') return 1
      return 0
    })
  }, [midi, tracks])

  // ── Re-initialise state whenever the editor opens ─────────────────────────────
  useEffect(() => {
    if (!midiEditorOpen || !midi) return
    const filePath = (midi as any)._filePath ?? ''
    const rows = buildRows()
    snapshotRows(rows)
    setState({ fileName: midi.fileName, filePath, rows, outputPath: orfeoName(filePath) })
    setSaveResult(null)
    setSplitResult(null)
    setPendingSplitIndex(null)
    setPreSplitRows(null)

    // Centre the modal on first open — horizontally centered on the whole
    // screen (not the piano roll — explicit correction), fixed 120px down
    // from the top of the app window. Clamped so it can never render
    // partially off-screen regardless of window size.
    if (!positioned.current) {
      positioned.current = true
      setPos(clampModalPos({ x: Math.round((window.innerWidth - modalW()) / 2), y: 44 }, modalW(), MODAL_H, window.innerWidth, window.innerHeight))
    }
  }, [midiEditorOpen])

  // ── Keep editor state in sync after a split/save reload while the editor
  // stays open — reloadFile() only updates the global midi/tracks store; it
  // never touched this modal's own `state`, which otherwise stayed pointed at
  // the ORIGINAL file path. That's the real bug: every subsequent IPC call
  // (Save, another Split) reads `state.filePath`, so without this, clicking
  // Save after a Split re-reads the pre-split file from disk and silently
  // discards the split — it looks like "reload loads the original file"
  // because it literally does. Deliberately does not touch saveResult/
  // splitResult so the just-set result banner survives this resync.
  useEffect(() => {
    if (!midiEditorOpen || !midi) return
    const filePath = (midi as any)._filePath ?? ''
    const freshRows = buildRows()
    snapshotRows(freshRows)
    setState(s => s ? { ...s, rows: freshRows, filePath, fileName: midi.fileName, outputPath: orfeoName(filePath) } : s)
    // keyed on the file's bytes: a Tap Tempo grid swap (same file, new midi
    // object) must not discard unsaved row edits
  }, [(midi as any)?._raw])

  // ── Drag: mousemove / mouseup ─────────────────────────────────────────────────
  const startMove = (e: React.PointerEvent) => startModalDrag(e, panelRef.current, pos, setPos)


  // ── Reload file after save/split ─────────────────────────────────────────────
  const reloadFile = useCallback((base64: string, fileName: string, filePath: string, timeScale = 1) => {
    const binary = atob(base64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const parsed = parseMidiBuffer(bytes.buffer, fileName, filePath)
    // Carry the song's tap-tempo correction over to the saved version
    // (timeScale = 1/bpmRatio when a speed change was baked in)
    const s = useStore.getState()
    const moved = carryCorrection(s.tempoCorrections, s.songKey, songKey(bytes.buffer), timeScale)
    if (moved) useStore.setState({ tempoCorrections: moved })
    useStore.getState().setMidi(parsed)
    const raw = parsed as any
    if (raw._keySignature) {
      useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
    } else {
      useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
    }
  }, [])

  // ── Color popover state ──────────────────────────────────────────────────────
  const [colorPopover, setColorPopover] = useState<{ trackIndex: number; trackColor: string; anchor: DOMRect } | null>(null)

  const openColorPopover = useCallback((trackIndex: number, anchor: DOMRect) => {
    const track = useStore.getState().tracks.find(t => t.index === trackIndex)
    // '#e8a027' fallback must stay a literal hex string, not var(--text-amber) — it seeds
    // ColorPopover's hexInput text state (HEX_RE-tested, rendered into a text <input>), so a
    // CSS var reference would leak as literal text "var(--text-amber)" in the input box.
    setColorPopover({ trackIndex, trackColor: track?.color ?? '#e8a027', anchor })
  }, [])

  const handleApplyColor = useCallback((trackIndex: number, color: string, source: 'palette' | 'custom') => {
    useStore.getState().updateTrack(trackIndex, { color, colorSource: source })
    setState(s => s ? { ...s, rows: s.rows.map(r => r.index === trackIndex ? { ...r, color } : r) } : s)
    setColorPopover(prev => prev && prev.trackIndex === trackIndex ? { ...prev, trackColor: color } : prev)
  }, [])

  // ── Header filename marquee — centered by default; marquee-scrolls left on
  // hover only when the filename is too long to fit its available space (same
  // measured-overflow pattern as Console Mixer's header description). ────────
  const fileNameWrapRef = useRef<HTMLDivElement>(null)
  const fileNameRef     = useRef<HTMLSpanElement>(null)
  const [fileNameOverflow, setFileNameOverflow] = useState(0)
  useEffect(() => {
    const wrap = fileNameWrapRef.current, text = fileNameRef.current
    if (!wrap || !text) return
    const measure = () => setFileNameOverflow(Math.max(0, text.scrollWidth - wrap.clientWidth))
    measure()
    // Self-hosted fonts load async — an initial measure can under-report width
    // against fallback-font metrics before JetBrains Mono swaps in.
    document.fonts?.ready?.then(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(text)
    return () => ro.disconnect()
  }, [state?.fileName])

  // ── Not open and never initialised → nothing to render ───────────────────────
  if (!midiEditorOpen || !state) return null

  // ── Editor operations ─────────────────────────────────────────────────────────

  const update = (index: number, patch: Partial<EditorTrack>) =>
    setState(s => s && ({ ...s, rows: s.rows.map(t => t.index === index ? { ...t, ...patch } : t) }))

  const handleMerge = () => {
    setState(s => {
      if (!s) return s
      const selected = s.rows.filter(t => t.mergeSelected && !t.isMerged && !t.splitHand)
      if (selected.length < 2) return s
      const first = selected[0]
      const totalNotes = selected.reduce((sum, t) => sum + t.noteCount, 0)
      const mergedRow: EditorTrack = {
        index: _mergeIdCounter++,
        name: selected.map(t => t.name).join(' + '),
        gmName: first.gmName, trackName: first.trackName, program: first.program,
        group: first.group, isDrum: first.isDrum, color: first.color, colorSource: first.colorSource, channel: first.channel,
        noteCount: totalNotes, included: true, mergeSelected: false, newProgram: first.newProgram,
        visible: first.visible, showOnKeyboard: first.showOnKeyboard,
        isMerged: true, mergedFromIndices: selected.map(t => t.index), mergedFromNames: selected.map(t => t.name),
      }
      const firstIdx = s.rows.findIndex(r => r.index === first.index)
      const without  = s.rows.filter(r => !selected.some(sel => sel.index === r.index))
      const newRows  = [...without.slice(0, firstIdx), mergedRow, ...without.slice(firstIdx)]
      return { ...s, rows: newRows, outputPath: orfeoName(s.filePath) }
    })
  }

  // ── Unmerge: reset rows from current store state (no IPC needed) ──────────────
  const handleUnmerge = () => {
    const rows = buildRows()
    setState(s => s ? { ...s, rows, outputPath: orfeoName(s.filePath) } : s)
  }

  const mergeCount    = state.rows.filter(t => t.mergeSelected && !t.isMerged).length
  const includedCount = state.rows.filter(t => t.included).length

  const buildMergeGroups = (): MergeGroup[] =>
    state.rows.filter(r => r.isMerged && r.mergedFromIndices).map(r => r.mergedFromIndices!)

  // ── Human summary of this save, for the File info change log — counts
  // only, not a full per-field diff (renames/colors/roll-keyboard toggles
  // aren't individually tracked here; the counts below are what's cheap and
  // honest to report from staged row state alone). ───────────────────────
  const buildSaveSummary = (): string => {
    const excludedCount = state.rows.filter(r => !r.included).length
    const mergedGroups = state.rows.filter(r => r.isMerged && r.mergedFromIndices)
    const mergedTrackCount = mergedGroups.reduce((sum, r) => sum + (r.mergedFromIndices?.length ?? 0), 0)
    const splitOrigins = new Set(state.rows.filter(r => r.splitHand).map(r => r.splitOriginIndex))

    // ── Color/rename/roll/keyboard changes — diffed against originalRowsRef,
    // the snapshot taken the last time rows were freshly loaded (editor open
    // or the post-save resync). Skips split/merged rows: those are already
    // covered by the split/merge phrases above, and a split row's fixed
    // hand color would otherwise ALWAYS read as "changed color" vs. the
    // pre-split single track it came from. ──────────────────────────────────
    let colorChanged = 0, renamed = 0, rollChanged = 0, keyboardChanged = 0, reassigned = 0
    for (const r of state.rows) {
      if (r.isMerged || r.splitHand) continue
      const orig = originalRowsRef.current.get(r.index)
      if (!orig) continue
      if (r.color !== orig.color) colorChanged++
      if (r.trackName !== orig.trackName) renamed++
      if (r.visible !== orig.visible) rollChanged++
      if (r.showOnKeyboard !== orig.showOnKeyboard) keyboardChanged++
      if (r.newProgram !== orig.program) reassigned++
    }

    const s = (n: number) => n === 1 ? '' : 's'
    const parts: string[] = []
    if (splitOrigins.size > 0) parts.push(`split ${splitOrigins.size} track${s(splitOrigins.size)}`)
    if (mergedGroups.length > 0) parts.push(`merged ${mergedTrackCount} tracks into ${mergedGroups.length}`)
    if (excludedCount > 0) parts.push(`excluded ${excludedCount} track${s(excludedCount)}`)
    if (reassigned > 0) parts.push(`reassigned instrument on ${reassigned} track${s(reassigned)}`)
    if (colorChanged > 0) parts.push(`changed color of ${colorChanged} track${s(colorChanged)}`)
    if (renamed > 0) parts.push(`renamed ${renamed} track${s(renamed)}`)
    if (rollChanged > 0) parts.push(`changed roll visibility of ${rollChanged} track${s(rollChanged)}`)
    if (keyboardChanged > 0) parts.push(`changed keyboard lighting of ${keyboardChanged} track${s(keyboardChanged)}`)
    return parts.join(', ') // '' when nothing changed — caller decides the "Saved" fallback
  }

  // ── Save — the ONLY point that writes to disk. Every staged edit (include/
  // exclude, merge, split, rename, recolor, reassign instrument) travels in
  // one payload and lands in exactly one _ORFEO_vN. Once a save SUCCEEDS the
  // footer switches to a single OK button (see render below) — Cancel and
  // Save & Reload disappear so a second click here can't silently mint v2,
  // v3, ad infinitum. A failed save leaves Cancel/Save & Reload in place so
  // the user can fix the problem and retry. ──────────────────────────────────
  const performSave = async () => {
    if (includedCount === 0) { setSaveResult({ ok: false, msg: 'Select at least one track.' }); return }

    // ── Warn before an unchecked track actually disappears from the saved
    // file — easy to reach unnoticed now that a muted/hidden track from the
    // Tracks panel already lands here unchecked automatically. Cancel is the
    // last button (safe default on Escape/backdrop click, matching every
    // other confirm dialog in the app). ─────────────────────────────────────
    const excludedRows = state.rows.filter(r => !r.included)
    if (excludedRows.length > 0) {
      const choice = await confirmDialog({
        title: 'Delete tracks?',
        message: `You're about to delete ${excludedRows.length} track${excludedRows.length === 1 ? '' : 's'} in the saved version.`,
        detail: excludedRows.map(r => r.trackName).join(', '),
        buttons: ['Delete & Save', 'Cancel'],
        destructiveIndex: 0,
      })
      if (choice !== 0) return
    }

    setSaving(true); setSaveResult(null)
    try {
      const includedTracks: { index: number; newProgram: number; name?: string; color?: string; splitHand?: 'L' | 'R'; visible?: boolean; showOnKeyboard?: boolean }[] = []
      for (const row of state.rows.filter(r => r.included)) {
        if (row.isMerged && row.mergedFromIndices) {
          row.mergedFromIndices.forEach((origIdx, i) => {
            includedTracks.push({
              index: origIdx, newProgram: row.newProgram,
              ...(i === 0 ? { name: row.trackName, color: row.color, visible: row.visible, showOnKeyboard: row.showOnKeyboard } : {}),
            })
          })
        } else if (row.splitHand) {
          includedTracks.push({ index: row.splitOriginIndex!, newProgram: row.newProgram, name: row.trackName, color: row.color, splitHand: row.splitHand, visible: row.visible, showOnKeyboard: row.showOnKeyboard })
        } else {
          includedTracks.push({ index: row.index, newProgram: row.newProgram, name: row.trackName, color: row.color, visible: row.visible, showOnKeyboard: row.showOnKeyboard })
        }
      }
      const mergeGroups = buildMergeGroups()
      const finalOutput = state.outputPath

      // ── Tempo/Key fold-in — only when the toggle above is on and BPM/
      // transpose are actually dirty; same math as the standalone
      // tempoKey:save path (see tempoKeySave.ts's computeTempoKeyPayload),
      // baked into this one write instead of a second save. ───────────────
      const tempoKeyPayload = useStore.getState().saveTempoKeyChangesEnabled ? computeTempoKeyPayload() : null
      const saveSummary = [buildSaveSummary(), tempoKeyPayload?.summary].filter(Boolean).join(', ') || 'Saved'

      const { rhMaxFingers, lhMaxFingers } = useStore.getState()
      const result = await window.electronAPI.saveMidiEditor({
        filePath: state.filePath, outputPath: finalOutput, includedTracks, mergeGroups,
        rhMaxFingers, lhMaxFingers,
        bpmRatio: tempoKeyPayload?.bpmRatio, transposeSemitones: tempoKeyPayload?.transposeSemitones, finalKey: tempoKeyPayload?.finalKey,
      })
      setSaveResult({ ok: result.ok, msg: result.message, filePath: result.filePath })
      if (result.ok && result.base64 && result.fileName && result.filePath) {
        setPendingSplitIndex(null)
        setPreSplitRows(null)
        reloadFile(result.base64, result.fileName, result.filePath, 1 / (tempoKeyPayload?.bpmRatio ?? 1))
        useStore.getState().notifyLibrarySaved(result.filePath)
        window.electronAPI.logFileEvent(result.filePath, 'save', saveSummary)
      }
    } catch (e: any) {
      setSaveResult({ ok: false, msg: e?.message ?? 'Save failed' })
    }
    setSaving(false)
  }

  const handleSave = () => performSave()

  // ── Open a track in the Note Editor, solo'd/editable — the split-info
  // row's "fine-tune it yourself" action. Prompts to save first if this
  // session has staged changes (same Save/Discard/Cancel pattern as
  // MixerConsole's requestClose), since opening the Note Editor closes this
  // panel and any staged-but-unsaved edits would otherwise be silently lost.
  // Plain function, not useCallback — it doesn't need referential stability
  // anywhere, and memoizing it was the actual bug: as a `useCallback(..., [])`
  // declared before the early return above, React froze it to the FIRST
  // render's closure — this component's first render has `state === null`
  // (populated by an effect after mount), which hit that early return before
  // ever reaching buildSaveSummary/performSave's declarations below, so the
  // frozen closure referenced them from a call frame that never initialized
  // them — "Cannot access 'buildSaveSummary' before initialization" on every
  // click, permanently, regardless of later renders. A plain function
  // declared here (after both, and after the early return) is recreated
  // fresh every render, so it always closes over already-initialized
  // bindings. ─────────────────────────────────────────────────────────────
  const handleOpenInNoteEditor = async (trackIndex: number) => {
    const summary = buildSaveSummary()
    if (summary) {
      const choice = await confirmDialog({
        title: 'Save changes before editing?',
        message: `This session ${summary}. Save before opening the Note Editor?`,
        buttons: ['Save', 'Discard', 'Cancel'],
      })
      if (choice === 2) return // Cancel — stay in Playback Editor
      if (choice === 0) {
        await performSave()
      } else {
        // Discard — same color-drift revert as handleCancel above
        originalRowsRef.current.forEach((orig, index) => {
          const track = useStore.getState().tracks.find(t => t.index === index)
          if (track && track.color !== orig.color) {
            useStore.getState().updateTrack(index, { color: orig.color, colorSource: orig.colorSource })
          }
        })
      }
    }
    useStore.getState().soloTrackForEdit(trackIndex)
    // This icon only ever appears on a hand-split-eligible keyboard track
    // (see splitEligible below), so opening from here should land the
    // editor ready to correct hand tags immediately — not require a
    // separate manual click on the toolbar's Hand icon first. Guarded on
    // HAND_ASSIGN_GROUPS (not the broader KEYBOARD_GROUPS splitEligible
    // uses) since reassign mode itself only ever targets piano/organ.
    const row = state.rows.find(r => r.index === trackIndex)
    if (row && HAND_ASSIGN_GROUPS.has(row.group) && !row.isDrum) {
      NES.reassignHandsMode = true
      NES.onReassignHandsModeChange?.()
    }
    useStore.getState().setNoteEditorActive(true)
    setMidiEditorOpen(false)
  }

  // ── Split — two-step: first click arms the preview, second STAGES the split
  // locally (no disk write, no IPC). The source row is replaced with two new
  // rows carrying the already-known hand tags from the loaded file's notes —
  // same source the preview panel already reads for its stats. The actual
  // note-splitting happens once, inside Save & Reload's single write. ────────
  const handleSplitRequest = (trackIndex: number) => {
    setPendingSplitIndex(trackIndex)
    setSplitResult(null)
  }

  // ── Undo a STAGED split — restores state.rows from right before staging.
  // Belongs here, not after a save: once Save & Reload actually commits,
  // there's nothing left in this modal to undo (see performSave). ──────────
  const handleUndoSplit = () => {
    if (!preSplitRows) return
    setState(s => s ? { ...s, rows: preSplitRows } : s)
    setPreSplitRows(null)
    setSplitResult(null)
  }

  const handleSplitConfirm = () => {
    if (pendingSplitIndex === null) return
    const trackIndex = pendingSplitIndex
    const parsedTrack = midi?.tracks.find(t => t.index === trackIndex)
    const notes = parsedTrack?.notes ?? []
    const lhCount = notes.filter(n => n.hand === 'L').length
    const rhCount = notes.filter(n => n.hand === 'R').length
    setPendingSplitIndex(null)
    if (lhCount === 0 || rhCount === 0) {
      setSplitResult({ ok: false, msg: 'Could not find two independent hands in this track' })
      return
    }
    setPreSplitRows(state.rows)
    setState(s => {
      if (!s) return s
      const idx = s.rows.findIndex(r => r.index === trackIndex)
      if (idx === -1) return s
      const orig = s.rows[idx]
      // ── "Piano" fallback matches the pre-refactor server-side split: a
      // trackName that's still the default GM name means the file never had
      // a real track-name meta event, so prefix with "Piano" instead of the
      // full GM instrument name ("Acoustic Grand Piano LH" reads worse). A
      // genuinely custom name is kept as-is. ─────────────────────────────
      const baseLabel = orig.trackName && orig.trackName !== orig.gmName ? orig.trackName : 'Piano'
      const lhName = withHandSuffix(baseLabel, 'L')
      const rhName = withHandSuffix(baseLabel, 'R')
      // ── Fixed LH/RH colors (same tokens as the piano roll/keyboard split
      // rendering, src/utils/handColors.ts) — not inherited from the source
      // track, which would make both halves look identical. ───────────────
      // The user's hand colours as literal hex (not the CSS var): the colour
      // travels into ORFEO_TRACK_COLOR meta on save, which only accepts hex
      // (see midiParser.ts's restore regex)
      const lhRow: EditorTrack = { ...orig, name: 'Left Hand', trackName: lhName, noteCount: lhCount, splitHand: 'L', splitOriginIndex: trackIndex, mergeSelected: false, color: handHex().lh, colorSource: 'custom' }
      const rhRow: EditorTrack = { ...orig, index: _mergeIdCounter++, name: 'Right Hand', trackName: rhName, noteCount: rhCount, splitHand: 'R', splitOriginIndex: trackIndex, mergeSelected: false, color: handHex().rh, colorSource: 'custom' }
      const rows = [...s.rows]
      rows.splice(idx, 1, lhRow, rhRow)
      return { ...s, rows, outputPath: orfeoName(s.filePath) }
    })
    setSplitResult({ ok: true, msg: 'Staged — apply with Save & Reload' })
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const handStatsText = (stats: ReturnType<typeof getHandPreviewStats>) => (
    `${stats.taggedNotes} notes tagged — ${stats.leftCount} left, ${stats.rightCount} right by hand. ` + (stats.confidenceUnknown
      ? 'Tags restored from a prior split — confidence not re-evaluated.'
      : stats.lowConfidenceCount > 0
        ? `${Math.round(stats.lowConfidenceRatio * 100)}% fall in a low-confidence passage — check those first.`
        : 'No passages flagged — split looks reliable.')
  )

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="xp-pe-title"
      className="orfeo-modal-glow app-no-drag theme-paper xp-window xp-pe"
      onMouseDown={() => setZIndex(bringToFront())}
      style={{ left: pos.x, top: pos.y, zIndex, '--_modal-shadow': 'none' } as CSSProperties}
    >
      {/* ── Draggable header — title, the file being edited, close ───────────── */}
      <div className="xp-pe-head" onPointerDown={startMove}>
        <div className="xp-pe-title">
          <h2 id="xp-pe-title" className="o-title-lg">MIDI Playback Editor</h2>
          <div ref={fileNameWrapRef} className="orfeo-marquee-track" style={{ minWidth: 0, overflow: 'hidden', display: 'flex' }}>
            <span
              ref={fileNameRef}
              className={fileNameOverflow > 0 ? 'orfeo-marquee-text is-overflowing' : 'orfeo-marquee-text'}
              style={{
                fontSize: 'var(--text-sm)', color: 'var(--ui-text-soft)', whiteSpace: 'nowrap',
                ...(fileNameOverflow > 0 ? { '--marquee-distance': `-${fileNameOverflow}px` } as CSSProperties : {}),
              }}
            >
              {state.fileName}
            </span>
          </div>
        </div>
        <button className="o-close" data-no-drag="true" aria-label="Close" onClick={handleCancel}><X size={18} /></button>
      </div>

      {/* ── Select all / Clear all / count / Save Tempo & Key / Merge ────────── */}
      <div className="xp-pe-bar">
        <button className="o-btn" onClick={() => setState(s => s && ({ ...s, rows: s.rows.map(t => ({ ...t, included: true })) }))}>Select all</button>
        <button className="o-btn" onClick={() => setState(s => s && ({ ...s, rows: s.rows.map(t => ({ ...t, included: false })) }))}>Clear all</button>
        <span className="xp-note">{includedCount} of {state.rows.length} tracks kept</span>
        <div className="o-spacer" />
        {/* ── Save Tempo & Key changes — off by default; when on, folds the
            session's BPM/transpose changes into this same Save & Reload
            write instead of needing a separate save (see performSave). ──── */}
        <Tooltip title="Folds the session's tempo/key changes into the next Save & Reload" oneLine>
          <span className="xp-note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Save tempo &amp; key changes
            <button role="switch" className="o-switch" aria-checked={saveTempoKeyChangesEnabled} aria-label="Save tempo and key changes" onClick={() => useStore.getState().setSaveTempoKeyChangesEnabled(!saveTempoKeyChangesEnabled)}><span /></button>
          </span>
        </Tooltip>
        <Tooltip title="Combines selected tracks into one — all their notes play together on the keyboard." oneLine>
          <button className="o-btn" disabled={mergeCount < 2} onClick={handleMerge}><Merge size={16} /> Merge selected{mergeCount >= 2 ? ` (${mergeCount})` : ''}</button>
        </Tooltip>
      </div>

      <div className="xp-pe-table">
        {/* ── Column headers ───────────────────────────────────────────────────── */}
        <div className="xp-pe-cols">
          {[
            { label: 'Keep', title: 'Include or exclude track in saved file' },
            { label: 'Colour', title: 'Change the track color in the piano roll and on the keyboard' },
            { label: 'Track', title: 'Track name — double-click to rename' },
            { label: 'Instrument', title: "Reassign track's MIDI instrument" },
            { label: 'Notes', title: 'How many notes the track has' },
            { label: 'In roll', title: 'Show or hide this track in the piano roll — saves with the file' },
            { label: 'On keys', title: "Light this track's notes on the keyboard — saves with the file" },
            { label: 'Merge', title: 'Select two or more tracks to merge them into one unified track' },
            { label: 'Split', title: 'Split a keyboard track into separate Left Hand / Right Hand tracks' },
          ].map(h => (
            <Tooltip key={h.label} title={h.label} description={h.title} wrapperStyle={{ justifySelf: 'start' }}>
              <span style={{ cursor: 'default' }}>{h.label}</span>
            </Tooltip>
          ))}
        </div>

        {/* ── Track list — scrollable; the stable gutter keeps its columns under
            the headers above whether or not it scrolls ─────────────────────── */}
        <div className="xp-pe-list amber-scroll">
          {state.rows.map(track => {
          // ── Always-on hand-split info strip — separate from the click-
          // triggered preview below (pendingSplitIndex), which has real
          // Split/Cancel actions. This one is pure passive info: shown for
          // every qualifying track all the time, no button required, pointing
          // at the Note Editor as the way to make it exactly right. Same
          // eligibility as the Split button itself — a single mixed-hand
          // keyboard track, not already a split half. ─────────────────────────
          const splitEligible = !track.isMerged && !track.splitHand && KEYBOARD_GROUPS.has(track.group) && track.name !== 'Left Hand' && track.name !== 'Right Hand'
          const infoNotes = splitEligible && pendingSplitIndex !== track.index
            ? midi?.tracks.find(t => t.index === track.index)?.notes ?? []
            : []
          const infoStats = infoNotes.length > 0 ? getHandPreviewStats(infoNotes) : null
          return (
          <div key={track.index}>
            <TrackRow track={track}
              onToggleIncluded={() => update(track.index, { included: !track.included })}
              onToggleMerge={() => update(track.index, { mergeSelected: !track.mergeSelected })}
              onChangeProgram={p => {
                const newGroup = getGMGroup(p, track.isDrum)
                // Auto-follow the reassigned instrument's color/group too — but only when
                // the track never had a custom color (colorSource 'default'), otherwise a
                // picked instrument would clobber a color the user deliberately chose.
                // Piano-family slot is based on file order among OTHER keyboard-group
                // tracks — same rule midiParser.ts uses on initial load — so reassigning
                // a track into the piano family lands it on the same deterministic
                // blue/pink/amber slot it would get on a fresh reimport.
                const colorPatch = track.colorSource === 'default'
                  ? (KEYBOARD_GROUPS.has(newGroup)
                      ? { color: pianoFamilyColor(state.rows.filter(r => r.index < track.index && KEYBOARD_GROUPS.has(r.group)).length) }
                      : { color: distinctTrackColor(state.rows.filter(r => r.index !== track.index).map(r => r.color)) })
                  : {}
                update(track.index, {
                  newProgram: p,
                  group: newGroup,
                  // Auto-follow the reassigned instrument's GM name — but only when
                  // the track's name is still its own auto-generated GM name (never
                  // been custom-renamed), otherwise a picked instrument leaves the
                  // display saying e.g. "Nylon Guitar" for what's now a piano.
                  ...(track.trackName === track.gmName ? { trackName: getGMName(p), gmName: getGMName(p) } : {}),
                  ...colorPatch,
                })
              }}
              onUnmerge={track.isMerged ? () => handleUnmerge() : undefined}
              onToggleVisible={() => update(track.index, { visible: !track.visible })}
              onToggleKeyboard={() => update(track.index, { showOnKeyboard: !track.showOnKeyboard })}
              onSplit={!track.isMerged && !track.splitHand && KEYBOARD_GROUPS.has(track.group) && track.name !== 'Left Hand' && track.name !== 'Right Hand' ? () => handleSplitRequest(track.index) : undefined}
              onRename={newName => {
                update(track.index, { trackName: newName })
                useStore.getState().updateTrack(track.index, { trackName: newName })
              }}
              onPickColor={openColorPopover}
              showBottomBorder={!(infoStats && infoStats.taggedNotes > 0) && pendingSplitIndex !== track.index}
            />
            {infoStats && infoStats.taggedNotes > 0 && (() => {
              const expanded = expandedInfoRows.has(track.index)
              return (
                <>
                  {/* ── Toggle line — carries the row's bottom border when collapsed,
                      so it groups with ITS track, not the next one. ── */}
                  <div className="xp-pe-info" data-open={expanded ? '' : undefined}>
                    <Tooltip title="Hand-split timeline preview" oneLine>
                      <button className="xp-pe-link" aria-expanded={expanded} aria-label="Hand-split timeline preview" onClick={() => setExpandedInfoRows(prev => {
                        const next = new Set(prev)
                        if (next.has(track.index)) next.delete(track.index); else next.add(track.index)
                        return next
                      })}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </Tooltip>
                    <span>
                      {infoStats.confidenceUnknown ? (
                        'Hand split shown is automatic.'
                      ) : infoStats.lowConfidenceCount > 0 ? (
                        <>{Math.round(infoStats.lowConfidenceRatio * 100)}% flagged low-confidence — for a perfectly accurate split, edit in Note Editor</>
                      ) : (
                        'Hand split looks accurate — edit in Note Editor to fine-tune'
                      )}
                    </span>
                    <Tooltip
                      title={noteEditorEnabled ? 'Open in Note Editor' : 'Note Editor disabled'}
                      description={noteEditorEnabled ? "Opens this track in the Note Editor, solo'd and editable." : 'Turn on MIDI Note Editor in Settings'}
                    >
                      <button className="xp-pe-link" disabled={!noteEditorEnabled} onClick={() => { if (noteEditorEnabled) handleOpenInNoteEditor(track.index) }}>
                        <AudioLines size={14} /> Note Editor
                      </button>
                    </Tooltip>
                  </div>

                  {/* ── Expanded preview — info only, opens inline, pushing the
                      content below it down, not an overlay. ── */}
                  {expanded && (
                    <div className="theme-studio xp-pe-preview">
                      <HandTimeline notes={infoNotes} passages={getLowConfidencePassages(infoNotes)} duration={midi?.duration ?? 0} flagged={infoStats.lowConfidenceCount > 0} />
                      <span>{handStatsText(infoStats)}</span>
                      <span className="xp-note">{HAND_DISCLAIMER}</span>
                    </div>
                  )}
                </>
              )
            })()}

            {/* ── Hand-split preview — non-destructive review before choosing an
                output mode. Opens directly in this track's own row. ── */}
            {pendingSplitIndex === track.index && (() => {
              const notes = midi?.tracks.find(t => t.index === track.index)?.notes ?? []
              const stats = getHandPreviewStats(notes)
              return (
                <div className="theme-studio xp-pe-preview">
                  <span style={{ fontSize: 'var(--text-md)' }}>Hand split preview · {track.trackName}</span>
                  <HandTimeline notes={notes} passages={getLowConfidencePassages(notes)} duration={midi?.duration ?? 0} flagged={stats.lowConfidenceCount > 0} />
                  <span>{handStatsText(stats)}</span>
                  <span className="xp-note">{HAND_DISCLAIMER}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="o-btn" onClick={() => setPendingSplitIndex(null)}>Don't split</button>
                    <Tooltip title="Stages left-hand notes to one track and right-hand notes to another — applies with Save & Reload below, doesn't touch disk yet." oneLine>
                      <button className="o-btn-primary" onClick={handleSplitConfirm}><Split size={16} /> Split into two tracks</button>
                    </Tooltip>
                  </div>
                </div>
              )
            })()}
          </div>
          )})}
        </div>
      </div>

      {/* ── Color popover ────────────────────────────────────────────────────── */}
      {colorPopover && (
        <ColorPopover
          trackIndex={colorPopover.trackIndex}
          trackColor={colorPopover.trackColor}
          anchor={colorPopover.anchor}
          onApplyColor={handleApplyColor}
          onClose={() => setColorPopover(null)}
        />
      )}

      {/* ── Save footer ──────────────────────────────────────────────────────── */}
      <div className="xp-pe-foot">
        {/* ── Browse only makes sense before a save has landed; once it has, the
            field shows the real saved path and Show in folder takes its slot. ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="xp-note" style={{ flexShrink: 0 }}>Save as</span>
          <div className="xp-pe-path" data-ok={saveResult?.ok ? '' : undefined}>
            {saveResult?.ok && saveResult.filePath ? `✓ ${saveResult.filePath}` : baseName(state.outputPath)}
          </div>
          {saveResult?.ok && saveResult.filePath ? (
            <Tooltip title={t`Opens the folder with this exact saved file highlighted, so you can see where it landed.`} oneLine>
              <button className="o-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => window.electronAPI.showItemInFolder(saveResult.filePath!)}><FolderOpen size={16} /> Show in folder</button>
            </Tooltip>
          ) : (
            <button className="o-btn" onClick={async () => {
              const p = await window.electronAPI.saveFileDialog({ defaultPath: state.outputPath, filters: [{ name: 'MIDI Files', extensions: ['mid'] }] })
              if (p) setState(s => s && ({ ...s, outputPath: p }))
            }}><FolderOpen size={16} /> Browse</button>
          )}
        </div>
        {splitResult && (
          <div className="xp-pe-banner" style={{ background: splitResult.ok ? 'var(--status-success-bg)' : 'var(--status-error-banner-bg)', border: `1px solid ${splitResult.ok ? 'var(--status-success-border)' : 'var(--status-error-banner-border)'}`, color: splitResult.ok ? 'var(--status-success-text)' : 'var(--status-error-banner-text)' }}>
            <span style={{ flex: 1 }}>{splitResult.ok ? '✓ ' : '✗ '}{splitResult.msg}</span>
            {splitResult.ok && preSplitRows && (
              <button className="xp-pe-link" onClick={handleUndoSplit}><Undo2 size={14} /> Undo split</button>
            )}
          </div>
        )}
        {/* Error only — a successful save is shown by the green path field above */}
        {saveResult && !saveResult.ok && (
          <div className="xp-pe-banner" style={{ background: 'var(--status-error-banner-bg)', border: '1px solid var(--status-error-banner-border)', color: 'var(--status-error-banner-text)' }}>
            ✗ {saveResult.msg}
          </div>
        )}
        <div className="xp-pe-actions">
          <span className="xp-pe-tiny">Original file is never modified! Saves as a new _ORFEO_vX copy in "Orfeo" folder next to it, auto-loads on save. Only shows up in your Library list if that folder is inside your registered Library Folder. Refresh Library to see it immediately.</span>
          {saveResult?.ok ? (
            <button className="o-btn-primary o-btn-lg" onClick={() => setMidiEditorOpen(false)}><ThumbsUp size={16} /> OK</button>
          ) : (
            <>
              <button className="o-btn o-btn-lg" onClick={handleCancel}>Cancel</button>
              <button className="o-btn-primary o-btn-lg" onClick={handleSave} disabled={saving} style={{ whiteSpace: 'nowrap' }}><Save size={16} /> {saving ? 'Saving…' : 'Save & Reload'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
