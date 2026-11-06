// ── Find it in your library: a song on this device that leans on these chords ──
// Reads files already on the device with the app's own chord analysis, and sends
// nothing anywhere. A song costs about half a second of analysis, so each Results
// spends a bounded time on it, after its own page has drawn, and later ones pick
// up the search. Finding nothing hides the card: it never guesses.
import { Note } from 'tonal'
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'
import { base64ToBytes } from '../utils/foreignFormatImport'
import { buildBeatGrid } from '../utils/beatGrid'
import { buildChordSequence } from '../utils/chordSequenceBuilder'
import { pickChordTracks } from '../utils/trackChordRole'
import { libraryDisplayName } from '../utils/libraryNames'
import type { GameResult } from './games'

type Probe = NonNullable<GameResult['probes']>[number]
interface Span { time: number; notes: string[] }
export interface LibraryMatch { path: string; title: string; shared: string[] }

const START_AFTER_MS = 800
const BUDGET_MS = 1500
const MIN_CHORDS = 2
const MIN_SHARE = 0.3
const NAMED = 2
const MIDI_FILE = /\.midi?$/i

const sameChord = (notes: string[], pcs: number[]) => notes.length === pcs.length && notes.every(n => pcs.includes(Note.chroma(n) as number))

// The chords a song shares with a run, most heard first, once they hold enough of it
export function sharedChords(spans: Span[], probes: Probe[]): string[] | null {
  if (spans.length < 2) return null
  const heard = new Map<string, number>()
  for (let i = 0; i + 1 < spans.length; i++) {
    const probe = probes.find(p => sameChord(spans[i].notes, p.pcs))
    if (probe) heard.set(probe.name, (heard.get(probe.name) ?? 0) + spans[i + 1].time - spans[i].time)
  }
  const held = [...heard.values()].reduce((sum, s) => sum + s, 0)
  if (heard.size < MIN_CHORDS || held / (spans[spans.length - 1].time - spans[0].time) < MIN_SHARE) return null
  return [...heard.entries()].sort((a, b) => b[1] - a[1]).slice(0, NAMED).map(([name]) => name)
}

// Each song is read once a session: a second Results picks up where this one stopped
const read = new Map<string, Span[]>()

async function spansOf(path: string, name: string): Promise<Span[]> {
  const known = read.get(path)
  if (known) return known
  const file = await window.electronAPI.loadMidiFromPath(path)
  if (!file) return []
  const midi = parseMidiBuffer(base64ToBytes(file.base64).slice().buffer as ArrayBuffer, name, path)
  const roles = pickChordTracks(midi.tracks)
  const scope = midi.tracks.filter(t => (roles.chordTrackIndices.length ? roles.chordTrackIndices.includes(t.index) : !t.isDrum && t.index !== roles.bassTrackIndex))
  const bass = midi.tracks.find(t => t.index === roles.bassTrackIndex) ?? null
  const events = buildChordSequence(scope, bass, buildBeatGrid(midi), { noteNaming: 'english', accidentals: 'flat', namingStyle: 'abbreviation', transpose: 0 })
  const spans = events.map(({ time, notes }) => ({ time, notes }))
  read.set(path, spans)
  return spans
}

export async function findInLibrary(probes: Probe[], cancelled: () => boolean): Promise<LibraryMatch | null> {
  const { libraryFiles, demoFiles, hideDemoFolder, hiddenLibraryFiles, showHiddenLibraryFiles, librarySongFirst } = useStore.getState()
  const library = hideDemoFolder ? libraryFiles.filter(f => !/[\\/]Demo[\\/]/.test(f.path)) : libraryFiles
  const hidden = new Set(showHiddenLibraryFiles ? [] : hiddenLibraryFiles)
  const files = (library.length || hideDemoFolder ? library : demoFiles).filter(f => MIDI_FILE.test(f.name) && !hidden.has(f.path))
  await new Promise(resolve => setTimeout(resolve, START_AFTER_MS))
  const until = performance.now() + BUDGET_MS
  for (const file of files) {
    if (cancelled() || performance.now() > until) return null
    await new Promise(resolve => setTimeout(resolve))
    const shared = sharedChords(await spansOf(file.path, file.name).catch(() => []), probes)
    if (shared) return { path: file.path, title: libraryDisplayName(file.name, librarySongFirst), shared }
  }
  return null
}
