import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { Chord, Note } from 'tonal'
import { ArrowLeft, RotateCcw, Play, Square, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import { formatChordSuffix, detectChordStructured } from '../utils/chordDetection'
import type { NoteNaming, Accidentals, ChordNamingStyle } from '../types'
import SpeedControl from './SpeedControl'
import PliageMark from './PliageMark'
import ExplorerMenu from './ExplorerMenu'
import ExplorerMiniKeyboard from './ExplorerMiniKeyboard'
import { useScaleRipple } from '../hooks/useScaleRipple'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useHeldChord } from '../hooks/useHeldChord'
import Tooltip from './Tooltip'
import {
  nextVoicing, voiceProgression, semisFromMidi, intervalsToSemis,
  PROGRESSION_VOICINGS, PROGRESSION_VOICING_LABEL, PROGRESSION_VOICING_HINT,
} from '../utils/voiceLeading'
import {
  EXPLORER_RANGE, explorerLowRoot, SPEED_MS, VOICING_ICON, ALL_PROGRESSIONS,
  resolveProgressionStep, progressionSteps, nextInversionSet, prevInversionSet, ringChord, strikeStep, inversionOf,
  explorerKeyColors, captureStruckShape, restoreStruckShape, type ProgSpeed, type StruckShape,
} from '../utils/explorerShared'
import { ALL_CHORDS } from '../utils/chordVocabulary'
import ExplorerOctaveControl from './ExplorerOctaveControl'
import CofTitleMark from './CofTitleMark'
import StarmapRing, { type LitChord } from './Starmap/StarmapRing'
import type { RingLayout } from '../utils/starmap'
import { t } from '../utils/i18n'
import '../styles/redesign-tools.css'

// The Starmap ring is drawn in a 380-unit space
const COF_VIEW = { x: -8, y: -8, w: 396, h: 404 }

// ── Scale definitions ───────────────────────────────────────────────────────
// `chords` (blues scales only): the tiles are the chords the scale is played
// OVER, not chords stacked from its own notes — stacking every other note of
// a blues scale gives odd results (C–E♭–G reads as Cm in C Major Blues).
interface ScaleDef {
  name: string
  intervals: number[]
  romans: string[]
  chords?: { offset: number; type: string }[]
  // blues scales: the "blue note", semitones above the tonic (Starmap marks it)
  blueNote?: number
}

// The tiles' fills, in order
const TILE_FILLS = ['var(--paint-yellow)', 'var(--paint-lime)', 'var(--paint-blue)', 'var(--sand)', 'var(--paint-rose)', 'var(--paint-olive)', 'var(--stone)', 'var(--paint-yellow)']

const SCALES: ScaleDef[] = [
  { name: 'Major',            intervals: [0,2,4,5,7,9,11], romans: ['I','ii','iii','IV','V','vi','vii°'] },
  { name: 'Natural Minor',    intervals: [0,2,3,5,7,8,10], romans: ['i','ii°','III','iv','v','VI','VII'] },
  { name: 'Harmonic Minor',   intervals: [0,2,3,5,7,8,11], romans: ['i','ii°','III+','iv','V','VI','vii°'] },
  { name: 'Melodic Minor',    intervals: [0,2,3,5,7,9,11], romans: ['i','ii','III+','IV','V','vi°','vii°'] },
  { name: 'Major Pentatonic', intervals: [0,2,4,7,9],       romans: ['I','II','III','V','VI'] },
  { name: 'Minor Pentatonic', intervals: [0,3,5,7,10],      romans: ['i','III','IV','v','VII'] },
  { name: 'Major Blues',      intervals: [0,2,3,4,7,9],     romans: ['I7','I6','VI7','I7♯9'], blueNote: 3,
    chords: [{ offset: 0, type: '7' }, { offset: 0, type: '6' }, { offset: 9, type: '7' }, { offset: 0, type: '7#9' }] },
  { name: 'Minor Blues',      intervals: [0,3,5,6,7,10],    romans: ['i7','I7','IV7','V7'], blueNote: 6,
    chords: [{ offset: 0, type: 'm7' }, { offset: 0, type: '7' }, { offset: 5, type: '7' }, { offset: 7, type: '7' }] },
  { name: 'Dorian',           intervals: [0,2,3,5,7,9,10], romans: ['i','ii','III','IV','v','vi°','VII'] },
  { name: 'Phrygian',         intervals: [0,1,3,5,7,8,10], romans: ['i','II','III','iv','v°','VI','VII'] },
  { name: 'Lydian',           intervals: [0,2,4,6,7,9,11], romans: ['I','II','iii','#iv°','V','vi','vii'] },
  { name: 'Mixolydian',       intervals: [0,2,4,5,7,9,10], romans: ['I','ii','iii°','IV','v','vi','VII'] },
]

// ── Minor scale names — used to append 'm' to the Key display ───────────────
const MINOR_SCALES = new Set(['Natural Minor', 'Harmonic Minor', 'Melodic Minor', 'Minor Pentatonic', 'Minor Blues', 'Phrygian'])

// ── Circle of Fifths position tables ────────────────────────────────────────
// 12 positions clockwise from top (C)
const COF_MAJOR_PC  = [0, 7, 2, 9, 4, 11, 6,  1,  8, 3, 10, 5]
const COF_MINOR_PC  = [9, 4,11, 6, 1,  8, 3, 10,  5, 0,  7, 2]
// Key signature: positive = sharps, negative = flats
const COF_KEYSIG    = [0, 1, 2, 3, 4,  5, 6, -5, -4,-3,  -2,-1]

// ── Diatonic chord type ─────────────────────────────────────────────────────
interface DiatonicChord {
  degree: number
  roman: string
  rootPC: number
  midiNotes: number[]
  chordName: string
  suffix: string
  noteCount: number
  // ── Name without the slash bass + which inversion the tile's voicing is
  // (0 for every 7-note scale; pentatonic stacks are often inverted, e.g.
  // C–E–A = Am, 1st inversion) — fed to the keyboard's chord display so the
  // inversion buttons count from the tile's real inversion. ────────────────
  baseName: string
  inversion: number
  // ── Shape the voicing engine builds from (offsets above rootPC), the
  // chord's real root (differs from rootPC when a pentatonic stack is
  // inverted, e.g. C–E–A = Am) and its tones in root-position order. ─────
  semis: number[]
  harmonicRootPC: number
  tonePcs: number[]
}

// ── Maps tonal's quality/name WORDS to a raw suffix — formatChordSuffix
// (same shared formatter chordDetection.ts and ChordExplorer.tsx use) then
// applies the user's naming style on top, so this map only ever needs to
// store the raw/abbreviation-shaped form, never a style-specific one. ─────
const QUALITY_SUFFIX: Record<string, string> = {
  'major': '', 'minor': 'm', 'diminished': 'dim', 'augmented': 'aug',
  'suspended fourth': 'sus4', 'suspended second': 'sus2',
  'dominant seventh': '7', 'major seventh': 'maj7', 'minor seventh': 'm7',
  'half-diminished seventh': 'm7b5', 'diminished seventh': 'dim7',
  'major sixth': '6', 'minor sixth': 'm6', 'dominant ninth': '9',
  'power chord': '5',
}

// ── Build one triad from a scale degree, detect quality via tonal ────────────
function buildDiatonicChord(
  root: number,
  scaleIntervals: number[],
  degree: number,
  naming: NoteNaming,
  accidentals: Accidentals,
  namingStyle: ChordNamingStyle,
): DiatonicChord {
  const n = scaleIntervals.length
  const scalePCs = scaleIntervals.map(s => (root + s) % 12)
  const { min, max } = EXPLORER_RANGE

  // Stack thirds within the scale (degrees: deg, deg+2, deg+4)
  const triadPCs = [
    scalePCs[degree % n],
    scalePCs[(degree + 2) % n],
    scalePCs[(degree + 4) % n],
  ]

  // Place root in a playable octave — prefer oct 3 (C3–B3) to centre chords in C3–C5
  let baseMidi = -1
  for (const oct of [3, 4, 2, 5]) {
    const m = triadPCs[0] + (oct + 1) * 12
    if (m >= min && m <= max) { baseMidi = m; break }
  }
  if (baseMidi < 0) baseMidi = triadPCs[0] + 60

  // Build ascending MIDI notes
  const midiNotes: number[] = [baseMidi]
  for (let i = 1; i < triadPCs.length; i++) {
    let m = triadPCs[i] + (Math.floor(baseMidi / 12)) * 12
    while (m <= midiNotes[i - 1]) m += 12
    if (m > max) m -= 12
    midiNotes.push(m)
  }

  // Detect chord quality via tonal. Every 7-note scale stacks into a
  // root-position triad, so tonal answers with a plain chord on the stacked
  // root. A pentatonic stack is usually an inverted or sus chord instead
  // (C–E–A, D–G–C) and tonal only offers slash answers, unranked — its first
  // pick for E–A–C# is "C#m#5/E", not A/E. Those go through the app's own
  // ranked picker (the one playback uses), then get named by that chord's
  // real root and quality with the stacked bass after the slash — never the
  // bass note glued to another chord's quality (was "Cm" for C–E–A).
  const noteNames = midiNotes.map(m => Note.fromMidi(m))
  const detected = Chord.detect(noteNames)
  const rootPosition = detected.find(c => !c.includes('/'))
  const structured = rootPosition ? null : detectChordStructured(new Set(midiNotes))
  const baseChord = rootPosition ?? structured?.rawRootName ?? detected[0]?.split('/')[0] ?? ''
  let suffix = '?'
  let chordRootPC = triadPCs[0]
  let inversion = 0
  let tonePcs = triadPCs
  if (baseChord) {
    const info = Chord.get(baseChord)
    const rawSuffix = QUALITY_SUFFIX[info.quality?.toLowerCase() ?? ''] ??
             QUALITY_SUFFIX[info.name?.toLowerCase() ?? ''] ??
             (info.aliases?.[0] ?? info.quality ?? '')
    suffix = formatChordSuffix(rawSuffix, namingStyle)
    const tonicPC = info.tonic ? Note.chroma(info.tonic) : undefined
    if (tonicPC !== undefined && tonicPC !== null && tonicPC !== triadPCs[0]) {
      chordRootPC = tonicPC
      const chordPcs = info.notes.map(n => Note.chroma(n))
      inversion = Math.max(0, chordPcs.indexOf(triadPCs[0]))
      if (chordPcs.length === triadPCs.length) tonePcs = chordPcs
    }
  }

  const baseName = getNoteName(chordRootPC, naming, accidentals) + suffix
  const chordName = chordRootPC !== triadPCs[0] ? `${baseName}/${getNoteName(baseMidi, naming, accidentals)}` : baseName
  return {
    degree,
    roman: SCALES.find(s => s.intervals === scaleIntervals)?.romans[degree] ?? String(degree + 1),
    rootPC: triadPCs[0],
    midiNotes,
    chordName,
    suffix,
    noteCount: midiNotes.length,
    baseName,
    inversion,
    semis: semisFromMidi(midiNotes),
    harmonicRootPC: chordRootPC,
    tonePcs,
  }
}

// ── Blues tiles — a fixed chord on a fixed root per tile (see ScaleDef) ─────
function buildScaleChord(
  root: number,
  scaleDef: ScaleDef,
  degree: number,
  naming: NoteNaming,
  accidentals: Accidentals,
  namingStyle: ChordNamingStyle,
): DiatonicChord | null {
  const spec = scaleDef.chords?.[degree]
  const info = spec ? ALL_CHORDS.find(c => c.key === spec.type) : undefined
  if (!spec || !info) return null
  const rootPC = (root + spec.offset) % 12
  const semis = intervalsToSemis(info.intervals)
  const suffix = formatChordSuffix(info.suffix, namingStyle)
  const baseName = getNoteName(rootPC, naming, accidentals) + suffix
  return {
    degree,
    roman: scaleDef.romans[degree] ?? String(degree + 1),
    rootPC,
    midiNotes: semis.map(st => 48 + rootPC + st),
    chordName: baseName,
    suffix,
    noteCount: semis.length,
    baseName,
    inversion: 0,
    semis,
    harmonicRootPC: rootPC,
    tonePcs: semis.map(st => (rootPC + st) % 12),
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ScaleExplorer() {
  // ── Store subscriptions ───────────────────────────────────────────────────
  const scaleExplorerOpen       = useStore(s => s.scaleExplorerOpen)
  const scaleExplorerMinimized  = useStore(s => s.scaleExplorerMinimized)
  const setScaleExplorerOpen    = useStore(s => s.setScaleExplorerOpen)
  const setChordExplorerOpen    = useStore(s => s.setChordExplorerOpen)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const colorRootNoteEnabled = useStore(s => s.colorRootNoteEnabled)
  const setColorRootNoteEnabled = useStore(s => s.setColorRootNoteEnabled)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const clearLockedKeys = useStore(s => s.clearLockedKeys)
  const setExplorerChordDisplay = useStore(s => s.setExplorerChordDisplay)
  const clearExplorerChordDisplay = useStore(s => s.clearExplorerChordDisplay)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const chordNamingStyle = useStore(s => s.chordNamingStyle)
  const progressionVoicing = useStore(s => s.progressionVoicing)
  const setProgressionVoicing = useStore(s => s.setProgressionVoicing)
  const setAccidentals = useStore(s => s.setAccidentals)
  const explorerOctave = useStore(s => s.explorerOctave)
  const starmapEnabled = useStore(s => s.starmapEnabled)

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, scaleExplorerOpen && !scaleExplorerMinimized)

  // ── CoF + scale selection state ───────────────────────────────────────────
  const [cofPos, setCofPos] = useState<number | null>(null)
  const [cofRing, setCofRing] = useState<'major' | 'minor' | null>(null)
  const [selectedScaleIdx, setSelectedScaleIdx] = useState(0)
  const [selectedDegree, setSelectedDegree] = useState<number | null>(null)
  // ── The chord sounding now, for the Starmap's star — set beside every
  // chord the explorer strikes, cleared when the key or scale changes. ────
  const [litChord, setLitChord] = useState<LitChord | null>(null)
  // ── Circle shown: the Circle of Fifths by default, the Starmap when the
  // STARMAP row's switch is on — available once Settings › Appearance ›
  // Starmap is on. Kept for the session (closing the explorer keeps it). ──
  const starmapView = useStore(s => s.scaleStarmapView)
  const setStarmapView = useStore(s => s.setScaleStarmapView)
  const showStarmap = starmapEnabled && starmapView
  // ── Starmap ring order: by semitone (default) or by fifths ───────────────
  const [ringLayout, setRingLayout] = useState<RingLayout>('chromatic')


  // ── Progression state ─────────────────────────────────────────────────────
  const [selectedProg, setSelectedProg] = useState<number | null>(null)
  const [progPlaying, setProgPlaying] = useState(false)
  const [progStep, setProgStep] = useState(0)
  const [progSpeed, setProgSpeed] = useState<ProgSpeed>('med')
  const [progMenuOpen, setProgMenuOpen] = useState(false)
  const progTriggerRef = useRef<HTMLButtonElement>(null)
  const closeProgMenu = useCallback(() => setProgMenuOpen(false), [])

  // ── Info row: currently playing chord context ─────────────────────────────
  const [infoRowChord, setInfoRowChord] = useState<{ progName: string; labels: string[]; notes: string[]; step: number } | null>(null)

  // ── Octave tile selection — separate from selectedDegree (0-6) ────────────
  // True when the 8th tile (tonic +12) is the active selection.
  const [octaveTileSelected, setOctaveTileSelected] = useState(false)

  // ── Which note-names-row note is currently sounding during scale playback —
  // index into [...scale.intervals, octaveRoot], -1 = none. Drives the
  // sequential amber highlight on the note-names row. ───────────────────────
  const [scalePlayIndex, setScalePlayIndex] = useState(-1)

  // ── "Chords in the Scale" auto-sequence — playing/stopped, so the play
  // button toggles (stop on click / spacebar) instead of restarting. ───────
  const [chordSeqPlaying, setChordSeqPlaying] = useState(false)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // speedRef lets both the progression and the chords-in-the-scale run read
  // the live speed without restarting the chain
  const speedRef = useRef<ProgSpeed>('med')
  const progRunningRef = useRef(false)
  const scalePlayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const chordSeqTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const chordSeqRunningRef = useRef(false)
  // ── Root whose pitch class is accented on the lit keys right now — kept so
  // flipping "Accent root note" recolors what's already on the keyboard. ──
  const accentRootRef = useRef<number | null>(null)
  // ── Shape the inversion ↺ returns to (null until an arrow is pressed) ──
  const struckShapeRef = useRef<StruckShape | null>(null)
  const [inverted, setInverted] = useState(false)
  // ── Scale replay trigger — incremented on every CoF click so the play ─────
  // effect fires even when the same segment is clicked twice in a row
  const playTriggerRef = useRef(0)
  const [playTrigger, setPlayTrigger] = useState(0)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // ── A chord held on the MIDI keyboard takes over the Starmap's star while
  // it's held — drawing only, the explorer's own chord and keys stay as they
  // are, and the star glides back on release. ─────────────────────────────
  const heldChord = useHeldChord(showStarmap, displayNaming)

  // ── Derived root pitch class from CoF selection ───────────────────────────
  const selectedRoot = useMemo(() => {
    if (cofPos === null || cofRing === null) return null
    return cofRing === 'major' ? COF_MAJOR_PC[cofPos] : COF_MINOR_PC[cofPos]
  }, [cofPos, cofRing])

  const scale = SCALES[selectedScaleIdx]

  // ── Build all diatonic triads when root or scale type changes ─────────────
  const diatonicChords = useMemo<DiatonicChord[]>(() => {
    if (selectedRoot === null) return []
    if (scale.chords) {
      return scale.chords
        .map((_, deg) => buildScaleChord(selectedRoot, scale, deg, displayNaming, accidentals, chordNamingStyle))
        .filter((c): c is DiatonicChord => c !== null)
    }
    return scale.intervals.map((_, deg) =>
      buildDiatonicChord(selectedRoot, scale.intervals, deg, displayNaming, accidentals, chordNamingStyle)
    )
  }, [selectedRoot, scale, displayNaming, accidentals, chordNamingStyle])

  // ── Where each tile sits on the keyboard — the whole row voiced as one run
  // from the tonic under the Voicing mode, starting in the octave the Octave
  // control picks (C3–B3 by default), plus the tonic again at the end for
  // the octave tile. Tiles, the chords-in-the-scale run and the keyboard all
  // read this one list, so they always agree, in every key. ──────────────
  const lowRoot = explorerLowRoot(explorerOctave)
  const tileVoicings = useMemo<number[][]>(() => {
    if (diatonicChords.length === 0) return []
    const spec = diatonicChords.map(c => ({ rootPc: c.rootPC, semis: c.semis }))
    return voiceProgression([...spec, spec[0]], progressionVoicing, EXPLORER_RANGE, lowRoot)
  }, [diatonicChords, progressionVoicing, lowRoot])
  const tileVoicingsRef = useRef(tileVoicings)
  tileVoicingsRef.current = tileVoicings
  const lowRootRef = useRef(lowRoot)
  lowRootRef.current = lowRoot

  // ── Scale-type button — also re-syncs the Circle of Fifths highlight so the
  // lit segment always matches the chosen scale's family (minor-family scales
  // light the inner ring, everything else the outer ring) while keeping the
  // same tonic pitch class. Without this, switching e.g. Cm → Major Pentatonic
  // left "Cm" lit on the circle even though "Key of" had moved to C. ────────
  const selectScaleType = useCallback((idx: number) => {
    setSelectedScaleIdx(idx)
    setInfoRowChord(null)
    setSelectedDegree(null)
    setOctaveTileSelected(false)
    clearExplorerChordDisplay()
    if (selectedRoot !== null) {
      const ring: 'major' | 'minor' = MINOR_SCALES.has(SCALES[idx].name) ? 'minor' : 'major'
      const table = ring === 'major' ? COF_MAJOR_PC : COF_MINOR_PC
      const newPos = table.indexOf(selectedRoot)
      if (newPos >= 0) { setCofRing(ring); setCofPos(newPos) }
    }
  }, [selectedRoot, clearExplorerChordDisplay])

  // ── Pick a key — a wedge on the Circle of Fifths, a note on the Starmap, or
  // the Starmap's Major | Minor switch. A wedge sets Major or Natural Minor;
  // the Starmap keeps the selected scale when it already fits the chosen
  // major/minor side (Dorian stays Dorian), else switches to Major / Natural
  // Minor. Replays the scale either way. ────────────────────────────────────
  const pickKey = useCallback((pc: number, ring: 'major' | 'minor', keepScale: boolean) => {
    const table = ring === 'major' ? COF_MAJOR_PC : COF_MINOR_PC
    setCofPos(table.indexOf(pc)); setCofRing(ring)
    const side = MINOR_SCALES.has(SCALES[selectedScaleIdx].name) ? 'minor' : 'major'
    if (!keepScale || side !== ring) setSelectedScaleIdx(ring === 'major' ? 0 : 1)
    setInfoRowChord(null); setSelectedDegree(null); clearExplorerChordDisplay()
    playTriggerRef.current += 1; setPlayTrigger(playTriggerRef.current)
  }, [selectedScaleIdx, clearExplorerChordDisplay])

  // ── Stop progression and clear its timer ─────────────────────────────────
  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
  }, [])

  // ── Cancel all scheduled scale-play note timers ───────────────────────────
  const clearScalePlayTimers = useCallback(() => {
    scalePlayTimersRef.current.forEach(t => clearTimeout(t))
    scalePlayTimersRef.current = []
  }, [])

  // ── Cancel the chords-in-scale auto-sequence ───────────────────────────────
  const stopChordSequence = useCallback(() => {
    chordSeqRunningRef.current = false
    chordSeqTimersRef.current.forEach(t => clearTimeout(t))
    chordSeqTimersRef.current = []
    setChordSeqPlaying(false)
  }, [])

  // ── On open: pause playback, reset all transient state ────────────────────
  useEffect(() => {
    if (scaleExplorerOpen) {
      // unless switched off: Settings › Playback › Explorers pause playback
      if (useStore.getState().playbackState === 'playing' && useStore.getState().explorerPausesPlayback) {
        ;(window as any).__pliagePlayer?.pause?.()
        useStore.getState().setPlaybackState('paused')
      }
      // ── Default to C major, as if it were already clicked — keeps the modal
      // at its fully-expanded height on open instead of the empty placeholder
      // state. COF_MAJOR_PC[0] === 0 (C), so position 0 on the major ring. ────
      setCofPos(0); setCofRing('major'); setSelectedScaleIdx(0)
      stopProgression()
      setSelectedProg(null)
      setProgSpeed('med'); speedRef.current = 'med'
      setSelectedDegree(null)
      setOctaveTileSelected(false)
      setInfoRowChord(null)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    } else {
      stopProgression()
      clearScalePlayTimers()
      stopChordSequence()
      setScalePlayIndex(-1)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    }
  }, [scaleExplorerOpen, stopProgression, clearScalePlayTimers, stopChordSequence, clearExplorerKeys, clearExplorerChordDisplay])

  // ── Light keys on the keyboard, remembering which root is accented — the
  // shared colour rule reads the "Accent root note" toggle live, so a run
  // already playing picks up a flip on its next chord. ─────────────────────
  // keepShape: an inversion step or a recolour, not a newly struck chord —
  // keeps the shape the inversion ↺ returns to.
  const lightKeys = useCallback((notes: number[], rootPc: number | null, keepShape = false) => {
    accentRootRef.current = rootPc
    if (!keepShape) { struckShapeRef.current = null; setInverted(false) }
    setExplorerKeys(new Set(notes), explorerKeyColors(notes, rootPc, useStore.getState().colorRootNoteEnabled))
  }, [setExplorerKeys])

  // ── ↺ beside the inversion arrows — back to the shape the chord had when
  // it was struck (shared rule, utils/explorerShared.ts). ──────────────────
  const resetInversion = useCallback(() => {
    const shape = struckShapeRef.current
    if (!shape) return
    const state = useStore.getState()
    const notes = restoreStruckShape(shape, state.explorerOctave)
    if (!notes) return
    lightKeys(notes, accentRootRef.current)
    const cd = state.explorerChordDisplay
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: shape.invCount })
    ringChord(notes)
  }, [lightKeys])

  // ── "Accent root note" flipped — recolor whatever is lit right now ────────
  useEffect(() => {
    if (!scaleExplorerOpen) return
    const lit = Array.from(useStore.getState().explorerKeys)
    if (lit.length > 0) lightKeys(lit, accentRootRef.current, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorRootNoteEnabled])

  // ── Play scale notes ascending and light keys when root/scale changes ──────
  // Starts on the tonic in the octave the Octave control picks (C3–B3 by
  // default), same register the chords start in.
  useEffect(() => {
    if (!scaleExplorerOpen || selectedRoot === null) return
    clearScalePlayTimers()
    const playNote = (window as any).__pliagePlayNote
    const rootMidi = lowRoot + selectedRoot
    const noteMidis = [...scale.intervals.map(iv => rootMidi + iv), rootMidi + 12]
      .filter(m => m >= EXPLORER_RANGE.min && m <= EXPLORER_RANGE.max)
    lightKeys(noteMidis, selectedRoot)
    setLitChord(null)
    setSelectedDegree(null)
    setOctaveTileSelected(false)

    setScalePlayIndex(-1)
    if (playNote) {
      noteMidis.forEach((m, i) => {
        const t = setTimeout(() => { playNote(m, 0.6, 400); setScalePlayIndex(i) }, i * 220)
        scalePlayTimersRef.current.push(t)
      })
      const resetT = setTimeout(() => setScalePlayIndex(-1), noteMidis.length * 220 + 400)
      scalePlayTimersRef.current.push(resetT)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx, scaleExplorerOpen, playTrigger])

  // ── Tile name as voiced — slash bass when the voicing doesn't have the
  // chord's root at the bottom. ─────────────────────────────────────────────
  const voicedName = useCallback((chord: DiatonicChord, voicing: number[] | undefined) => {
    if (!voicing || voicing.length === 0) return chord.chordName
    const bassPc = Math.min(...voicing) % 12
    return bassPc === chord.harmonicRootPC
      ? chord.baseName
      : `${chord.baseName}/${getNoteName(bassPc, displayNaming, accidentals)}`
  }, [displayNaming, accidentals])

  // ── Play one tile — index 0..n-1 are the scale's chords, n is the octave
  // tile. Clicked tiles ring like a held pedal; the chords-in-the-scale run
  // rolls each chord and lets it ring into the next. The chord's own root is
  // the accented note, in every voicing mode. ───────────────────────────────
  const playTile = useCallback((idx: number, how: 'click' | 'run') => {
    const voicing = tileVoicingsRef.current[idx]
    const isOctave = idx === diatonicChords.length
    const chord = diatonicChords[isOctave ? 0 : idx]
    if (!voicing || !chord) return
    const notes = [...voicing].sort((a, b) => a - b)
    setSelectedDegree(isOctave ? null : idx)
    setOctaveTileSelected(isOctave)
    lightKeys(notes, chord.harmonicRootPC)
    setLitChord({ pcs: notes.map(m => m % 12), rootPc: chord.harmonicRootPC, name: chord.baseName })
    setExplorerChordDisplay({
      name: chord.baseName,
      invCount: inversionOf(chord.harmonicRootPC, chord.tonePcs.map(pc => (pc - chord.harmonicRootPC + 12) % 12), notes),
      noteCount: notes.length,
    })
    setInfoRowChord({
      progName: '',
      labels: [isOctave ? chord.roman + '⁸' : chord.roman],
      notes: notes.map(m => getNoteName(m, displayNaming, accidentals)),
      step: 0,
    })
    if (how === 'click') ringChord(notes)
    else strikeStep(notes, Math.round(SPEED_MS[speedRef.current] * 1.12), () => chordSeqRunningRef.current)
  }, [diatonicChords, lightKeys, setExplorerChordDisplay, displayNaming, accidentals])
  const playTileRef = useRef(playTile)
  playTileRef.current = playTile

  // ── Voicing mode switched — re-light the selected tile where it now sits
  // (silently; the next click or run plays it there). ──────────────────────
  const prevVoicingRef = useRef(progressionVoicing)
  useEffect(() => {
    if (prevVoicingRef.current === progressionVoicing) return
    prevVoicingRef.current = progressionVoicing
    if (progRunningRef.current || chordSeqRunningRef.current) return
    const idx = octaveTileSelected ? diatonicChords.length : selectedDegree
    const voicing = idx === null ? undefined : tileVoicings[idx]
    const chord = idx === null ? undefined : diatonicChords[idx === diatonicChords.length ? 0 : idx]
    if (!voicing || !chord) return
    lightKeys(voicing, chord.harmonicRootPC)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressionVoicing])

  // ── Auto-play all chords in the scale, one after another — the "Chords in
  // the Scale" play button. Plays every tile, octave tile last, at the
  // progression speed; voicing, speed and the root accent are all read live,
  // so changing any of them mid-run takes effect on the next chord. A second
  // click (or spacebar) stops it. ────────────────────────────────────────────
  const playChordsInSequence = useCallback(() => {
    if (chordSeqPlaying) { stopChordSequence(); return }
    if (diatonicChords.length === 0) return
    stopChordSequence()
    stopProgression()
    chordSeqRunningRef.current = true
    setChordSeqPlaying(true)
    const step = (i: number) => {
      if (!chordSeqRunningRef.current) return
      const last = tileVoicingsRef.current.length - 1
      playTileRef.current(i, 'run')
      const t = setTimeout(
        () => i < last ? step(i + 1) : stopChordSequence(),
        SPEED_MS[speedRef.current],
      )
      chordSeqTimersRef.current.push(t)
    }
    step(0)
  }, [chordSeqPlaying, diatonicChords.length, stopChordSequence, stopProgression])

  const hasTileSelected = selectedDegree !== null || octaveTileSelected

  // ── Rotate the live chord voicing down (prev) or up (next) ──────────────
  // Same as ChordExplorer's handleInversion: reads the lit keys from the store
  // each time so rotations accumulate across octaves instead of wrapping at
  // chord length. The accented root stays pink wherever it lands. ─────────
  const stepInversion = useCallback((dir: 'prev' | 'next') => {
    const state = useStore.getState()
    if (state.explorerKeys.size === 0) return
    const cd = state.explorerChordDisplay
    struckShapeRef.current = captureStruckShape(struckShapeRef.current, state.explorerKeys, cd?.invCount ?? 0, state.explorerOctave)
    setInverted(true)
    const notes = dir === 'next' ? nextInversionSet(state.explorerKeys) : prevInversionSet(state.explorerKeys)
    const sorted = Array.from(notes).sort((a, b) => a - b)
    lightKeys(sorted, accentRootRef.current, true)
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount + (dir === 'next' ? 1 : -1) })
    ringChord(sorted)
  }, [lightKeys])

  // ── Play one progression step and schedule the next ──────────────────────
  // Same rules as the Chord Explorer (utils/explorerShared.ts): the step's
  // chord is exactly what its numeral says in this key — I–bVII–IV plays
  // C–B♭–F in C — and the shared voice-leading engine picks its voicing from
  // the one that just played, under the live Voicing mode. A step whose chord
  // is one of the tiles lights that tile.
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    prevMidi: number[] | null,
  ) => {
    if (!progRunningRef.current) return
    if (selectedRoot === null) return
    const prog = ALL_PROGRESSIONS[progIndex]
    if (!prog) return
    const resolved = resolveProgressionStep(prog, step, selectedRoot)
    if (!resolved) return
    const semis = intervalsToSemis(resolved.info.intervals)

    const voicingMode = useStore.getState().progressionVoicing
    const notes = nextVoicing(prevMidi, resolved.rootPc, semis, voicingMode, EXPLORER_RANGE, lowRootRef.current)

    lightKeys(notes, resolved.rootPc)
    const stepName = getNoteName(resolved.rootPc, displayNaming, accidentals) + formatChordSuffix(resolved.info.suffix, chordNamingStyle)
    setLitChord({ pcs: notes.map(m => m % 12), rootPc: resolved.rootPc, name: stepName })
    setExplorerChordDisplay({
      name: stepName,
      invCount: inversionOf(resolved.rootPc, semis, notes),
      noteCount: notes.length,
    })
    setProgStep(step)
    const pcs = new Set(semis.map(st => (resolved.rootPc + st) % 12))
    const tileIdx = diatonicChords.findIndex(c => c.tonePcs.length === pcs.size && c.tonePcs.every(pc => pcs.has(pc)))
    setSelectedDegree(tileIdx >= 0 ? tileIdx : null)
    // ── Octave tile has its own bool, independent of selectedDegree — must be
    // cleared explicitly or it stays stuck "selected" (stale highlight) once a
    // progression starts stepping through the regular degree tiles. ─────────
    setOctaveTileSelected(false)
    setInfoRowChord({
      progName: prog.name,
      labels: prog.labels,
      notes: notes.map(m => getNoteName(m, displayNaming, accidentals)),
      step,
    })

    strikeStep(notes, Math.round(SPEED_MS[speedRef.current] * 1.12), () => progRunningRef.current)

    const nextStep = (step + 1) % prog.labels.length
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, notes)
    }, SPEED_MS[speedRef.current])
  }, [diatonicChords, lightKeys, setExplorerChordDisplay, displayNaming, accidentals, chordNamingStyle, selectedRoot])

  // ── Start progression from step 0 ────────────────────────────────────────
  const startProgression = useCallback(() => {
    if (selectedProg === null || diatonicChords.length === 0) return
    stopProgression()
    stopChordSequence()
    progRunningRef.current = true
    setProgPlaying(true)
    playProgStepAt(0, selectedProg, null)
  }, [selectedProg, diatonicChords.length, stopProgression, stopChordSequence, playProgStepAt])

  // ── Stop progression + chords-in-scale sequence when root/scale changes ───
  useEffect(() => {
    if (progPlaying) stopProgression()
    stopChordSequence()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx])

  // ── Pick a progression from the list — clicking the picked one again
  // clears it. Picking another while one plays switches straight to it. ────
  const pickProgression = useCallback((i: number) => {
    if (selectedProg === i) { setSelectedProg(null); stopProgression(); return }
    setSelectedProg(i)
    if (progRunningRef.current && diatonicChords.length > 0) {
      stopProgression()
      progRunningRef.current = true
      setProgPlaying(true)
      playProgStepAt(0, i, null)
    }
  }, [selectedProg, diatonicChords.length, stopProgression, playProgStepAt])

  // ── Close on Escape ────────────────────────────────────────────────────────
  const close = useCallback(() => {
    stopProgression()
    clearExplorerKeys()
    clearExplorerChordDisplay()
    setScaleExplorerOpen(false)
  }, [stopProgression, clearExplorerKeys, clearExplorerChordDisplay, setScaleExplorerOpen])

  useEffect(() => {
    if (!scaleExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (progMenuOpen) setProgMenuOpen(false); else close() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [scaleExplorerOpen, close, progMenuOpen])

  // ── Spacebar while this modal is open — controls the progression when one
  // is selected, otherwise toggles the "Chords in the Scale" auto-sequence. ─
  useEffect(() => {
    if (!scaleExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      if (selectedProg !== null) {
        if (progPlaying) stopProgression(); else startProgression()
      } else {
        playChordsInSequence()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [scaleExplorerOpen, selectedProg, progPlaying, stopProgression, startProgression, playChordsInSequence])

  // ── CoF label helpers ─────────────────────────────────────────────────────
  // Major key name for outer ring position
  function getMajorLabel(p: number): string {
    return getNoteName(60 + COF_MAJOR_PC[p], displayNaming, accidentals)
  }
  // Minor key name (with "m" suffix) for inner ring position
  function getMinorLabel(p: number): string {
    return getNoteName(60 + COF_MINOR_PC[p], displayNaming, accidentals) + 'm'
  }
  // The key signature, in words
  function keySigText(p: number): string {
    const sig = COF_KEYSIG[p]
    if (sig === 0) return t`no sharps or flats`
    const n = Math.abs(sig)
    return sig > 0 ? (n === 1 ? t`1 sharp` : t`${n} sharps`) : (n === 1 ? t`1 flat` : t`${n} flats`)
  }

  // ── Scale info: root name, scale name, note list ──────────────────────────
  const infoText = useMemo(() => {
    if (selectedRoot === null) return null
    const rootName = getNoteName(60 + selectedRoot, displayNaming, accidentals)
    const noteNames = scale.intervals.map(iv => {
      const pc = (selectedRoot + iv) % 12
      return getNoteName(60 + pc, displayNaming, accidentals)
    })
    return { rootName, scaleName: scale.name, noteNames }
  }, [selectedRoot, scale, displayNaming, accidentals])
  useScaleRipple(scaleExplorerOpen && infoText ? `${infoText.rootName} ${infoText.scaleName}` : null)

  // ── Key quality suffix — 'm' for minor-family scales, '' for major-family ───
  const keyQuality = MINOR_SCALES.has(scale.name) ? 'm' : ''
  const starmapSide: 'major' | 'minor' = MINOR_SCALES.has(scale.name) ? 'minor' : 'major'
  const activeProg = selectedProg !== null ? ALL_PROGRESSIONS[selectedProg] : null
  const chipNames = activeProg
    ? selectedRoot === null ? activeProg.labels
      : progressionSteps(activeProg, selectedRoot).map(s => getNoteName(s.rootPc, displayNaming, accidentals) + formatChordSuffix(s.suffix, chordNamingStyle))
    : []

  // Closed (open=false): unmount entirely. Minimized (open=true, minimized=true): render but hide.
  if (!scaleExplorerOpen) return null

  // Centre of the circle in SVG space (the Starmap ring)
  const CX = 190, CY = 190

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Scales Explorer"
      data-instant
      className="pliage-modal-glow touch-explorer theme-studio xp-full xp-scales"
      style={{ display: scaleExplorerMinimized ? 'none' : 'flex' }}
    >
      <div className="xp-full-head">
        <button className="xp-back" aria-label={t`Back to practice`} onClick={close}><ArrowLeft size={16} />{t`Practice`}</button>
        <PliageMark height={22} tone="night" />
        <div className="xp-seg" data-accent role="group" aria-label={t`Explorers`}>
          <button aria-pressed={false} onClick={() => { setScaleExplorerOpen(false); setChordExplorerOpen(true) }}>{t`Chords`}</button>
          <button aria-pressed={true}>{t`Scales`}</button>
        </div>
        {/* Circle shown — the Starmap needs Settings › Appearance › Starmap */}
        <Tooltip oneLine title={!starmapEnabled ? t`Turn on in Settings › Appearance` : showStarmap ? t`Back to the Circle of Fifths` : t`Show the Starmap`}>
          <div className="xp-seg" role="group" aria-label={t`View`}>
            <button aria-pressed={!showStarmap} onClick={() => setStarmapView(false)}>{t`Circle of Fifths`}</button>
            <button aria-pressed={showStarmap} disabled={!starmapEnabled} onClick={() => setStarmapView(true)}>{t`Starmap`}</button>
          </div>
        </Tooltip>
        <div className="o-spacer" />
        {/* Starmap ring order — by semitone or by fifths */}
        {showStarmap && (
          <div className="xp-seg" role="group" aria-label={t`Note order`}>
            {(['chromatic', 'fifths'] as const).map(l => (
              <Tooltip key={l} oneLine title={l === 'chromatic' ? t`Notes in semitone order` : t`Notes in Circle of Fifths order`}>
                <button onClick={() => setRingLayout(l)} aria-pressed={ringLayout === l}>{l === 'chromatic' ? t`Semitones` : t`Fifths`}</button>
              </Tooltip>
            ))}
          </div>
        )}
        {/* Start over — clears the key, scale, progression and speed and
            turns the keys off */}
        <Tooltip oneLine title={t`Clear key, scale and progression`}>
          <button
            className="xp-pick"
            onClick={() => {
              setCofPos(null); setCofRing(null); setSelectedScaleIdx(0)
              setSelectedDegree(null); setOctaveTileSelected(false)
              stopProgression(); stopChordSequence(); setSelectedProg(null)
              setProgSpeed('med'); speedRef.current = 'med'
              setInfoRowChord(null); clearExplorerChordDisplay(); setLitChord(null)
              clearExplorerKeys(); clearLockedKeys(); useStore.getState().clearDisplayedChord()
              struckShapeRef.current = null; setInverted(false)
            }}
          ><span>{t`Clear & reset`}</span></button>
        </Tooltip>
      </div>

      <div className="xp-scales-body amber-scroll">
        {/* Left — the circle, then the scale's notes */}
        <div className="xp-scales-left">
          {showStarmap ? (
            <svg className="xp-ring" viewBox={`${COF_VIEW.x} ${COF_VIEW.y} ${COF_VIEW.w} ${COF_VIEW.h}`} style={{ overflow: 'visible' }}>
              <StarmapRing
                cx={CX} cy={CY}
                layout={ringLayout}
                scaleName={scale.name}
                tonicPc={selectedRoot}
                scalePcs={selectedRoot === null ? [] : scale.intervals.map(iv => (selectedRoot + iv) % 12)}
                blueNotePc={selectedRoot !== null && scale.blueNote !== undefined ? (selectedRoot + scale.blueNote) % 12 : null}
                litChord={heldChord ?? litChord}
                naming={displayNaming}
                accidentals={accidentals}
                keyQuality={starmapSide}
                morphMs={Math.min(400, Math.round(SPEED_MS[progSpeed] * 0.6))}
                onPickNote={pc => pickKey(pc, starmapSide, true)}
              />
            </svg>
          ) : (
            <div className="xp-cof" role="group" aria-label={t`Circle of Fifths`}>
              <div className="xp-cof-hole" />
              {Array.from({ length: 12 }, (_, i) => {
                const a = ((i * 30 - 90) * Math.PI) / 180
                const at = (r: number): CSSProperties => ({ left: `${50 + r * Math.cos(a)}%`, top: `${50 + r * Math.sin(a)}%` })
                return (
                  <span key={i}>
                    <button className="xp-cof-major" style={at(42)} aria-label={`${getMajorLabel(i)} major`} aria-pressed={cofPos === i && cofRing === 'major'} onClick={() => pickKey(COF_MAJOR_PC[i], 'major', false)}>{getMajorLabel(i)}</button>
                    <button className="xp-cof-minor" style={at(25)} aria-label={`${getMinorLabel(i)} minor`} aria-pressed={cofPos === i && cofRing === 'minor'} onClick={() => pickKey(COF_MINOR_PC[i], 'minor', false)}>{getMinorLabel(i)}</button>
                  </span>
                )
              })}
              {/* Centre — the key picked, else the hand-lettered title */}
              <div className="xp-cof-centre">
                {infoText ? (
                  <>
                    <span>{infoText.rootName}{keyQuality}</span>
                    <span>{infoText.scaleName.toLowerCase()}</span>
                    {/* the signature only belongs to the plain major and minor */}
                    {selectedScaleIdx <= 1 && cofPos !== null && <span>{keySigText(cofPos)}</span>}
                  </>
                ) : (
                  <svg viewBox="0 0 100 100" width="80%"><CofTitleMark cx={50} cy={50} width={90} fill="currentColor" /></svg>
                )}
              </div>
            </div>
          )}
          {/* The scale's notes, each lit in turn as the scale plays; the
              trailing octave repeat completes the run. ── */}
          {infoText && (
            <div className="xp-scale-line">
              <b>{infoText.rootName} {infoText.scaleName}</b>
              <span>
                {infoText.noteNames.map((n, i) => (
                  <span key={i} data-on={i === scalePlayIndex ? '' : undefined}>{n} </span>
                ))}
                <span>· </span>
                <span data-on={scalePlayIndex === infoText.noteNames.length ? '' : undefined}>{infoText.rootName}</span>
              </span>
            </div>
          )}
          {showStarmap && (
            <div className="xp-legend">
              <span><i style={{ background: 'var(--accent)' }} />{t`Home note`}</span>
              <span><i style={{ background: 'var(--paper-card)' }} />{t`In the scale`}</span>
              {selectedRoot !== null && scale.blueNote !== undefined && <span><i style={{ border: '2px solid var(--paint-blue)' }} />{t`Blue note`}</span>}
              <div className="xp-seg" data-tile role="group" aria-label={t`Key picked by a note`}>
                {(['major', 'minor'] as const).map(side => (
                  <button key={side} aria-pressed={starmapSide === side} onClick={() => { if (selectedRoot !== null && starmapSide !== side) pickKey(selectedRoot, side, true) }}>
                    {side === 'major' ? t`Major` : t`Minor`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <span className="xp-note" style={{ textAlign: 'center', textWrap: 'balance' } as CSSProperties}>
            {showStarmap
              ? t`Click a note on the ring to explore its scale and chords: every chord you play lights up as a star. Select a progression and click play to watch the stars move.`
              : t`Click a key on the circle to explore its scale and diatonic chords.`}
          </span>
        </div>

        {/* Right — scale, chords, progression, options */}
        <div className="xp-scales-right">
          <div className="xp-group">
            <span className="xp-note">{t`Scale`}</span>
            <div className="xp-scale-grid" role="group" aria-label={t`Scale`}>
              {SCALES.map((s, i) => (
                <button key={s.name} aria-pressed={selectedScaleIdx === i} onClick={() => selectScaleType(i)}>{s.name}</button>
              ))}
            </div>
          </div>

          {/* Chords in this key — one tile per chord, plus the octave tile */}
          <div className="xp-group">
            <div className="xp-group-head">
              <span className="xp-note">{t`Chords in this key · tap to hear`}</span>
              <Tooltip title="Play Chords" description={chordSeqPlaying ? 'Stop playback.' : 'Play all chords in the scale one after another.'}>
                <button className="o-icon-btn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ui-text)', cursor: 'pointer' }} aria-label={chordSeqPlaying ? t`Stop` : t`Play the chords`} onClick={playChordsInSequence} disabled={selectedRoot === null}>
                  {chordSeqPlaying ? <Square size={12} fill="currentColor" strokeWidth={0} /> : <Play size={14} fill="currentColor" strokeWidth={0} />}
                </button>
              </Tooltip>
              <div className="o-spacer" />
              {infoRowChord && <span className="xp-note">{infoRowChord.labels[infoRowChord.step]} · {infoRowChord.notes.join(' ')}</span>}
            </div>
            {selectedRoot === null ? (
              <div className="xp-empty">{t`Select a key from the circle to see its chords`}</div>
            ) : (
              <div className="xp-degrees">
                {[...diatonicChords, ...(diatonicChords[0] ? [diatonicChords[0]] : [])].map((chord, idx) => {
                  const isOctave = idx === diatonicChords.length
                  const voicing = tileVoicings[idx]
                  const notes = voicing ? [...voicing].sort((a, b) => a - b) : chord.midiNotes
                  return (
                    <button
                      key={isOctave ? 'octave' : chord.degree}
                      className="xp-tile"
                      aria-pressed={isOctave ? octaveTileSelected : selectedDegree === idx}
                      style={{ background: TILE_FILLS[idx % TILE_FILLS.length] }}
                      onMouseDown={() => { stopChordSequence(); playTile(idx, 'click') }}
                    >
                      <span className="xp-tile-note">{notes.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}</span>
                      <span className="xp-degree-foot">
                        <span className="xp-tile-name">{voicedName(chord, voicing)}</span>
                        <span>{chord.roman}{isOctave ? '⁸' : ''}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Progression — the same list as the Chord Explorer */}
          <section className="xp-seq" aria-label={t`Progression`}>
            <span className="xp-note">{t`Progression`}</span>
            <button ref={progTriggerRef} className="xp-pick" aria-haspopup="listbox" aria-expanded={progMenuOpen} onClick={() => setProgMenuOpen(v => !v)}>
              <span>{activeProg ? `${activeProg.name} · ${activeProg.labels.join(' ')}` : t`Select`}</span><ChevronDown size={14} />
            </button>
            {activeProg && (
              <Tooltip oneLine title={t`Clear progression`}>
                <button className="o-btn-quiet" style={{ color: '#fff', cursor: 'pointer' }} onClick={() => { setSelectedProg(null); stopProgression() }}>{t`Clear`}</button>
              </Tooltip>
            )}
            <div className="xp-chips amber-scroll">
              {chipNames.map((name, i) => (
                <span key={i} className="xp-chip" data-on={i === progStep && progPlaying ? '' : undefined}>{name}</span>
              ))}
            </div>
            <button
              className="xp-play"
              aria-label={progPlaying ? t`Stop` : t`Play progression`}
              onClick={() => { if (progPlaying) stopProgression(); else startProgression() }}
              disabled={!(selectedProg !== null && diatonicChords.length > 0) && !progPlaying}
            >
              {progPlaying ? <Square size={16} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
            </button>
          </section>

          <div className="xp-cards">
            <div className="xp-card">
              <span>{t`Accidentals`}</span>
              <div className="xp-seg" role="group" aria-label={t`Accidentals`}>
                {(['flat', 'sharp'] as const).map(v => (
                  <button key={v} aria-pressed={accidentals === v} aria-label={v === 'flat' ? t`Flats` : t`Sharps`} onClick={() => setAccidentals(v)}>{v === 'flat' ? '♭' : '♯'}</button>
                ))}
              </div>
            </div>
            <div className="xp-card">
              <span>{t`Octave`}</span>
              <ExplorerOctaveControl showLabel={false} />
            </div>
            <div className="xp-card">
              <span>{t`Inversions`}</span>
              <div className="xp-ctl">
                <Tooltip oneLine title="Previous inversion">
                  <button className="o-icon-btn" aria-label={t`Previous inversion`} onMouseDown={() => stepInversion('prev')} disabled={!hasTileSelected}><ChevronLeft size={18} /></button>
                </Tooltip>
                <Tooltip oneLine title="Next inversion">
                  <button className="o-icon-btn" aria-label={t`Next inversion`} onMouseDown={() => stepInversion('next')} disabled={!hasTileSelected}><ChevronRight size={18} /></button>
                </Tooltip>
                <Tooltip oneLine title={t`Reset inversion`}>
                  <button className="o-icon-btn" aria-label={t`Reset inversion`} onClick={resetInversion} disabled={!inverted}><RotateCcw size={15} /></button>
                </Tooltip>
              </div>
            </div>
            {/* Voicing — shared with the Chord Explorer; sets how the tiles, the
                chords-in-the-scale run and progressions are voiced */}
            <div className="xp-card">
              <span>{t`Chord voicing`}</span>
              <div className="xp-seg" role="group" aria-label={t`Chord voicing`}>
                {PROGRESSION_VOICINGS.map(v => {
                  const Icon = VOICING_ICON[v]
                  return (
                    <Tooltip key={v} oneLine title={`${PROGRESSION_VOICING_LABEL[v]} — ${PROGRESSION_VOICING_HINT[v]}`}>
                      <button style={{ padding: 0 }} aria-pressed={progressionVoicing === v} aria-label={PROGRESSION_VOICING_LABEL[v]} onClick={() => setProgressionVoicing(v)}><Icon size={16} /></button>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
            <div className="xp-card">
              <span>{t`Playback speed`}</span>
              <SpeedControl value={progSpeed} onChange={v => { setProgSpeed(v); speedRef.current = v }} size={11} />
            </div>
            {/* Accent root note — on by default: each chord's root (any octave)
                shows pink on the keyboard instead of blending into the amber */}
            <div className="xp-card">
              <span>{t`Accent root note`}</span>
              <div className="xp-ctl">
                <button role="switch" aria-checked={colorRootNoteEnabled} aria-label={t`Accent root note`} className="o-switch" onClick={() => setColorRootNoteEnabled(!colorRootNoteEnabled)}><span /></button>
              </div>
            </div>
          </div>

          <div className="o-spacer" />
          <ExplorerMiniKeyboard label={infoText ? t`${infoText.rootName} ${infoText.scaleName} on the keyboard` : t`Keyboard`} />
        </div>
      </div>

      {progMenuOpen && (
        <ExplorerMenu trigger={progTriggerRef} width={340} onClose={closeProgMenu}>
          {ALL_PROGRESSIONS.map((p, i) => {
            const isRot = !!p.isRotation
            const rotLabel = isRot ? p.name.replace(p.baseName! + ' ', '') : ''
            return (
              <button key={p.name} data-rotation={isRot ? '' : undefined} aria-selected={selectedProg === i} onClick={() => { pickProgression(i); closeProgMenu() }}>
                <span>{isRot ? `↳ ${rotLabel}` : p.name}</span>
                <span>{p.labels.join(' ')}</span>
              </button>
            )
          })}
        </ExplorerMenu>
      )}
    </div>
  )
}
