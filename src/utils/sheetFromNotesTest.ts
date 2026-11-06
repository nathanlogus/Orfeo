import { Midi } from '@tonejs/midi'
import { layoutStaff, sheetBars, sheetFromMidi, type SheetBar } from './sheetFromNotes'

const PPQ = 480
const bar4 = (i: number): SheetBar => ({ start: i * 4 * PPQ, end: (i + 1) * 4 * PPQ, numerator: 4, denominator: 4, fifths: 0 })
const note = (midi: number, beats: number, length: number) => ({ ref: {}, midi, ticks: Math.round(beats * PPQ), durationTicks: Math.round(length * PPQ) })
const rhythm = (beats: { value: number; dots: number; notes: unknown; tied: boolean }[]) => beats.map(b => `${b.notes ? '' : 'r'}${b.tied ? '~' : ''}${b.value}${'.'.repeat(b.dots)}`).join(' ')

export async function runSheetFromNotesTest(): Promise<number> {
  console.group('[sheetFromNotes] self-check')
  let pass = 0, fail = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) === JSON.stringify(want)) pass++
    else { fail++; console.error(`FAIL: ${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }
  }

  const plain = layoutStaff([note(60, 0, 1), note(64, 0, 1), note(62, 1, 1), note(65, 2, 2)], [bar4(0)], PPQ)
  eq('a chord is one beat, the bar is filled', rhythm(plain[0][0]), '4 4 2')
  eq('both chord notes on it', plain[0][0][0].notes?.map(n => n.midi), [60, 64])

  const crossing = layoutStaff([note(60, 3, 2)], [bar4(0), bar4(1)], PPQ)
  eq('a note over the bar line is tied', [rhythm(crossing[0][0]), rhythm(crossing[1][0])], ['r2. 4', '~4 r2.'])

  const gated = layoutStaff([note(60, 0, 0.473), note(62, 0.5, 0.473), note(64, 1, 0.948), note(65, 2, 1.898)], [bar4(0)], PPQ)
  eq('a MIDI gate closes to the written length', rhythm(gated[0][0]), '8 8 4 2')

  const threes = layoutStaff([note(60, 0, 1 / 3), note(62, 1 / 3, 1 / 3), note(64, 2 / 3, 1 / 3), note(65, 1, 1)], [bar4(0)], PPQ)
  eq('triplets', threes[0][0].map(b => b.triplet), [true, true, true, false, false])
  eq('triplet values', rhythm(threes[0][0]), '8 8 8 4 r2')

  const held = layoutStaff([note(60, 0, 4), note(72, 0, 1), note(74, 1, 1), note(76, 2, 2)], [bar4(0)], PPQ)
  eq('a held note and a moving line take two voices', held[0].map(rhythm), ['1', '4 4 2'])

  const played = layoutStaff([note(60, 0.03, 0.9), note(62, 0.61, 0.4), note(64, 1.27, 0.7), note(65, 2.48, 1.1), note(67, 3.11, 0.8)], [bar4(0)], PPQ)
  eq('a performance rounds to sixteenths', played[0].flat().every(b => b.value <= 16), true)

  const empty = layoutStaff([note(60, 0, 1)], [bar4(0), bar4(1)], PPQ)
  eq('an empty bar still has its rests', rhythm(empty[1][0]), 'r1')

  const file = new Midi()
  file.header.setTempo(100)
  file.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] })
  file.header.keySignatures.push({ ticks: 0, key: 'Bb', scale: 'major' })
  file.header.update()
  const ppq = file.header.ppq
  const rh = file.addTrack(), lh = file.addTrack()
  rh.name = 'Piano RH'
  lh.name = 'Piano LH'
  rh.addNote({ midi: 72, ticks: 0, durationTicks: ppq })
  rh.addNote({ midi: 74, ticks: ppq, durationTicks: ppq * 3 })
  lh.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 3 })
  ;(file.tracks as any[]).forEach((t, i) => { t.index = i })

  const bars = sheetBars(file.header, ppq * 6, null, 0, null)
  eq('meter and key from the file', [bars.length, bars[0].numerator, bars[0].end, bars[0].fifths], [2, 3, ppq * 3, -2])
  const fromKey = sheetBars(new Midi().header, 1, null, 0, { semitone: 9, isMinor: true, transpose: 0 })
  eq('a file with no key uses the detected one, and no meter is 4/4', [fromKey[0].fifths, fromKey[0].numerator], [0, 4])
  const pickup: SheetBar = { start: 0, end: 480, numerator: 2, denominator: 4, fifths: 3 }
  const alphaTabHeader = { ppq: 960, timeSignatures: [], keySignatures: [] } as unknown as Midi['header']
  const notated = sheetBars(alphaTabHeader, 4320, [pickup, { ...pickup, start: 480, end: 2400 }], 0, null)
  eq('a notation file gives the bars, its meter carries on', notated.map(b => b.start), [0, 480, 2400])
  eq('Skip empty bars moves them', sheetBars(alphaTabHeader, 1, [pickup, { ...pickup, start: 480, end: 2400 }], 480, null)[0].start, 0)
  eq('notation bars never fit another resolution', sheetBars(file.header, 1, [pickup], 0, null)[0].end, ppq * 3)

  // alphaTab patches the DOM if it sees a window, and the test runner's has no DOM
  const page = (globalThis as any).window
  delete (globalThis as any).window
  const at: any = await import('@coderline/alphatab')
  ;(globalThis as any).window = page
  const settings = new at.Settings()
  const sheet = sheetFromMidi(at, file, { settings })!
  const piano = sheet.score.tracks[0]
  eq('both hands on one piano', [sheet.score.tracks.length, piano.staves.length], [1, 2])
  eq('clefs', piano.staves.map((s: any) => s.bars[0].clef), [at.model.Clef.G2, at.model.Clef.F4])
  eq('meter, key and tempo reach the score', [sheet.score.masterBars[0].timeSignatureNumerator, piano.staves[0].bars[0].keySignature, sheet.score.masterBars[0].tempoAutomations[0].value], [3, -2, 100])
  const written = piano.staves[0].bars.flatMap((b: any) => b.voices[0].beats.flatMap((beat: any) => beat.notes))
  eq('sounding pitch', written.filter((n: any) => !n.isTieDestination).map((n: any) => n.realValue), [72, 74])
  eq('tied over the bar line', written.filter((n: any) => n.isTieDestination).length, 1)
  const printed = [...sheet.heads.values()].flat()
  eq('every printed note knows its MIDI note', new Set(printed).size, 3)
  eq('a tied note is the same MIDI note on both sides', sheet.heads.get(written[1]), sheet.heads.get(written[2]))
  eq('hidden tracks stay out', sheetFromMidi(at, file, { settings, shown: i => i === 0 })!.score.tracks[0].staves[1].bars[0].voices[0].beats.every((b: any) => !b.notes.length), true)

  // The sheet played back is the song
  const out = new at.midi.MidiFile()
  new at.midi.MidiFileGenerator(sheet.score, settings, new at.midi.AlphaSynthMidiFileHandler(out)).generate()
  const onsets = out.tracks.flatMap((t: any) => t.events).filter((e: any) => e.constructor.name === 'NoteOnEvent').map((e: any) => [e.tick * (ppq / 960), e.noteKey])
  eq('generated MIDI matches', onsets.sort((a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1]), [[0, 48], [0, 72], [ppq, 74]])

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
