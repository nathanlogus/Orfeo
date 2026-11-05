import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { Search, Hand, RotateCcw, Square, Play, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import Fuse from 'fuse.js'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import { GENRE_LABELS } from '../utils/genreVoicing'
import type { Genre } from '../utils/genreVoicing'
import type { NoteNaming } from '../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import SpeedControl from './SpeedControl'
import OrfeoMark from './OrfeoMark'
import Tooltip from './Tooltip'
import { getPianoRollCenterX, modalTopAboveKeyboard } from '../utils/modalAnchors'
import { startModalDrag, type ModalPos } from '../utils/modalDrag'
import { useKeepBottomOnScreen } from '../hooks/useKeepBottomOnScreen'
import { useClampPositionOnZoom } from '../hooks/useClampPositionOnZoom'
import { buildChordMidi, formatChordSuffix, formatInversionDisplay, ordinalSuffix } from '../utils/chordDetection'
import {
  nextVoicing, intervalsToSemis, rootPositionFrom,
  PROGRESSION_VOICINGS, PROGRESSION_VOICING_LABEL, PROGRESSION_VOICING_HINT,
} from '../utils/voiceLeading'
import {
  EXPLORER_RANGE, explorerLowRoot, SPEED_MS, VOICING_ICON, ALL_PROGRESSIONS,
  resolveProgressionStep, nextInversionSet, prevInversionSet, ringChord, strikeStep, inversionOf,
  explorerKeyColors, captureStruckShape, restoreStruckShape, type ProgSpeed, type StruckShape,
  explorerPosInWindow,
} from '../utils/explorerShared'
import ExplorerMenu from './ExplorerMenu'
import ExplorerOctaveControl from './ExplorerOctaveControl'
import { t } from '../utils/i18n'
import '../styles/redesign-tools.css'
import {
  COMMON_CHORDS, ALL_CHORDS, FULL_CHORD_TYPES, type ChordInfo,
} from '../utils/chordVocabulary'

// ── Modal dimensions for default positioning above the keyboard ───────────
const MODAL_WIDTH = 1180
const MODAL_HEIGHT = 520
const modalWidth = () => Math.min(MODAL_WIDTH, window.innerWidth - 32)
// Centred on the roll, but the window is wider than the roll can be
const defaultPos = () => explorerPosInWindow({
  x: Math.round(getPianoRollCenterX() - modalWidth() / 2),
  y: modalTopAboveKeyboard(MODAL_HEIGHT, 78),
}, modalWidth(), MODAL_HEIGHT, 44)

const ROOT_MIDIS = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]

// ── Genre voicing descriptions — shared by the Style dropdown's trigger
// tooltip and its two-column list (name left / description right). ─────────
const GENRE_DESCRIPTIONS: Record<Genre, string> = {
  classic:   'Plain diatonic triads',
  coltrane:  'Adds 9ths and 13ths for sophisticated jazz harmony',
  cinematic: 'Open, clean voicings — add9 and suspended chords',
  roadhouse: 'Dominant 7ths on the I and IV chords — classic blues sound',
  gospel:    t`Church harmony — 6/9 and maj9 chords, minor 9ths and 11ths, a 13th on V`,
  ipanema:   t`Smooth 9ths and 11ths, and a tritone substitution on V (D♭7♯11 for G7) — bossa nova character`,
  carnival:  'Bright, festive 7th chords — samba character',
  flamenco:  t`Phrygian fire — a 7♭9 on V and open maj7♯11 chords, flamenco guitar colours`,
  velvet:    'Deep 11ths and 13ths, mellow and laid-back — neo-soul character',
}

// ── Easter egg — the "Rite of Spring" chord (Stravinsky, 1913): an E♭7
// stacked on an F♭ major triad, struck as a pounding pulse. ────────────────
const RITE_LOW = [40, 47, 52, 56]    // F♭ major — F♭2 C♭3 F♭3 A♭3
const RITE_HIGH = [63, 67, 70, 73]   // E♭7 — E♭4 G4 B♭4 D♭5
const RITE_PULSES = 8
const RITE_PULSE_MS = 300
const RITE_VELOCITY = 0.9

// The card fills, cycling through the tiles
const TILE_FILLS = ['var(--paint-lime)', 'var(--paint-yellow)', 'var(--paint-blue)', 'var(--sand)', 'var(--paint-rose)', 'var(--paint-olive)']

export default function ChordExplorer() {
  const chordExplorerOpen       = useStore(s => s.chordExplorerOpen)
  const chordExplorerMinimized  = useStore(s => s.chordExplorerMinimized)
  const setChordExplorerOpen    = useStore(s => s.setChordExplorerOpen)
  const setScaleExplorerOpen    = useStore(s => s.setScaleExplorerOpen)
  const explorerKeys = useStore(s => s.explorerKeys)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const clearDisplayedChord = useStore(s => s.clearDisplayedChord)
  const clearLockedKeys = useStore(s => s.clearLockedKeys)
  const setExplorerChordDisplay = useStore(s => s.setExplorerChordDisplay)
  const clearExplorerChordDisplay = useStore(s => s.clearExplorerChordDisplay)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const chordNamingStyle = useStore(s => s.chordNamingStyle)
  const explorerPausesPlayback = useStore(s => s.explorerPausesPlayback)
  const progressionVoicing = useStore(s => s.progressionVoicing)
  const setProgressionVoicing = useStore(s => s.setProgressionVoicing)
  const setAccidentals = useStore(s => s.setAccidentals)
  const explorerOctave = useStore(s => s.explorerOctave)
  const colorRootNoteEnabled = useStore(s => s.colorRootNoteEnabled)
  const setColorRootNoteEnabled = useStore(s => s.setColorRootNoteEnabled)
  // ── Root whose pitch class is accented on the lit keys right now — kept so
  // flipping "Accent root note" recolors what's already on the keyboard. ──
  const accentRootRef = useRef<number | null>(null)
  // ── Shape the inversion ↺ returns to (null until an arrow is pressed) ──
  const struckShapeRef = useRef<StruckShape | null>(null)
  const [inverted, setInverted] = useState(false)
  const lowRootRef = useRef(explorerLowRoot(explorerOctave))
  lowRootRef.current = explorerLowRoot(explorerOctave)
  // ── Window position — where you last dragged it, else bottom edge on the
  // keyboard header, horizontally centered on the piano roll. Read each time
  // the modal opens, not while it's open (side-panel toggles don't move it);
  // content changing size only moves the bottom edge. ───────────────────────
  const [pos, setPos] = useState(defaultPos)
  const panelRef = useRef<HTMLDivElement>(null)
  useKeepBottomOnScreen(panelRef, setPos, chordExplorerOpen && !chordExplorerMinimized, 44)
  useFocusTrap(panelRef, chordExplorerOpen && !chordExplorerMinimized)
  useClampPositionOnZoom(pos, setPos, panelRef)
  const [selectedRoot, setSelectedRoot] = useState(0)
  const [tier, setTier] = useState<'common' | 'extended' | 'power'>('common')
  const [selectedPowerRoot, setSelectedPowerRoot] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchScope, setSearchScope] = useState<'name' | 'notes' | 'both'>('both')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [handFilter, setHandFilter] = useState<'all' | 'one' | 'two'>('all')
  const [noteFilter, setNoteFilter] = useState<'any' | '3' | '4' | '5' | '6+'>('any')
  const [selectedProg, setSelectedProg] = useState<number | null>(null)
  const [progDropdownOpen, setProgDropdownOpen] = useState(false)
  const [progPlaying, setProgPlaying] = useState(false)
  const [progStep, setProgStep] = useState(0)
  const [progSpeed, setProgSpeed] = useState<ProgSpeed>('med')
  const [progGenre, setProgGenre] = useState<Genre>('classic')
  // ── Easter egg card open + the timers of its pounding pulse ──────────────
  const [riteOpen, setRiteOpen] = useState(false)
  const riteTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const explorerChordDisplay = useStore(s => s.explorerChordDisplay)
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progRunningRef = useRef(false)
  const progTriggerRef = useRef<HTMLButtonElement>(null)
  const styleTriggerRef = useRef<HTMLButtonElement>(null)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // ── Light keys with the shared colour rule (same as the Scales Explorer):
  // amber, the chord's own root pink when "Accent root note" is on. ───────
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
    if (!chordExplorerOpen) return
    const lit = Array.from(useStore.getState().explorerKeys)
    if (lit.length > 0) lightKeys(lit, accentRootRef.current, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorRootNoteEnabled])

  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
    riteTimersRef.current.forEach(clearTimeout)
    riteTimersRef.current = []
  }, [])

  // Reset transient state on open; no keyboard size change (61 is for ScaleExplorer only).
  useEffect(() => {
    if (chordExplorerOpen) {
      const kept = useStore.getState().explorerPositions.chord
      setPos(kept ? explorerPosInWindow(kept, modalWidth(), MODAL_HEIGHT, 44) : defaultPos())
      setSearch('')
      setSearchOpen(false)
      setHandFilter('all')
      setNoteFilter('any')
      stopProgression()
      setSelectedProg(null)
      setProgDropdownOpen(false)
      setSelectedPowerRoot(null)
      setRiteOpen(false)
    } else {
      stopProgression()
    }
  }, [chordExplorerOpen, stopProgression])

  // Pause playback when modal opens (unless switched off: Settings › Playback)
  useEffect(() => {
    if (!chordExplorerOpen) return
    const { playbackState, explorerPausesPlayback } = useStore.getState()
    if (playbackState === 'playing' && explorerPausesPlayback) {
      ;(window as any).__orfeoPlayer?.pause?.()
      useStore.setState({ playbackState: 'paused' })
    }
  }, [chordExplorerOpen])

  const close = useCallback(() => {
    stopProgression()
    clearExplorerKeys()
    clearExplorerChordDisplay()
    setChordExplorerOpen(false)
    setSelectedKey(null)
  }, [stopProgression, clearExplorerKeys, clearExplorerChordDisplay, setChordExplorerOpen])

  useEffect(() => {
    if (!chordExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (progDropdownOpen) { setProgDropdownOpen(false); return }
        if (styleDropdownOpen) { setStyleDropdownOpen(false); return }
        if (riteOpen) { setRiteOpen(false); return }
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chordExplorerOpen, close, progDropdownOpen, styleDropdownOpen, riteOpen])

  const closeProgMenu = useCallback(() => setProgDropdownOpen(false), [])
  const closeStyleMenu = useCallback(() => setStyleDropdownOpen(false), [])
  const closeSearch = () => { setSearch(''); setSearchOpen(false) }

  const rootLabels = useMemo(() =>
    ROOT_MIDIS.map(midi => ({
      pitchClass: midi % 12,
      label: getNoteName(midi, displayNaming, accidentals),
    })),
    [displayNaming, accidentals]
  )

  const tierChords = tier === 'common' ? COMMON_CHORDS : ALL_CHORDS

  // ── Clear search whenever the user switches tiers ─────────────────────────
  // On entering Power mode: also clear any previously selected chord so
  // Play Inversion buttons are visually disabled and explorer keys are reset.
  useEffect(() => {
    setSearch('')
    setSearchOpen(false)
    if (tier === 'power') {
      setSelectedKey(null)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    }
  }, [tier, clearExplorerKeys, clearExplorerChordDisplay])

  // ── One searchable record per chord — shared shape for both the curated
  // tier's own list and the FULL_CHORD_TYPES fallback below. Rebuilt
  // whenever the source list, root, naming system, or accidentals change so
  // that displayed names, note spellings, and numeric tokens stay in sync.
  // typeName is the bare suffix without root so name-scope search is
  // root-independent. ────────────────────────────────────────────────────
  const buildSearchable = useCallback((chords: ChordInfo[]) =>
    chords.map(chord => {
      const styledSuffix = formatChordSuffix(chord.suffix, chordNamingStyle)
      return {
        chord,
        display: `${rootLabels.find(r => r.pitchClass === selectedRoot)?.label ?? ''}${styledSuffix}`,
        typeName: styledSuffix,
        aliases: chord.aliases,
        notes: buildChordMidi(selectedRoot, chord.intervals, 61)
          .map(m => getNoteName(m, displayNaming, accidentals)).filter(Boolean).join(' '),
        numerics: (styledSuffix + ' ' + chord.aliases.join(' ')).match(/\d+/g)?.join(' ') ?? '',
      }
    }),
    [selectedRoot, rootLabels, displayNaming, accidentals, chordNamingStyle]
  )

  const searchableChords = useMemo(() => buildSearchable(tierChords), [tierChords, buildSearchable])
  // ── Fallback searchable set — the full tonal.js dictionary, independent of
  // tier/curation. Only ever queried when a search comes up empty against
  // the curated tier (see filteredChords below), so normal curated search
  // results are never diluted by obscure dictionary entries. ────────────────
  const searchableChordsFallback = useMemo(() => buildSearchable(FULL_CHORD_TYPES), [buildSearchable])

  // ── Fuse instances — keys vary by scope; rebuilt when data or scope changes ─
  // aliases excluded: tonal.js aliases contain long English words ("minor",
  // "dominant") that produce spurious matches for single letters like n/o/i/u.
  const fuseKeys = useMemo(() =>
    searchScope === 'name'  ? ['typeName', 'numerics'] :
    searchScope === 'notes' ? ['notes'] :
    /* both */                ['display', 'typeName', 'notes', 'numerics'],
    [searchScope]
  )
  const fuseOpts = { threshold: 0.2, includeScore: true, minMatchCharLength: 1, ignoreLocation: true, useExtendedSearch: false }
  const fuseInstance = useMemo(() => new Fuse(searchableChords, { keys: fuseKeys, ...fuseOpts }), [searchableChords, fuseKeys])
  const fuseInstanceFallback = useMemo(() => new Fuse(searchableChordsFallback, { keys: fuseKeys, ...fuseOpts }), [searchableChordsFallback, fuseKeys])

  // ── Filter chords: Fuse search + note-count + hand-span filters ───────────
  const filteredChords = useMemo(() => {
    let result: ChordInfo[]

    if (searchOpen && search.trim()) {
      const curated = fuseInstance.search(search.trim()).map(r => r.item.chord)
      // ── Curated tier has nothing — fall back to the full tonal.js
      // dictionary rather than showing "no results" for a chord that
      // genuinely exists (e.g. an obscure altered type nobody curated
      // into a tile). ─────────────────────────────────────────────────
      result = curated.length > 0 ? curated : fuseInstanceFallback.search(search.trim()).map(r => r.item.chord)
    } else {
      result = tierChords
    }

    if (noteFilter !== 'any') {
      result = result.filter(c => {
        const n = c.intervals.length
        if (noteFilter === '3') return n === 3
        if (noteFilter === '4') return n === 4
        if (noteFilter === '5') return n === 5
        return n >= 6
      })
    }

    if (handFilter !== 'all') {
      result = result.filter(c => {
        const midiNotes = buildChordMidi(selectedRoot, c.intervals, 61)
        if (midiNotes.length === 0) return false
        const span = Math.max(...midiNotes) - Math.min(...midiNotes)
        const isOne = span <= 12 && midiNotes.length <= 5
        return handFilter === 'one' ? isOne : !isOne
      })
    }

    return result
  }, [tierChords, search, searchOpen, noteFilter, handFilter, selectedRoot, fuseInstance, fuseInstanceFallback])

  // ── Recursive progression step player ───────────────────────────────────
  // prevMidi: the voicing played at the previous step — the voice-leading
  // engine (utils/voiceLeading.ts) picks this step's voicing from it, under
  // the shared `progressionVoicing` mode (read live so a mode switch mid-run
  // takes on the next chord). Null for the first step.
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    root: number,
    speed: ProgSpeed,
    genre: Genre,
    prevMidi: number[] | null,
  ) => {
    if (!progRunningRef.current) return
    const prog = ALL_PROGRESSIONS[progIndex]
    if (!prog) return
    // ── Same step → chord rule as the Scales Explorer (explorerShared.ts):
    // the numeral as written, re-voiced for the selected style. ────────────
    const resolved = resolveProgressionStep(prog, step, root, genre)
    if (!resolved) return
    const { rootPc: actualRoot, info } = resolved
    const durationMs = SPEED_MS[speed]
    const semis = intervalsToSemis(info.intervals)

    const midiNotes = nextVoicing(
      prevMidi, actualRoot, semis,
      useStore.getState().progressionVoicing, EXPLORER_RANGE, lowRootRef.current,
    )

    if (midiNotes.length > 0) {
      lightKeys(midiNotes, actualRoot)
      // ── Update chord name display above keyboard for this step ───────────
      const rootLbl = rootLabels.find(r => r.pitchClass === actualRoot)?.label ?? ''
      const chordSuffix = formatChordSuffix(info.suffix, chordNamingStyle)
      setExplorerChordDisplay({ name: `${rootLbl}${chordSuffix}`, invCount: inversionOf(actualRoot, semis, midiNotes), noteCount: midiNotes.length })
      strikeStep(midiNotes, Math.round(durationMs * 1.12), () => progRunningRef.current)
    }
    setProgStep(step)

    const nextStep = (step + 1) % prog.offsets.length
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, root, speed, genre, midiNotes)
    }, durationMs)
  }, [lightKeys, setExplorerChordDisplay, rootLabels, chordNamingStyle])

  const startProgression = useCallback(() => {
    if (selectedProg === null) return
    stopProgression()
    progRunningRef.current = true
    setProgPlaying(true)
    setProgStep(0)
    playProgStepAt(0, selectedProg, selectedRoot, progSpeed, progGenre, null)
  }, [selectedProg, selectedRoot, progSpeed, progGenre, stopProgression, playProgStepAt])

  // ── Spacebar plays/pauses the progression while this modal is open ────────
  useEffect(() => {
    if (!chordExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (selectedProg === null) return
      e.preventDefault()
      if (progPlaying) stopProgression(); else startProgression()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chordExplorerOpen, selectedProg, progPlaying, stopProgression, startProgression])

  const playChordAt = useCallback((chordKey: string, rootPitchClass: number) => {
    stopProgression()
    // ── FULL_CHORD_TYPES fallback: chordKey can come from a filteredChords
    // tile that fell back to the full dictionary (see filteredChords below),
    // or from the seed-match effect's own fallback — not just the curated
    // ALL_CHORDS list. ─────────────────────────────────────────────────────
    const info = ALL_CHORDS.find(c => c.key === chordKey) ?? FULL_CHORD_TYPES.find(c => c.key === chordKey)
    if (!info) return
    // ── Root position, root in the octave the Octave control picks (C3–B3
    // by default) — the same starting register the Scales Explorer uses.
    // In Smooth, a tile clicked while another chord is lit takes the nearest
    // voicing to it instead, the same way a Smooth progression moves. ──────
    const semis = intervalsToSemis(info.intervals)
    const lit = Array.from(useStore.getState().explorerKeys).sort((a, b) => a - b)
    const smooth = useStore.getState().progressionVoicing === 'smooth' && lit.length > 0
    const midiNotes = smooth
      ? nextVoicing(lit, rootPitchClass, semis, 'smooth', EXPLORER_RANGE, lowRootRef.current)
      : rootPositionFrom(rootPitchClass, semis, EXPLORER_RANGE, lowRootRef.current)
    if (midiNotes.length === 0) return
    lightKeys(midiNotes, rootPitchClass)
    setSelectedKey(chordKey)
    // ── Store chord identity in Zustand so Keyboard.tsx can display it ────
    const chordName = `${rootLabels.find(r => r.pitchClass === rootPitchClass)?.label ?? ''}${formatChordSuffix(info.suffix, chordNamingStyle)}`
    setExplorerChordDisplay({ name: chordName, invCount: inversionOf(rootPitchClass, semis, midiNotes), noteCount: midiNotes.length })
    ringChord(midiNotes)
  }, [stopProgression, lightKeys, rootLabels, chordNamingStyle])

  // ── Consume a "open pre-seeded with this chord" signal from the playback
  // chord-display context menu (Keyboard.tsx) — matched by interval-array
  // equality against our own catalog rather than a key string, since the
  // detector's raw chord type may use a different tonal.js alias than the
  // one this catalog happens to be keyed by. One-shot: cleared immediately
  // whether or not a match was found, so it never re-fires on its own. ─────
  useEffect(() => {
    if (!chordExplorerOpen) return
    const seed = useStore.getState().pendingChordExplorerSeed
    if (!seed) return
    useStore.getState().setPendingChordExplorerSeed(null)

    // ── Root always follows the seed, match or not — same root the playback
    // display and "Show on keyboard" already agreed on, independent of
    // whether this catalog happens to have a tile for the chord's type. ─────
    setSelectedRoot(seed.rootPitchClass)

    const intervalsMatch = (c: ChordInfo) =>
      c.intervals.length === seed.intervals.length && c.intervals.every((iv, i) => iv === seed.intervals[i])
    const match = ALL_CHORDS.find(intervalsMatch) ?? FULL_CHORD_TYPES.find(intervalsMatch)
    if (!match) return

    if (!COMMON_CHORDS.some(c => c.key === match.key)) setTier('extended')

    // ── When the seed carries a real voicing (from the paused MIDI playhead),
    // restore that exact inversion + register instead of playChordAt's
    // canonical root-position octave-4 rebuild — octave-folded into the
    // Explorer keyboard's 61-key range so every note stays visible. ─────────
    if (seed.voicing && seed.voicing.length >= 2) {
      stopProgression()
      const { min, max } = EXPLORER_RANGE
      const fold = (m: number) => { while (m < min) m += 12; while (m > max) m -= 12; return m }
      const voiced = Array.from(new Set(seed.voicing.map(fold))).sort((a, b) => a - b)
      setSelectedKey(match.key)
      lightKeys(voiced, seed.rootPitchClass)
      const rootLbl = rootLabels.find(r => r.pitchClass === seed.rootPitchClass)?.label ?? ''
      setExplorerChordDisplay({
        name: `${rootLbl}${formatChordSuffix(match.suffix, chordNamingStyle)}`,
        invCount: seed.inversionCount ?? 0,
        noteCount: new Set(voiced.map(m => m % 12)).size,
      })
      ringChord(voiced)
    } else {
      playChordAt(match.key, seed.rootPitchClass)
    }
  }, [chordExplorerOpen, playChordAt, stopProgression, rootLabels, chordNamingStyle, lightKeys, setExplorerChordDisplay])

  // ── Play a power chord (root + P5) for the given pitch class ─────────────
  const playPowerChord = useCallback((pitchClass: number) => {
    stopProgression()
    setSelectedPowerRoot(pitchClass)
    const midiNotes = rootPositionFrom(pitchClass, [0, 7], EXPLORER_RANGE, lowRootRef.current)
    lightKeys(midiNotes, pitchClass)
    const rootLbl = rootLabels.find(r => r.pitchClass === pitchClass)?.label ?? ''
    setExplorerChordDisplay({ name: `${rootLbl}5`, invCount: 0, noteCount: midiNotes.length })
    ringChord(midiNotes)
  }, [stopProgression, lightKeys, rootLabels, setExplorerChordDisplay])

  // ── Easter egg — light and pound the Rite of Spring chord ─────────────────
  const playRiteChord = useCallback(() => {
    stopProgression()
    setSelectedKey(null)
    setSelectedPowerRoot(null)
    const notes = [...RITE_LOW, ...RITE_HIGH]
    lightKeys(notes, RITE_LOW[0] % 12)
    setExplorerChordDisplay({ name: t`E♭7 over F♭`, invCount: 0, noteCount: notes.length })
    const playNote = (window as any).__orfeoPlayNote
    if (!playNote) return
    for (let i = 0; i < RITE_PULSES; i++) {
      const last = i === RITE_PULSES - 1
      riteTimersRef.current.push(setTimeout(() => {
        notes.forEach(m => playNote(m, RITE_VELOCITY, last ? 2600 : RITE_PULSE_MS - 40, undefined, false))
      }, i * RITE_PULSE_MS))
    }
  }, [stopProgression, lightKeys, setExplorerChordDisplay])

  const clearSelection = () => {
    stopProgression()
    clearExplorerKeys(); clearDisplayedChord(); clearLockedKeys(); clearExplorerChordDisplay()
    setSelectedKey(null); setSelectedPowerRoot(null)
    struckShapeRef.current = null; setInverted(false)
  }

  const handleRootChange = (pitchClass: number) => {
    stopProgression()
    setSelectedRoot(pitchClass)
    setSearch('')
    setSearchOpen(false)
    setHandFilter('all')
    setNoteFilter('any')
    if (selectedKey !== null) playChordAt(selectedKey, pitchClass)
  }

  const handleInversion = useCallback((dir: 'prev' | 'next') => {
    if (!selectedKey) return
    const state = useStore.getState()
    const current = state.explorerKeys
    if (current.size === 0) return
    const cd = state.explorerChordDisplay
    struckShapeRef.current = captureStruckShape(struckShapeRef.current, current, cd?.invCount ?? 0, state.explorerOctave)
    setInverted(true)
    const newNotes = dir === 'next' ? nextInversionSet(current) : prevInversionSet(current)
    lightKeys(Array.from(newNotes), accentRootRef.current, true)
    // ── Update inversion count in store so Keyboard.tsx label updates ─────
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount + (dir === 'next' ? 1 : -1) })
    ringChord(Array.from(newNotes).sort((a, b) => a - b))
  }, [selectedKey, lightKeys])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    let moved: ModalPos | null = null
    startModalDrag(e, panelRef.current, pos, next => setPos(moved = next), () => {
      if (moved) useStore.getState().setExplorerPosition('chord', moved)
    })
  }

  const rootLabel = (pc: number) => rootLabels.find(r => r.pitchClass === pc)?.label ?? ''

  // ── What's lit right now, low to high, and its name with inversion marks —
  // the display row under the progressions. ─────────────────────────────────
  const litNotes = useMemo(() => Array.from(explorerKeys).sort((a, b) => a - b), [explorerKeys])
  const nowPlaying = useMemo(() => {
    if (!explorerChordDisplay || litNotes.length === 0) return null
    return formatInversionDisplay(
      explorerChordDisplay.name, explorerChordDisplay.invCount, explorerChordDisplay.noteCount,
      litNotes[0], displayNaming, accidentals, true,
    )
  }, [explorerChordDisplay, litNotes, displayNaming, accidentals])

  // Closed (open=false): unmount entirely. Minimized (open=true, minimized=true): render but hide.
  if (!chordExplorerOpen) return null

  const isPowerMode = tier === 'power'
  const canClear = selectedKey !== null || selectedPowerRoot !== null || explorerKeys.size > 0 || progPlaying
  const activeProg = selectedProg !== null ? ALL_PROGRESSIONS[selectedProg] : null
  const nowName = nowPlaying ? nowPlaying.chordLabel : rootLabel(selectedRoot)

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Chords Explorer" data-instant className="orfeo-modal-glow app-no-drag touch-explorer theme-studio xp-window xp-chords" style={{
      left: pos.x,
      top: pos.y,
      zIndex: 401,
      display: chordExplorerMinimized ? 'none' : 'flex',
      '--_modal-shadow': 'var(--elevation-modal)',
    } as CSSProperties}>

      {/* Header — draggable */}
      <div className="xp-head" onPointerDown={startDrag}>
        {/* Easter egg — the logo is a hidden link to the Rite of Spring chord.
            Out of the Tab order: the focus trap would otherwise land on it
            when the window opens (outline + Space/Enter opening the card). */}
        <Tooltip title={t`A chord that shook the world`} description={t`Click to discover`}>
          <button
            tabIndex={-1}
            className="xp-logo"
            onClick={() => { setRiteOpen(true); playRiteChord() }}
            aria-label={t`Easter egg`}
          ><OrfeoMark height={22} /></button>
        </Tooltip>
        <div className="xp-seg" data-accent role="group" aria-label={t`Explorers`}>
          <button aria-pressed={true}>{t`Chords`}</button>
          <button aria-pressed={false} onClick={() => { setChordExplorerOpen(false); setScaleExplorerOpen(true) }}>{t`Scales`}</button>
        </div>
        {explorerPausesPlayback && !searchOpen && <span className="xp-note xp-head-note">{t`The song is paused while you explore`}</span>}
        <div className="o-spacer" />
        {/* ── Search scope toggle — visible while searching ───────────────── */}
        {searchOpen && (
          <div className="xp-seg" role="group" aria-label={t`Search in`}>
            {(['name', 'notes', 'both'] as const).map(scope => (
              <Tooltip
                key={scope}
                title={scope === 'name' ? 'Search by name' : scope === 'notes' ? 'Search by notes' : 'Search both'}
                description={
                  scope === 'name'  ? 'Matches chord names and types, like m7, maj7, dim…' :
                  scope === 'notes' ? 'Matches note names in the chord for the selected root' :
                  'Matches chord names and note names together'
                }
              >
                <button aria-pressed={searchScope === scope} onClick={() => setSearchScope(scope)}>
                  {scope === 'name' ? 'Name' : scope === 'notes' ? 'Notes' : 'Both'}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
        <label className="xp-search" style={{ opacity: isPowerMode ? 0.45 : 1 }}>
          <Search size={16} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            disabled={isPowerMode}
            onFocus={() => setSearchOpen(true)}
            onChange={e => { setSearch(e.target.value); setSearchOpen(true) }}
            placeholder={isPowerMode ? t`Search is off in Power` : t`Find a chord: name or notes`}
            aria-label={t`Find a chord by name or notes`}
          />
          {searchOpen && <button aria-label={t`Close search`} onClick={e => { e.preventDefault(); closeSearch() }}><X size={16} /></button>}
        </label>
        <button className="o-close" aria-label={t`Close`} onClick={close}><X size={18} /></button>
      </div>

      <div className="xp-chords-body amber-scroll">
        <section className="xp-chords-main">
          {/* ── Root — 12 pitch-class pills ──────────────────────────────────── */}
          <div className="xp-roots" role="group" aria-label={t`Root note`}>
            {rootLabels.map(({ pitchClass, label }) => (
              <button key={pitchClass} aria-pressed={selectedRoot === pitchClass} onClick={() => handleRootChange(pitchClass)}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Filters — family, hand, note count ───────────────────────────── */}
          <div className="xp-filters">
            <div className="xp-seg" role="group" aria-label={t`Chord family`}>
              {(['common', 'extended', 'power'] as const).map(fam => (
                <Tooltip
                  key={fam}
                  title={fam === 'common' ? 'Common' : fam === 'power' ? 'Power' : 'Extended'}
                  description={
                    fam === 'common' ? 'Triads, sevenths, everyday voicings' :
                    fam === 'power'  ? 'Root + fifth, one per pitch class' :
                                       '9ths, 11ths, 13ths, altered tensions'
                  }
                >
                  <button aria-pressed={tier === fam} onClick={() => setTier(fam)}>
                    {fam === 'common' ? 'Common' : fam === 'power' ? 'Power' : 'Extended'}
                  </button>
                </Tooltip>
              ))}
            </div>

            <div className="xp-filter" style={{ opacity: isPowerMode ? 0.45 : 1, pointerEvents: isPowerMode ? 'none' : 'auto' }}>
              <span className="xp-note">{t`Hand`}</span>
              <div className="xp-seg" role="group" aria-label={t`Hand`}>
                <Tooltip title="All" description="Chords playable with either hand">
                  <button aria-pressed={handFilter === 'all'} onClick={() => setHandFilter('all')}>All</button>
                </Tooltip>
                <Tooltip title="One hand" description="Chords playable with a single hand">
                  <button aria-pressed={handFilter === 'one'} aria-label={t`One hand`} onClick={() => setHandFilter('one')}>
                    <span style={{ display: 'inline-flex', transform: 'rotate(-20deg)' }}><Hand size={15} /></span>
                  </button>
                </Tooltip>
                <Tooltip title="Two hands" description="Chords that need both hands">
                  <button aria-pressed={handFilter === 'two'} aria-label={t`Two hands`} onClick={() => setHandFilter('two')} style={{ gap: 0 }}>
                    <span style={{ display: 'inline-flex', transform: 'rotate(20deg)' }}><Hand size={15} /></span>
                    <span style={{ display: 'inline-flex', transform: 'scaleX(-1) rotate(20deg)' }}><Hand size={15} /></span>
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="xp-filter" style={{ opacity: isPowerMode ? 0.45 : 1, pointerEvents: isPowerMode ? 'none' : 'auto' }}>
              <span className="xp-note">{t`Notes`}</span>
              <div className="xp-seg" role="group" aria-label={t`Notes in the chord`}>
                {(['any', '3', '4', '5', '6+'] as const).map(n => (
                  <Tooltip
                    key={n}
                    oneLine
                    title={n === 'any' ? 'Chords regardless of note count' : n === '6+' ? 'Chords with 6 or more notes' : `Chords with exactly ${n} notes`}
                  >
                    <button aria-pressed={noteFilter === n} onClick={() => setNoteFilter(n)}>{n === 'any' ? 'Any' : n}</button>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>

          {/* Results grid — power chord tiles when tier === 'power', chord grid otherwise */}
          <div className="xp-tiles">
            {isPowerMode ? (
              // ── 12 power chord tiles, one per pitch class C–B ─────────────────
              ROOT_MIDIS.map((midi, i) => {
                const pc = midi % 12
                const rootMidi = pc + 60
                const fifthMidi = rootMidi + 7
                const rootName = getNoteName(rootMidi, displayNaming, accidentals)
                const fifthName = getNoteName(fifthMidi, displayNaming, accidentals)
                return (
                  <button key={pc} className="xp-tile" aria-pressed={selectedPowerRoot === pc} style={{ background: TILE_FILLS[i % TILE_FILLS.length] }} onMouseDown={() => playPowerChord(pc)}>
                    <span className="xp-tile-name">{rootName}5</span>
                    <span className="xp-tile-note">{rootName} {fifthName}</span>
                  </button>
                )
              })
            ) : (
              // ── Standard chord grid ────────────────────────────────────────────
              <>
                {filteredChords.map((chord, i) => {
                  const isSel = selectedKey === chord.key
                  const midiNotes = buildChordMidi(selectedRoot, chord.intervals, 61)
                  const noteNames = midiNotes
                    .map(m => getNoteName(m, displayNaming, accidentals))
                    .filter(Boolean)
                    .join(' ')
                  const chordLabel = `${rootLabel(selectedRoot)}${formatChordSuffix(chord.suffix, chordNamingStyle)}`
                  const showRoman = progPlaying && selectedProg !== null && isSel

                  return (
                    <button key={chord.key} className="xp-tile" aria-pressed={isSel} style={{ background: TILE_FILLS[i % TILE_FILLS.length] }} onMouseDown={() => playChordAt(chord.key, selectedRoot)}>
                      {/* ── Current roman numeral during progression playback ── */}
                      {showRoman && <span className="xp-tile-roman">{ALL_PROGRESSIONS[selectedProg!].labels[progStep]}</span>}
                      <span className="xp-tile-name">{chordLabel || rootLabel(selectedRoot)}</span>
                      <span className="xp-tile-note">{noteNames || chord.name}</span>
                    </button>
                  )
                })}

                {filteredChords.length === 0 && <div className="xp-empty">{t`No results`}</div>}
              </>
            )}
          </div>
        </section>

        {/* ── The chord sounding now, and what acts on it ───────────────────── */}
        <aside className="theme-paper xp-aside">
          <div className="xp-now">
            <div className="xp-disc" style={{ fontSize: nowName.length <= 3 ? 34 : nowName.length <= 6 ? 24 : 16 }}>{nowName}</div>
            <div className="xp-now-text">
              <span className="xp-now-long">
                {nowPlaying?.ordinal
                  ? <>{nowPlaying.ordinal}{ordinalSuffix(Number(nowPlaying.ordinal))} {t`inversion`}</>
                  : nowPlaying ? t`Root position` : t`Tap a chord`}
              </span>
              <span className="xp-note">{litNotes.map(m => getNoteName(m, displayNaming, accidentals)).join(' · ')}</span>
            </div>
          </div>

          <div className="xp-row" style={{ opacity: isPowerMode ? 0.45 : 1, pointerEvents: isPowerMode ? 'none' : 'auto' }}>
            <span>{t`Inversion`}</span>
            <div className="xp-row-ctl">
              <Tooltip oneLine title="Previous inversion">
                <button className="o-icon-btn" aria-label={t`Previous inversion`} onMouseDown={() => handleInversion('prev')} disabled={!selectedKey}><ChevronLeft size={18} /></button>
              </Tooltip>
              <Tooltip oneLine title="Next inversion">
                <button className="o-icon-btn" aria-label={t`Next inversion`} onMouseDown={() => handleInversion('next')} disabled={!selectedKey}><ChevronRight size={18} /></button>
              </Tooltip>
              <Tooltip oneLine title={t`Reset inversion`}>
                <button className="o-icon-btn" aria-label={t`Reset inversion`} onClick={resetInversion} disabled={!inverted}><RotateCcw size={15} /></button>
              </Tooltip>
            </div>
          </div>

          <div className="xp-row">
            <span>{t`Octave`}</span>
            <ExplorerOctaveControl showLabel={false} />
          </div>

          <div className="xp-row">
            <span>{t`Show as`}</span>
            <div className="o-seg" role="group" aria-label={t`Show as`}>
              {(['flat', 'sharp'] as const).map(a => (
                <button key={a} aria-pressed={accidentals === a} aria-label={a === 'flat' ? t`Flats` : t`Sharps`} onClick={() => setAccidentals(a)}>
                  {a === 'flat' ? '♭' : '♯'}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Root (same setting as the Scales Explorer's) */}
          <div className="xp-row">
            <span>{t`Accent root`}</span>
            <Tooltip title="Accent Root Note" description="Highlights the chord's true root pitch class in pink, in any octave, instead of blending it.">
              <button role="switch" aria-checked={colorRootNoteEnabled} aria-label={t`Accent root note`} className="o-switch" onClick={() => setColorRootNoteEnabled(!colorRootNoteEnabled)}><span /></button>
            </Tooltip>
          </div>

          {/* Clear — stops a progression, turns the lit chord off, deselects its tile */}
          <Tooltip oneLine title={t`Clear selection`} wrapperStyle={{ alignSelf: 'flex-start' }}>
            <button className="o-btn-quiet" style={{ height: 36, paddingLeft: 0, color: 'var(--ui-text)', cursor: 'pointer' }} onClick={clearSelection} disabled={!canClear}>{t`Clear`}</button>
          </Tooltip>
        </aside>
      </div>

      {/* ── Sequence — progression, its numerals, style, voicing, speed, play ── */}
      <section className="xp-seq" aria-label={t`Sequence`} style={{ opacity: isPowerMode ? 0.45 : 1, pointerEvents: isPowerMode ? 'none' : 'auto' }}>
        <span className="xp-note">{t`Sequence`}</span>
        <button ref={progTriggerRef} className="xp-pick" aria-haspopup="listbox" aria-expanded={progDropdownOpen} onClick={() => setProgDropdownOpen(v => !v)}>
          <span>{activeProg ? activeProg.name : t`Select`}</span><ChevronDown size={14} />
        </button>
        {activeProg && (
          <Tooltip title="Clear progression" description="Stops playback and clears the selected progression">
            <button className="o-btn-quiet" style={{ color: '#fff', cursor: 'pointer' }} onClick={() => { stopProgression(); setSelectedProg(null) }}>{t`Clear`}</button>
          </Tooltip>
        )}
        <div className="xp-chips">
          {activeProg?.labels.map((label, i) => (
            <span key={i} className="xp-chip" data-on={i === progStep && progPlaying ? '' : undefined}>{label}</span>
          ))}
        </div>
        <Tooltip oneLine title={GENRE_DESCRIPTIONS[progGenre]}>
          <button ref={styleTriggerRef} className="xp-pick" aria-haspopup="listbox" aria-expanded={styleDropdownOpen} onClick={() => setStyleDropdownOpen(v => !v)}>
            <span>{t`Style`}: {GENRE_LABELS[progGenre]}</span><ChevronDown size={14} />
          </button>
        </Tooltip>
        <div className="xp-seg" data-tile role="group" aria-label={t`Chord voicing`}>
          {PROGRESSION_VOICINGS.map(v => {
            const Icon = VOICING_ICON[v]
            return (
              <Tooltip key={v} oneLine title={`${PROGRESSION_VOICING_LABEL[v]} — ${PROGRESSION_VOICING_HINT[v]}`}>
                <button aria-pressed={progressionVoicing === v} aria-label={PROGRESSION_VOICING_LABEL[v]} style={{ padding: 0 }} onClick={() => setProgressionVoicing(v)}><Icon size={16} /></button>
              </Tooltip>
            )
          })}
        </div>
        <SpeedControl value={progSpeed} onChange={setProgSpeed} size={11} />
        <button
          className="xp-play"
          aria-label={progPlaying ? t`Stop` : t`Play sequence`}
          onClick={() => progPlaying ? stopProgression() : startProgression()}
          disabled={selectedProg === null && !progPlaying}
        >
          {progPlaying ? <Square size={16} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
        </button>
      </section>

      {/* Easter egg card — over the tiles, opened from the header logo */}
      {riteOpen && (
        <div role="note" className="theme-paper xp-rite">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-xl)', letterSpacing: '-0.03em' }}>{t`The Rite of Spring chord`}</div>
              <div className="xp-note">{t`Igor Stravinsky, 1913`}</div>
            </div>
            <button className="o-close" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ui-text)', cursor: 'pointer' }} onClick={() => setRiteOpen(false)} aria-label={t`Close`}><X size={18} /></button>
          </div>
          <p style={{ textWrap: 'pretty' } as CSSProperties}>
            {t`He wrote an E♭ dominant 7 chord directly on top of an F♭ major triad. Played by a full orchestral string section, it makes a legendary, heavy, jarring crunch that changed modern music forever. Here's how it sounds on piano.`}
          </p>
          <button className="o-btn-primary" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-accent)', cursor: 'pointer' }} onClick={playRiteChord}>
            <Play size={14} fill="currentColor" strokeWidth={0} />{t`Play again`}
          </button>
        </div>
      )}

      {/* Progression list — base progressions with their rotations under them */}
      {progDropdownOpen && (
        <ExplorerMenu trigger={progTriggerRef} width={340} onClose={closeProgMenu}>
          {ALL_PROGRESSIONS.map((p, i) => {
            const isRot = !!p.isRotation
            const rotLabel = isRot ? p.name.replace(p.baseName! + ' ', '') : ''
            return (
              <button key={p.name} data-rotation={isRot ? '' : undefined} aria-selected={selectedProg === i} onClick={() => { setSelectedProg(i); closeProgMenu() }}>
                <span>{isRot ? `↳ ${rotLabel}` : p.name}</span>
                <span>{p.labels.join('  ')}</span>
              </button>
            )
          })}
        </ExplorerMenu>
      )}

      {/* Style (genre voicing) list — name left, description right */}
      {styleDropdownOpen && (
        <ExplorerMenu trigger={styleTriggerRef} width={400} onClose={closeStyleMenu}>
          {(Object.keys(GENRE_LABELS) as Genre[]).map(g => (
            <button key={g} aria-selected={progGenre === g} onClick={() => { setProgGenre(g); closeStyleMenu() }}>
              <span>{GENRE_LABELS[g]}</span>
              <span>{GENRE_DESCRIPTIONS[g]}</span>
            </button>
          ))}
        </ExplorerMenu>
      )}
    </div>
  )
}
