// ── Orbit Station: the stages, the grooves they use, and the one dial ─────────
// Every rhythm is a line from a Jam style, so a stage plays what that band plays.
import { t } from '../../utils/i18n'
import { STYLES, type JamStyle } from '../../jam/band'
import type { MeetIt, StageDef } from '../games'

export type StageId = 'steady' | 'eighths' | 'syncopation' | 'boss' | 'endless'

export interface Rhythm { id: JamStyle; name: string; line: string; bpm: number }   // line: one bar, a character a sixteenth

export interface Stage extends StageDef {
  id: StageId
  rhythms: Rhythm[]       // one a cycle, in turn
  bpm: number | null      // null: each groove keeps its own tempo, so the tempo changes
  onBars: number          // bars the click plays
  cycles: number          // Infinity: Endless
  dial: { start: number; step: number; ceiling: number }   // silent bars a cycle
  ask: string             // the hint pill
}

const groove = (id: JamStyle, name: string, line: string): Rhythm => ({ id, name, line, bpm: STYLES[id].bpm })

const BALLAD = groove('ballad', t`Ballad quarter notes`, STYLES.ballad.comp[0])
const POP = groove('pop', t`Pop eighth notes`, STYLES.pop.comp[2])
const ROCK = groove('rock', t`Rock tresillo`, STYLES.rock.comp[2])
const BOSSA = groove('bossa', t`Bossa nova comping`, STYLES.bossa.comp[1])
const SOUL = groove('soul', t`Soul backbeat`, STYLES.soul.comp[2])
const HIPHOP = groove('hiphop', t`Hip hop push`, STYLES.hiphop.comp[2])
const FUNK = groove('funk', t`Funk stabs`, STYLES.funk.comp[1])

const EIGHTHS_BPM = 88
const SYNCOPATION_BPM = 92
const BOSS_BPM = 96
const ENDLESS_HEAR_BPM = 100
const TRY_KEY = 60
const STEPS_PER_BEAT = 4
const HEARD_BARS = 2

// Hear plays the grooves at the stage's tempo; a rest is an empty step
function meet(text: string, hear: string, rhythms: Rhythm[], bpm: number): MeetIt {
  const bars = rhythms.length > 1 ? rhythms : Array.from({ length: HEARD_BARS }, () => rhythms[0])
  return {
    text, hear,
    cards: rhythms.map(r => ({ label: r.name, keys: [TRY_KEY], root: TRY_KEY % 12 })),
    hearSteps: bars.flatMap(r => [...r.line].map(c => (c === 'x' ? [TRY_KEY] : []))),
    hearMs: 60_000 / bpm / STEPS_PER_BEAT,
    tryIt: { prompt: t`Try one now: play any key`, keys: [TRY_KEY], fits: held => held.length > 0 },
  }
}

export const STAGES: Stage[] = [
  {
    id: 'steady', kind: 'stage', name: t`Steady beats`, sub: t`Four to the bar, slow as a ballad`, concept: 'steady', conceptName: t`Steady beats`,
    meet: meet(t`The click plays, then it goes quiet and the rings run on your beat alone. Any key counts. Stay with the pulse you heard and the rings stay in orbit.`, t`Hear the beat`, [BALLAD], BALLAD.bpm),
    rhythms: [BALLAD], bpm: BALLAD.bpm, onBars: 4, cycles: 3, dial: { start: 1, step: 1, ceiling: 3 }, ask: t`Any key keeps the rings turning: play steady beats`,
  },
  {
    id: 'eighths', kind: 'stage', name: t`Eighth notes`, sub: t`Two to the beat, the pop band's pulse`, concept: 'eighths', conceptName: t`Eighth notes`,
    meet: meet(t`Eighth notes split every beat in two. Count 1 and 2 and 3 and 4 and, and keep the ands even when the click drops out.`, t`Hear the eighths`, [POP], EIGHTHS_BPM),
    rhythms: [POP], bpm: EIGHTHS_BPM, onBars: 4, cycles: 3, dial: { start: 2, step: 1, ceiling: 4 }, ask: t`Any key keeps the rings turning: play steady eighths`,
  },
  {
    id: 'syncopation', kind: 'stage', name: t`Syncopation`, sub: t`Off the beat: rock, bossa nova and soul`, concept: 'syncopation', conceptName: t`Syncopation`,
    meet: meet(t`Syncopation lands between the beats. Feel the click underneath and place each hit against it. The pattern for each groove is on the panel.`, t`Hear the grooves`, [ROCK, BOSSA, SOUL], SYNCOPATION_BPM),
    rhythms: [ROCK, BOSSA, SOUL], bpm: SYNCOPATION_BPM, onBars: 4, cycles: 3, dial: { start: 2, step: 1, ceiling: 4 }, ask: t`Any key keeps the rings turning: play the pattern on the panel`,
  },
  {
    id: 'boss', kind: 'boss', name: t`Solar storm`, sub: t`The storm takes the click away for the longest stretch yet`, concept: 'storm', conceptName: t`Long silences`,
    meet: meet(t`A solar storm knocks out the click for bars on end. Two bars to catch the groove, then fly the station through it on your own time.`, t`Hear the grooves`, [HIPHOP, FUNK], BOSS_BPM),
    rhythms: [HIPHOP, FUNK], bpm: BOSS_BPM, onBars: 2, cycles: 3, dial: { start: 6, step: 2, ceiling: 10 }, ask: t`Any key keeps the rings turning: hold the pattern through the storm`,
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`Groove after groove, each at its own tempo`, concept: 'mixed', conceptName: t`Tempo changes`,
    meet: meet(t`Every groove in turn, each at its own tempo, and the silences only grow. A new tempo gets one bar of click before it counts.`, t`Hear the grooves`, [POP, ROCK, BOSSA], ENDLESS_HEAR_BPM),
    rhythms: [POP, ROCK, SOUL, HIPHOP, FUNK, BOSSA, BALLAD], bpm: null, onBars: 2, cycles: Infinity, dial: { start: 2, step: 1, ceiling: 8 }, ask: t`Any key keeps the rings turning: follow the tempo and the panel`,
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

// How much of the silence Assist keeps
const ASSIST_SILENCE = 0.5

export function dialAt(stage: Stage, cycle: number, assist: boolean): number {
  const { start, step, ceiling } = stage.dial
  const bars = Math.min(ceiling, start + step * cycle)
  return assist ? Math.ceil(bars * ASSIST_SILENCE) : bars
}
