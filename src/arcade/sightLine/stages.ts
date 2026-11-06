// ── Frontier Express: the stages, what each teaches, and the one dial ─────────
import { midiOf } from '../../lessons/drill'
import { t } from '../../utils/i18n'
import type { MeetCard, StageDef } from '../games'
import { musicOf, type Clef, type LineRef } from './lines'

export type StageId = 'treble' | 'bass' | 'both' | 'boss' | 'endless'

export interface Stage extends StageDef {
  id: StageId
  clefs: Clef[]
  lines: LineRef[]        // played in turn; the first opens every run
  keys: string[]          // Endless: the signature changes line by line
  rest: number            // beats of open trail between lines
  dial: { start: number; step: number; top: number }   // beats a minute, one step a line
  from: number            // the keyboard under this staff
  octaves: number
}

const HEAR_NOTES = 8
const NO_ROOT = -1
const card = (label: string, keys: number[]): MeetCard => ({ label, keys, root: NO_ROOT })
const tryNote = (prompt: string, key: number) => ({ prompt, keys: [key], fits: (held: number[]) => held.includes(key) })
const hearLine = (line: LineRef) => musicOf(line).events.slice(0, HEAR_NOTES).map(e => e.names.map(midiOf))
const ids = (...list: string[]): LineRef[] => list.map(id => ({ id }))

// Riffs by library id, written exercises by lesson number
const TREBLE_LINES = ids('or-bd-fall', 'or-sl-sway', 'or-bl-walk', 'or-bd-lift', 'or-al-drift', 'or-pop-minor')
const BASS_LINES: LineRef[] = [{ id: '3.2' }, { id: '3.3' }, { id: 'or-pop-steps', down: 1 }, { id: 'or-pop-penta', down: 1 }, { id: 'or-rk-answer', down: 1 }]
const BOTH_LINES = ids('6.2', 'sl-rock-ballad-c', '6.4', 'sl-pop-anthem-c', '6.5')
const BOSS_LINES = ids('or-rk-drive', 'sl-jazz-2-5-1-beginner-c', 'sl-blues-slow-comp-g', 'sl-rock-anthem-d', 'sl-jazz-intro-c', 'sl-jazz-blues-f-comp')
const KEY_LINES = ids('or-bd-fall', 'or-bd-lift', 'or-rb-sigh', 'or-bs-steps', 'or-bs-sway', 'or-jz-climb', 'or-bd-home', 'or-sl-rise')
const D_CHORD = [62, 66, 69]

export const STAGES: Stage[] = [
  {
    id: 'treble', kind: 'stage', name: t`Treble staff`, sub: t`Five trails for the right hand`, concept: 'treble', conceptName: t`The treble staff`,
    meet: {
      text: t`Each line and space of the staff is a trail, and each note is a fork in it. The key names are gone: play what the staff shows before it reaches the coach.`,
      hear: t`Hear a line`, cards: [card(t`Lines, bottom up`, [64, 67, 71, 74, 77]), card(t`Spaces, bottom up`, [65, 69, 72, 76])],
      hearSteps: hearLine(TREBLE_LINES[0]), tryIt: tryNote(t`Try one now: play E, the bottom line`, 64),
    },
    clefs: ['treble'], lines: TREBLE_LINES, keys: ['C'], rest: 2, dial: { start: 60, step: 6, top: 90 }, from: 48, octaves: 3,
  },
  {
    id: 'bass', kind: 'stage', name: t`Bass staff`, sub: t`The same trails, read from F`, concept: 'bass', conceptName: t`The bass staff`,
    meet: {
      text: t`The bass clef's two dots hug the line that is F. Notes sit in different places here, so read them fresh and don't carry the treble over.`,
      hear: t`Hear a line`, cards: [card(t`Lines, bottom up`, [43, 47, 50, 53, 57]), card(t`Spaces, bottom up`, [45, 48, 52, 55])],
      hearSteps: hearLine(BASS_LINES[0]), tryIt: tryNote(t`Try one now: play the F below middle C`, 53),
    },
    clefs: ['bass'], lines: BASS_LINES, keys: ['C'], rest: 2, dial: { start: 60, step: 6, top: 90 }, from: 36, octaves: 3,
  },
  {
    id: 'both', kind: 'stage', name: t`Both staves`, sub: t`Two trails at once, with ledger lines`, concept: 'grand', conceptName: t`Both staves and ledger lines`,
    meet: {
      text: t`Past the edge of a staff, short ledger lines carry the trail on. Middle C sits on one, between the two staves.`,
      hear: t`Hear a line`, cards: [card(t`Below the treble`, [60]), card(t`Above the bass`, [59]), card(t`Above the treble`, [81])],
      hearSteps: hearLine(BOTH_LINES[0]), tryIt: tryNote(t`Try one now: play middle C`, 60),
    },
    clefs: ['treble', 'bass'], lines: BOTH_LINES, keys: ['C'], rest: 2, dial: { start: 66, step: 5, top: 90 }, from: 36, octaves: 4,
  },
  {
    id: 'boss', kind: 'boss', name: t`Boss`, sub: t`Outlaws on the bridge. One long passage of chords.`, concept: 'passage', conceptName: t`Chords at sight`,
    meet: {
      text: t`Outlaws chase the coach across the canyon bridge. The passage has no pauses: read each chord from the bottom note up, and keep rolling.`,
      hear: t`Hear the chords`, cards: [card(t`Two notes`, [57, 64]), card(t`Three notes`, D_CHORD), card(t`Four notes`, [64, 67, 71, 74])],
      tryIt: { prompt: t`Try one now: play the D chord`, keys: D_CHORD, fits: held => D_CHORD.every(k => held.includes(k)) },
    },
    clefs: ['treble', 'bass'], lines: BOSS_LINES, keys: ['C'], rest: 0, dial: { start: 54, step: 6, top: 90 }, from: 36, octaves: 4,
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`The signature changes, line after line`, concept: 'keys', conceptName: t`Key signatures`,
    meet: {
      text: t`A key signature changes notes for the whole line: every F is F sharp in G major. The signature moves on with each line, and the coach only gets faster.`,
      hear: t`Hear the signatures`, cards: [card(t`G major`, [66]), card(t`D major`, [66, 73]), card(t`F major`, [70]), card(t`B flat major`, [70, 75])],
      tryIt: tryNote(t`Try one now: play F sharp, as G major asks`, 66),
    },
    clefs: ['treble'], lines: KEY_LINES, keys: ['G', 'D', 'F', 'Bb', 'A', 'Eb', 'E', 'Ab', 'C'], rest: 3, dial: { start: 66, step: 4, top: 132 }, from: 48, octaves: 3,
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

const ASSIST_SLOWDOWN = 0.7

export function bpmAt(stage: Stage, line: number, assist: boolean): number {
  const { start, step, top } = stage.dial
  return Math.round(Math.min(top, start + step * line) * (assist ? ASSIST_SLOWDOWN : 1))
}
