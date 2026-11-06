import type { Midi } from '@tonejs/midi'
import { getGMGroup } from './gmInstruments'
import { nameHandFromSuffix } from './handMetadata'
import { HAND_ASSIGN_GROUPS } from './keyboardGroups'
import { parseKeySignature, type DetectedKey } from './keyDetection'

// ── A sheet written from the notes ───────────────────────────────────────────
// The Note Editor's sheet is the notes themselves, engraved again after every
// edit, so it can't drift from what plays and needs no alphaTab-to-MIDI matching:
// `heads` says which MIDI notes each printed note came from. Songs converted
// from a score sit exactly on the grid and come back as written; a played
// performance is rounded to sixteenths and reads roughly.
export type SheetNote = { ref: object; midi: number; ticks: number; durationTicks: number }
export type SheetBar = { start: number; end: number; numerator: number; denominator: number; fifths: number }
export type SheetBeat = { value: number; dots: number; triplet: boolean; notes: SheetNote[] | null; tied: boolean }

const ALPHATAB_PPQ = 960
const MAX_VOICES = 4
const FIFTHS_OF_MAJOR = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5] // by semitone above C

const fifthsOf = (key: Pick<DetectedKey, 'semitone' | 'isMinor'>) => FIFTHS_OF_MAJOR[(key.semitone + (key.isMinor ? 3 : 0)) % 12]

// The bars as they're played, repeats unrolled, from the notation file. Notes
// out first: a few OMR files have tie chains the MIDI generator can't finish.
export function playedBars(at: any, bytes: Uint8Array): SheetBar[] {
  const settings = new at.Settings()
  const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings)
  for (const part of score.tracks) for (const staff of part.staves) for (const bar of staff.bars) {
    for (const voice of bar.voices) for (const beat of voice.beats) beat.notes.length = 0
  }
  const generator = new at.midi.MidiFileGenerator(score, settings, new at.midi.AlphaSynthMidiFileHandler(new at.midi.MidiFile()))
  generator.generate()
  return generator.tickLookup.masterBars.map((b: any) => ({
    start: b.start, end: b.end,
    numerator: b.masterBar.timeSignatureNumerator, denominator: b.masterBar.timeSignatureDenominator,
    fifths: score.tracks[0].staves[0].bars[b.masterBar.index].keySignature,
  }))
}

// A notation file's bars only fit a MIDI alphaTab generated from it, which is why
// the resolution has to match; other songs go by their own meter events
export function sheetBars(header: Midi['header'], end: number, played: SheetBar[] | null, lead: number, key: DetectedKey | null): SheetBar[] {
  const bars: SheetBar[] = []
  if (played && header.ppq === ALPHATAB_PPQ) {
    for (const b of played) if (b.start >= lead) bars.push({ ...b, start: b.start - lead, end: b.end - lead })
    if (bars[0]?.start > 0) bars.unshift({ ...bars[0], start: 0, end: bars[0].start })
  }
  const meters = [...header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
  // Many files claim C major for lack of anything better
  const keys = header.keySignatures.some(k => k.key !== 'C') || !key ? header.keySignatures : []
  const last = <T extends { ticks: number }>(list: T[], tick: number) => list.filter(x => x.ticks <= tick).at(-1)
  const keyAt = (tick: number) => {
    const k = last(keys, tick)
    return k ? fifthsOf(parseKeySignature(k.key, k.scale)) : key ? fifthsOf(key) : 0
  }
  let tick = bars.at(-1)?.end ?? 0
  while (tick < end || !bars.length) {
    const [numerator, denominator] = (last(meters, tick)?.timeSignature ?? [4, 4]) as number[]
    const length = (numerator * header.ppq * 4) / denominator
    bars.push({ start: tick, end: tick + length, numerator, denominator, fifths: keyAt(tick) })
    tick += length
  }
  return bars
}

// Note values by length, dotted before plain, for a written line and for triplets
const noteValues = (ppq: number) => [1, 2, 4, 8, 16, 32, 64].flatMap(value => {
  const base = (ppq * 4) / value
  return [{ value, dots: 1, base, length: base * 1.5 }, { value, dots: 0, base, length: base }]
}).slice(0, -1)
const tripletValues = (ppq: number) => [4, 8, 16, 32].map(value => {
  const base = (ppq * 8) / (value * 3)
  return { value, dots: 0, base, length: base }
})

const onBeatOf = (tick: number, unit: number) => {
  const left = ((tick % unit) + unit) % unit
  return left < 1 || unit - left < 1
}

// One staff's notes as bars of voices of beats. Quantizes, closes the small gaps
// a MIDI's gate leaves, then gives overlapping lengths a voice each.
export function layoutStaff(notes: SheetNote[], bars: SheetBar[], ppq: number): SheetBeat[][][] {
  const barAt = (tick: number) => {
    let lo = 0, hi = bars.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (bars[mid].start <= tick) lo = mid
      else hi = mid - 1
    }
    return bars[lo]
  }
  const tolerance = ppq / 64
  const off = (tick: number, unit: number) => {
    const inBar = tick - barAt(tick).start
    return Math.abs(inBar - Math.round(inBar / unit) * unit)
  }
  const onGrid = (tick: number) => off(tick, ppq / 8) <= tolerance || off(tick, ppq / 6) <= tolerance
  const written = notes.filter(n => onGrid(n.ticks)).length >= notes.length * 0.9
  const straight = ppq / (written ? 8 : 4)
  const triplet = ppq / 6

  const beatOf = (tick: number) => {
    const bar = barAt(tick)
    return bar.start + Math.floor((tick - bar.start) / ppq) * ppq
  }
  const inThrees = new Set<number>()
  if (written) {
    const onsets = new Map<number, number[]>()
    for (const n of notes) {
      const beat = beatOf(n.ticks + tolerance)
      onsets.set(beat, [...(onsets.get(beat) ?? []), n.ticks])
    }
    for (const [beat, ticks] of onsets) {
      if (ticks.some(t => off(t, ppq / 8) > tolerance) && ticks.every(t => off(t, triplet) <= tolerance)) inThrees.add(beat)
    }
  }
  const unitAt = (tick: number) => (inThrees.has(beatOf(tick + tolerance)) ? triplet : straight)
  const snap = (tick: number, coarse = 1) => {
    const beat = beatOf(tick + tolerance)
    const unit = unitAt(tick) * coarse
    return beat + Math.round((tick - beat) / unit) * unit
  }

  const starts = [...new Set(notes.map(n => snap(n.ticks)))].sort((a, b) => a - b)
  const runs = new Map<string, { start: number; end: number; notes: SheetNote[] }>()
  for (const n of notes) {
    const start = snap(n.ticks)
    const rawEnd = n.ticks + n.durationTicks
    let end = Math.abs(rawEnd - snap(rawEnd)) <= tolerance ? snap(rawEnd) : snap(rawEnd, 2)
    if (end <= start) end = start + unitAt(n.ticks)
    const next = starts.find(s => s > start)
    if (next !== undefined) {
      const gap = next - end
      if ((gap > 0 && gap <= Math.max(straight, (end - start) * 0.12)) || (!written && gap < 0 && -gap <= ppq / 4)) end = next
    }
    const key = `${start}:${end}`
    if (!runs.has(key)) runs.set(key, { start, end, notes: [] })
    runs.get(key)!.notes.push(n)
  }

  const voices: { start: number; end: number; notes: SheetNote[] }[][] = []
  for (const run of [...runs.values()].sort((a, b) => a.start - b.start || b.end - a.end)) {
    let voice = voices.find(v => v.at(-1)!.end <= run.start)
    if (!voice && voices.length < MAX_VOICES) voices.push(voice = [])
    if (!voice) {
      // shortcut: more parts than voices cut the longest note short, which only dense performances reach
      voice = voices[MAX_VOICES - 1]
      const held = voice.at(-1)!
      if (held.start === run.start) { held.notes.push(...run.notes); continue }
      held.end = run.start
    }
    voice.push(run)
  }

  const fill = (from: number, to: number, bar: SheetBar, chord: SheetNote[] | null, tiedIn: boolean) => {
    const beats: SheetBeat[] = []
    let tick = from, tied = tiedIn
    while (tick < to - 1) {
      const beat = beatOf(tick + tolerance)
      const threes = inThrees.has(beat)
      let stop = threes ? Math.min(to, beat + ppq) : to
      if (!threes) for (let b = beat + ppq; b < to; b += ppq) if (inThrees.has(b)) { stop = b; break }
      const room = stop - tick
      const anchor = threes ? beat : bar.start
      const values = threes ? tripletValues(ppq) : noteValues(ppq)
      const pick = values.find(v => Math.abs(v.length - room) < 1) ?? values.find(v => v.length <= room + 1 && onBeatOf(tick - anchor, v.dots ? v.base * 2 : v.base)) ?? values.at(-1)!
      beats.push({ value: pick.value, dots: pick.dots, triplet: threes, notes: chord, tied })
      tick += pick.length
      tied = !!chord
    }
    return beats
  }

  const laid: SheetBeat[][][] = bars.map(() => [])
  for (const runsOfVoice of voices) {
    let first = 0
    bars.forEach((bar, b) => {
      const beats: SheetBeat[] = []
      let tick = bar.start
      for (let r = first; r < runsOfVoice.length && runsOfVoice[r].start < bar.end; r++) {
        const run = runsOfVoice[r]
        const from = Math.max(run.start, bar.start), to = Math.min(run.end, bar.end)
        if (to <= from) continue
        beats.push(...fill(tick, from, bar, null, false), ...fill(from, to, bar, run.notes, run.start < bar.start))
        tick = to
      }
      while (first < runsOfVoice.length && runsOfVoice[first].end <= bar.end) first++
      if (beats.length) laid[b].push([...beats, ...fill(tick, bar.end, bar, null, false)])
    })
  }
  bars.forEach((bar, b) => { if (!laid[b].length) laid[b].push(fill(bar.start, bar.end, bar, null, false)) })
  return laid
}

type Part = { name: string; program: number; channel: number; staves: { clef: 'G2' | 'F4'; notes: SheetNote[] }[] }

function writeStaff(at: any, staff: any, clef: string, laid: SheetBeat[][][], bars: SheetBar[], heads: Map<object, object[]>) {
  const ringing = new Map<SheetNote, any>()
  const voiceCount = Math.max(...laid.map(voices => voices.length))
  laid.forEach((voices, b) => {
    const bar = new at.model.Bar()
    bar.clef = at.model.Clef[clef]
    bar.keySignature = bars[b].fifths
    staff.addBar(bar)
    voices.forEach((beats, v) => {
      const voice = new at.model.Voice()
      bar.addVoice(voice)
      for (const written of beats) {
        const beat = new at.model.Beat()
        beat.duration = written.value
        beat.dots = written.dots
        if (written.triplet) { beat.tupletNumerator = 3; beat.tupletDenominator = 2 }
        voice.addBeat(beat)
        if (!written.notes) { beat.isEmpty = v > 0; continue } // only the first voice prints its rests
        const byPitch = new Map<number, SheetNote[]>()
        for (const n of written.notes) byPitch.set(n.midi, [...(byPitch.get(n.midi) ?? []), n])
        for (const [midi, same] of byPitch) {
          const note = new at.model.Note()
          note.octave = Math.floor(midi / 12)
          note.tone = midi % 12
          beat.addNote(note)
          if (written.tied) { note.isTieDestination = true; note.tieOrigin = ringing.get(same[0]) ?? null }
          ringing.set(same[0], note)
          heads.set(note, same.map(n => n.ref))
        }
      }
    })
    // alphaTab chains voices bar to bar, so every bar has them all
    for (let v = voices.length; v < voiceCount; v++) {
      const voice = new at.model.Voice()
      const beat = new at.model.Beat()
      beat.isEmpty = true
      bar.addVoice(voice)
      voice.addBeat(beat)
    }
  })
}

export interface SheetOptions {
  settings: unknown
  played?: SheetBar[] | null   // bars from the notation file, see sheetBars
  lead?: number                // ticks Skip empty bars cut from the front
  key?: DetectedKey | null     // for a file with no key of its own
  shown?: (trackIndex: number) => boolean
}

// All keyboard tracks are one piano on two staves, split by hand; each other
// instrument has its own staff. shortcut: drums aren't written, a kit needs its own notation.
export function sheetFromMidi(at: any, midi: Midi, o: SheetOptions): { score: any; heads: Map<object, object[]> } | null {
  const tracks = midi.tracks.filter(t => t.notes.length > 0 && !t.instrument.percussion && t.channel !== 9)
  const shown = tracks.filter(t => o.shown?.((t as any).index) ?? true)
  const chosen = shown.length ? shown : tracks
  if (!chosen.length) return null

  const isKeyboard = (t: Midi['tracks'][number]) => HAND_ASSIGN_GROUPS.has(getGMGroup(t.instrument.number, false))
  const asSheet = (n: any): SheetNote => ({ ref: n, midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks })
  const parts: Part[] = chosen.filter(t => !isKeyboard(t)).map(t => ({
    name: t.name, program: t.instrument.number, channel: t.channel,
    staves: [{ clef: t.notes.reduce((sum, n) => sum + n.midi, 0) / t.notes.length < 60 ? 'F4' : 'G2', notes: t.notes.map(asSheet) }],
  }))
  const keys = chosen.filter(isKeyboard)
  if (keys.length) {
    const right: SheetNote[] = [], left: SheetNote[] = []
    for (const t of keys) {
      const trackHand = nameHandFromSuffix(t.name)
      for (const n of t.notes) ((((n as any).hand ?? trackHand ?? (n.midi < 60 ? 'L' : 'R')) === 'L') ? left : right).push(asSheet(n))
    }
    parts.push({ name: '', program: keys[0].instrument.number, channel: keys[0].channel, staves: [{ clef: 'G2', notes: right }, { clef: 'F4', notes: left }] })
  }

  const end = Math.max(...midi.tracks.flatMap(t => t.notes.at(-1) ? t.notes.map(n => n.ticks + n.durationTicks) : [0]))
  const bars = sheetBars(midi.header, end, o.played ?? null, o.lead ?? 0, o.key ?? null)
  const ppq = midi.header.ppq
  const score = new at.model.Score()
  let tempo = -1
  bars.forEach((b, i) => {
    const master = new at.model.MasterBar()
    master.timeSignatureNumerator = b.numerator
    master.timeSignatureDenominator = b.denominator
    master.isAnacrusis = i === 0 && b.end - b.start !== (b.numerator * ppq * 4) / b.denominator
    const bpm = midi.header.tempos.filter(t => t.ticks <= b.start).at(-1)?.bpm ?? midi.header.tempos[0]?.bpm ?? 120
    if (Math.round(bpm) !== tempo) master.tempoAutomations.push(at.model.Automation.buildTempoAutomation(false, 0, tempo = Math.round(bpm), 2))
    score.addMasterBar(master)
  })
  const heads = new Map<object, object[]>()
  for (const part of parts) {
    const track = new at.model.Track()
    track.name = part.name
    track.playbackInfo.program = part.program
    track.playbackInfo.primaryChannel = track.playbackInfo.secondaryChannel = part.channel
    track.ensureStaveCount(part.staves.length)
    score.addTrack(track)
    part.staves.forEach((s, i) => {
      track.staves[i].showTablature = false
      writeStaff(at, track.staves[i], s.clef, layoutStaff(s.notes, bars, ppq), bars, heads)
    })
  }
  score.finish(o.settings)
  return { score, heads }
}
