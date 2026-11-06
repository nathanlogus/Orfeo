import { Note } from 'tonal'
import { STYLES, createBand, lowChord, progressionChords, scalePitchClasses, stepSeconds, type JamChord, type JamFeel, type JamStyle } from './band'
import { GROOVES } from './grooves'
import { licksFor, lineOf } from './licks'
import { BAND_CHANNELS, DRUM_CH, PRESETS, ROSTER, STYLE_PRESET, instrument, playersOf, presetSlots, withSlot, type JamPlayer } from './roster'
import { dueQueue } from './jamOutput'
import { createReaction, type BandLevel } from './reaction'
import { LOOKAHEAD_SEC, TICK_MS, createScheduler, type JamNote, type JamOutput } from './scheduler'

const BASS_CH = 12
const COMP_CH = 13

type Sent = { bytes: number[]; when: number }

// A clock moved by hand, and an output that records what the engine would get
function fakeOutput() {
  const sent: Sent[] = []
  let t = 0
  const out: JamOutput = {
    now: () => t,
    send: (bytes, when) => { sent.push({ bytes, when }) },
    flush: () => {},
  }
  return { out, sent, advance: (dt: number) => { t += dt } }
}

// Every note-on is followed, in time, by a note-off of the same pitch
function stuckNotes(sent: Sent[]): number {
  const held = new Map<string, number>()
  const inOrder = sent.map((s, i) => ({ ...s, i })).sort((a, b) => a.when - b.when || a.i - b.i)
  for (const { bytes: [status, d1] } of inOrder) {
    const kind = status & 0xf0
    if (kind === 0x90) held.set(`${status & 0xf}:${d1}`, 1)
    else if (kind === 0x80) held.delete(`${status & 0xf}:${d1}`)
    else if (kind === 0xb0 && d1 === 123) for (const k of held.keys()) if (k.startsWith(`${status & 0xf}:`)) held.delete(k)
  }
  return held.size
}

// A band on a fake clock, with its settings open to the test
function jam(style: JamStyle, opts: { leftHand?: boolean; level?: BandLevel } = {}) {
  const { out, sent, advance } = fakeOutput()
  const players: JamPlayer[] = [{ role: 'drums', ch: DRUM_CH }, { role: 'bass', ch: BASS_CH }, { role: 'comp', ch: COMP_CH }]
  const settings = { style, keyPc: 0, leftHand: opts.leftHand ?? false, players, feel: 'tight' as JamFeel }
  const listening = { loud: 0.5, level: (opts.level ?? 1) as BandLevel }
  const changes: { chord: JamChord; at: number }[] = []
  const notes: JamNote[] = []
  const band = createBand({
    settings: () => settings,
    listening: () => listening,
    play: n => { notes.push(n); scheduler.play(n) },
    releaseAt: (chs, at) => scheduler.releaseAt(chs, at),
    chordChanged: (chord, at) => changes.push({ chord, at }),
    beat: () => {},
  })
  const stepSec = stepSeconds(120)
  const scheduler = createScheduler(out, () => stepSec, band.plan)
  const run = (sec: number) => { for (let i = 0; i < sec * 1000 / TICK_MS; i++) { advance(TICK_MS / 1000); scheduler.tick() } }
  scheduler.start(0)
  return { band, scheduler, run, sent, notes, changes, settings, listening, stepSec }
}

export function runJamTest(): number {
  console.group('[jam] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // ── Scheduler ──────────────────────────────────────────────────────────────
  {
    const { out, sent, advance } = fakeOutput()
    const stepSec = 0.1
    let late = 0
    const s = createScheduler(out, () => stepSec, (step, at) => {
      if (at - out.now() > LOOKAHEAD_SEC) late++
      s.play({ ch: 0, note: 60 + (step % 2), vel: 90, at, dur: 0.05 })
    })
    s.start(0)
    for (let i = 0; i < 400; i++) { advance(TICK_MS / 1000); s.tick() }
    check(late === 0, 'nothing is planned past the lookahead')
    const ons = sent.filter(x => (x.bytes[0] & 0xf0) === 0x90)
    check(ons.every((x, i) => Math.abs(x.when - i * stepSec) < 1e-9), 'steps land on the grid, not on the ticks')
    // a stall skips ahead instead of playing everything it missed at once
    const before = ons.length
    advance(3); s.tick()
    const burst = sent.filter(x => (x.bytes[0] & 0xf0) === 0x90).length - before
    check(burst <= 8, `a 3 s stall plays no burst, got ${burst} notes`)
    check(s.lateSteps() > 20, 'and counts the steps it skipped')
    s.stop([0])
    check(stuckNotes(sent) === 0, 'every note has its off')
  }
  {
    // a re-struck note: the earlier off moves ahead of the new note-on
    const { out, sent } = fakeOutput()
    const s = createScheduler(out, () => 1, () => {})
    s.play({ ch: 12, note: 40, vel: 90, at: 1, dur: 2 })
    s.play({ ch: 12, note: 40, vel: 90, at: 2, dur: 2 })
    const off = sent.find(x => (x.bytes[0] & 0xf0) === 0x80)
    check(!!off && off.when < 2, 'off comes before the re-strike')
    check(sent.filter(x => (x.bytes[0] & 0xf0) === 0x80).length === 1, 'and only one')
    // a chord change mid-note
    s.releaseAt([12], 2.5)
    s.stop([12])
    check(stuckNotes(sent) === 0, 'stopping releases what was left')
    check(sent.some(x => x.bytes[0] === 0xbc && x.bytes[1] === 123), 'and tells the channel')
  }
  {
    // Stop with a queue the engine can't recall: everything ends after the last start
    const { out, sent, advance } = fakeOutput()
    const s = createScheduler(out, () => 0.05, (_, at) => s.play({ ch: 13, note: 60, vel: 90, at, dur: 5 }))
    s.start(0)
    advance(0.5); s.tick()
    s.stop([13])
    const lastOn = Math.max(...sent.filter(x => (x.bytes[0] & 0xf0) === 0x90).map(x => x.when))
    const lastOff = Math.max(...sent.filter(x => (x.bytes[0] & 0xf0) !== 0x90).map(x => x.when))
    check(lastOff > lastOn, 'the last off lands after the last queued note-on')
    check(stuckNotes(sent) === 0, 'no stuck note')
  }

  // ── Timer-driven engines ───────────────────────────────────────────────────
  {
    let t = 0
    const got: number[][] = []
    const q = dueQueue(() => t, b => got.push(b))
    q.send([0x90, 62, 90], 0.2)
    q.send([0x90, 60, 90], 0.1)
    q.send([0x80, 60, 0], 0.3)
    t = 0.05; q.pulse()
    check(got.length === 0, 'nothing goes early')
    t = 0.21; q.pulse()
    check(got.map(b => b[1]).join() === '60,62', 'due messages go in time order')
    q.send([0x90, 64, 90], 0.25)
    q.flush()
    check(got.some(b => b[0] === 0x80) && !got.some(b => b[1] === 64), 'stopping delivers offs and drops note-ons')
  }

  // ── Band follows the chord ─────────────────────────────────────────────────
  for (const style of Object.keys(STYLES) as JamStyle[]) {
    const def = STYLES[style]
    check(def.bass.concat(def.comp).every(l => l.length === 16), `${style}: patterns are one bar long`)
    check(scalePitchClasses(STYLES[style].scale, 0).size >= 5, `${style}: has a scale`)
    check(GROOVES[style].length === 3 && GROOVES[style].every(g => g.length % 3 === 0 && g.length > 0), `${style}: three grooves`)
    check(GROOVES[style].every((g, i, all) => i === 0 || g.length >= all[i - 1].length), `${style}: grooves get busier`)
    check(progressionChords(style, 0).length === def.progression.labels.length, `${style}: every step resolves to a chord`)
    for (const level of [0, 1, 2] as BandLevel[]) {
      const j = jam(style, { level })
      j.run(30)
      j.scheduler.stop([DRUM_CH, BASS_CH, COMP_CH])
      check(stuckNotes(j.sent) === 0, `${style} level ${level}: no stuck notes`)
      const bass = j.notes.filter(n => n.ch === BASS_CH)
      const comp = j.notes.filter(n => n.ch === COMP_CH)
      check(bass.length > 0 && comp.length > 0 && j.notes.some(n => n.ch === DRUM_CH), `${style} level ${level}: all three play`)
      check(bass.every(n => n.note >= 31 && n.note <= 55), `${style}: bass stays in range`)
      check(bass.every((n, i) => i === 0 || Math.abs(n.note - bass[i - 1].note) <= 14), `${style}: bass doesn't leap around`)
      check(j.changes.length >= (style === 'blues' ? 4 : 8), `${style}: the fixed progression moves`)
    }
    // comping only ever plays the current chord's tones
    const j = jam(style)
    j.run(30)
    let wrong = 0
    for (const n of j.notes.filter(x => x.ch === COMP_CH)) {
      const c = [...j.changes].reverse().find(x => x.at <= n.at + 1e-6)?.chord ?? progressionChords(style, 0)[0]
      if (!c.semis.some(s => (c.rootPc + s) % 12 === n.note % 12)) wrong++
    }
    check(wrong === 0, `${style}: comping stays on the chord, ${wrong} wrong`)
  }
  {
    // A busier level plays more; parts switch off
    const count = (level: BandLevel) => { const j = jam('rock', { level }); j.run(20); return j.notes.length }
    check(count(0) < count(1) && count(1) < count(2), 'calm < steady < building')
    const j = jam('pop')
    j.settings.players = j.settings.players.filter(p => p.role === 'bass')
    j.run(10)
    check(j.notes.filter(n => n.at > 0.2).every(n => n.ch === BASS_CH), 'parts switched off stay silent')
  }

  // ── The left hand leads ────────────────────────────────────────────────────
  {
    const midi = (names: string[]) => new Set(names.map(n => Note.midi(n) as number))
    check(lowChord(midi(['C3', 'E3', 'G3']), 60)?.rootPc === 0, 'C major read')
    check(lowChord(midi(['A2', 'C3', 'E3', 'G3']), 60)?.raw === 'Am7', 'Am7 read')
    check(lowChord(midi(['E3', 'G3', 'C4']), 60) === null, 'only what is under the split counts')
    check(lowChord(midi(['C3', 'G3']), 60) === null, 'two notes are not a chord change')
    check(lowChord(midi(['C5', 'E5', 'G5']), 60) === null, 'the right hand never leads')

    const j = jam('pop', { leftHand: true })
    j.run(1)
    check(j.changes.length === 0, 'with the left hand leading the band waits on the tonic')
    const am = lowChord(midi(['A2', 'C3', 'E3']), 60)!
    const asked = 1.05 // between beats, at 120 BPM
    j.band.follow(am)
    j.run(1)
    check(j.changes.length === 1 && j.changes[0].chord.rootPc === 9, 'the band takes the chord')
    const at = j.changes[0].at
    check(Math.abs(at / 0.5 - Math.round(at / 0.5)) < 1e-9, `on a beat, got ${at}`)
    check(at - asked <= 0.5 + LOOKAHEAD_SEC, `on the next beat it can reach, got ${at - asked}`)
    const after = j.notes.filter(n => n.at >= at)
    check(after.find(n => n.ch === BASS_CH)?.note !== undefined && after.find(n => n.ch === BASS_CH)!.note % 12 === 9 && after.find(n => n.ch === BASS_CH)!.at === at, 'the bass lands on the new root at once')
    check(after.some(n => n.ch === COMP_CH && n.at === at), 'and comping strikes it, even off its pattern')
    // what rang over the change ends at the change
    const ons = new Map<number, number>()
    let hung = 0
    for (const s of [...j.sent].sort((a, b) => a.when - b.when)) {
      if (s.bytes[0] === (0x90 | COMP_CH)) ons.set(s.bytes[1], s.when)
      else if (s.bytes[0] === (0x80 | COMP_CH)) { const on = ons.get(s.bytes[1]); if (on !== undefined && on < at && s.when > at) hung++ }
    }
    check(hung === 0, 'old chord stops at the change')
  }

  // ── The band listens, smoothly ─────────────────────────────────────────────
  {
    const sim = (notesPerSec: number, vel: number, sec: number, r = createReaction()) => {
      let next = 0
      for (let t = 0; t < sec; t += 0.025) {
        while (notesPerSec > 0 && next <= t) { r.noteOn(vel); next += 1 / notesPerSec }
        r.advance(0.025)
      }
      return r
    }
    const fast = sim(8, 0.9, 12)
    check(fast.level === 2 && fast.loud > 0.75, `fast and hard builds up: ${fast.level} ${fast.loud}`)
    const quiet = sim(0, 0, 12)
    check(quiet.level === 0 && quiet.loud < 0.4, `silence calms it: ${quiet.level} ${quiet.loud}`)
    check(sim(8, 0.25, 12).loud < 0.4, 'soft playing keeps it soft however fast')
    const r = createReaction()
    sim(8, 0.9, 12, r)
    const was = r.loud
    r.advance(0.025)
    check(Math.abs(r.loud - was) < 0.02, 'nothing jumps in one tick')
    let flips = 0, last = r.level
    sim(2.6, 0.6, 20, r)
    for (let t = 0; t < 20; t += 0.025) { r.noteOn(0.6); r.advance(0.385); if (r.level !== last) { flips++; last = r.level } }
    check(flips <= 2, `a steady player doesn't make the band flicker: ${flips}`)
  }

  {
    check(JSON.stringify(lineOf('\\clef G2\n:8 C4 D4.4 r.8 E4 | F4.2')?.map(n => [n.midi, n.at, n.beats])) === '[[60,0,0.5],[62,0.5,1],[64,2,0.5],[65,2.5,2]]', 'a line reads with sticky lengths and rests')
    check(lineOf('\\clef G2\n(C4 E4).4 D4') === null, 'a chord is not a single line')
    for (const style of Object.keys(STYLES) as (keyof typeof STYLES)[]) for (let key = 0; key < 12; key++) {
      const licks = licksFor(style, STYLES[style].scale, key)
      check(licks.length === 3, `${style} in key ${key} has 3 licks: ${licks.length}`)
      const scale = scalePitchClasses(STYLES[style].scale, key)
      for (const lick of licks) {
        check(lick.notes.every(n => n.midi >= 60 && n.midi <= 83), `${lick.id} stays above the split, on screen`)
        check(lick.notes.filter(n => scale.has(n.midi % 12)).length / lick.notes.length >= 0.75, `${lick.id} sits in ${style}`)
      }
    }
  }

  {
    for (const scale of ['blues', 'minor pentatonic', 'major pentatonic', 'major', 'minor', 'dorian', 'mixolydian']) check(licksFor('blues', scale, 0).length > 0, `${scale} has licks`)
    check(ROSTER.length >= 20 && new Set(ROSTER.map(i => i.id)).size === ROSTER.length, 'a wide roster, with no repeats')
    for (const p of PRESETS) {
      check(p.slots.length === 4 && p.slots.every(id => id === null || instrument(id)), `${p.id} seats known players`)
      check(playersOf(p.slots).every(q => BAND_CHANNELS.includes(q.ch)), `${p.id} stays on the band's channels`)
    }
    for (const id of Object.values(STYLE_PRESET)) check(!!PRESETS.find(p => p.id === id), `${id} is a preset`)
    check(withSlot(presetSlots('roadhouse'), 2, 'drums').filter(id => id === 'drums').length === 1, 'one drummer at a time')
    check(withSlot(presetSlots('roadhouse'), 3, null)[3] === null, 'a seat can be left open')

    const seated: JamPlayer[] = [{ role: 'stab', ch: 10 }, { role: 'pad', ch: 11 }]
    const j = jam('rock')
    j.settings.players = seated
    j.listening.level = 2
    j.run(4)
    const stabs = j.notes.filter(n => n.ch === 10), pads = j.notes.filter(n => n.ch === 11)
    check(stabs.length > 0 && stabs.every(n => n.note >= 60), 'horns hit, up where they cut through')
    check(pads.length > 0 && pads[0].dur > 1, 'a pad holds the bar')
    const late = jam('rock')
    const tight = jam('rock')
    late.settings.feel = 'relaxed'
    late.run(2)
    tight.run(2)
    const first = (x: typeof late) => x.notes.find(n => n.ch === COMP_CH && n.at > 0.5)!.at // past what start() planned
    check(first(late) > first(tight), 'relaxed sits behind the beat')
    check(late.notes.find(n => n.ch === DRUM_CH && n.at > 0.5)!.at === tight.notes.find(n => n.ch === DRUM_CH && n.at > 0.5)!.at, 'and the drums keep it')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
