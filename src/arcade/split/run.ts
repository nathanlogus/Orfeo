// ── One run of Split: no rendering, no clock of its own ───────────────────────
// Two lanes, one for each side of middle C, each with its own judge. The screen
// hands in key presses with their own timestamps and asks it to move time along.
import { multiplierFor } from '../chordRush/run'
import { createJudge, exactly, type Grade, type Verdict } from '../judge'
import { HANDS, SPLIT, assisted, dialAt, type Hand, type Note, type Piece, type Stage } from './stages'

// A hand behind for this long brings its kite down, and ends the run
export const FALL_MS = 6000
export const LIVES = 3
// Beats shown on a lane: a phrase is announced this far ahead of its first note
export const SHOWN_BEATS = 8
const LEAD_BEATS = 4
const BAR_BEATS = 4
const SWAP_OCTAVE = 12
// A note closing waits this long for a key already on its way in
const ARRIVAL_GRACE_MS = 100
// A bar is counted once its last note has had its window
const BAR_GRACE_MS = 240
const PERFECT_POINTS = 100
const GOOD_POINTS = 60
const UP_POINTS = 50            // both kites up through a bar
const TOGETHER_POINTS = 150     // and neither hand slipped in it

export interface Shot {
  id: number
  hand: Hand
  key: number
  at: number
  beat: number
  beats: number
  piece: Piece
  dirty: boolean          // a wrong key was tried at it
}

export interface Phrase { index: number; piece: Piece; swapped: boolean; ms: number; shots: Shot[] }

export type RunEvent =
  | { type: 'phrase'; phrase: Phrase }
  | { type: 'hit'; shot: Shot; grade: Grade; points: number }
  | { type: 'wrong'; shot: Shot }
  | { type: 'miss'; shot: Shot }
  | { type: 'skip'; shot: Shot }     // its hand is resting
  | { type: 'bar'; points: number; together: boolean }
  | { type: 'end'; cleared: boolean; fell: Hand | null }

interface Options { stage: Stage; assist: boolean; emit: (e: RunEvent) => void; start: number; weak?: string[] }
interface Lot { hand: Hand; shots: Shot[]; judge: ReturnType<typeof createJudge> }

export const slipId = (shot: Shot) => `${shot.piece.id}.${shot.hand}`

// Pieces this player has slipped on come round first
const ordered = (pieces: Piece[], weak: string[]) => {
  const isWeak = (p: Piece) => weak.some(w => w.startsWith(`${p.id}.`))
  return [...pieces.filter(isWeak), ...pieces.filter(p => !isWeak(p))]
}

const octave = (notes: Note[], shift: number) => notes.map(n => ({ ...n, key: n.key + shift }))

export function createRun({ stage, assist, emit, start, weak = [] }: Options) {
  const pieces = ordered(stage.pieces, weak)
  const fallMs = assisted(FALL_MS, assist)
  const state = { score: 0, combo: 0, bestCombo: 0, clean: 0, played: 0, bars: 0, together: 0, over: false, cleared: false }
  const hands = { left: { behindSince: null as number | null, flawed: false }, right: { behindSince: null as number | null, flawed: false } }
  let lots: Lot[] = []       // open notes, a lot per phrase and hand, oldest first
  let barEnds: number[] = []
  let spans: { at: number; beat: number; ms: number }[] = []
  let phrase = 0
  let nextShot = 0
  let nextAt = start + LEAD_BEATS * dialAt(stage, 0, assist)
  let nextBeat = 0
  let resting: Hand | null = null

  function schedule() {
    const piece = pieces[phrase % pieces.length]
    const ms = dialAt(stage, phrase, assist)
    const swapped = !!stage.swap && phrase % 2 === 1
    const parts = {
      left: swapped ? octave(piece.right.notes, -SWAP_OCTAVE) : piece.left.notes,
      right: swapped ? octave(piece.left.notes, SWAP_OCTAVE) : piece.right.notes,
    }
    const shots: Shot[] = []
    for (const hand of HANDS) {
      const own = parts[hand].map(n => ({ id: nextShot++, hand, key: n.key, at: nextAt + n.beat * ms, beat: nextBeat + n.beat, beats: n.beats, piece, dirty: false }))
      lots.push({ hand, shots: own, judge: createJudge(own.map(s => ({ at: s.at, accepts: exactly(s.key) }))) })
      shots.push(...own)
    }
    spans = [...spans.slice(-1), { at: nextAt, beat: nextBeat, ms }]
    for (let beat = BAR_BEATS; beat <= piece.beats; beat += BAR_BEATS) barEnds.push(nextAt + beat * ms)
    emit({ type: 'phrase', phrase: { index: phrase, piece, swapped, ms, shots } })
    nextAt += piece.beats * ms
    nextBeat += piece.beats
    phrase++
  }

  function end(cleared: boolean, fell: Hand | null = null) {
    state.over = true
    state.cleared = cleared
    emit({ type: 'end', cleared, fell })
  }

  const slip = (hand: Hand) => { state.combo = 0; hands[hand].flawed = true }

  function hit(shot: Shot, { grade }: Verdict) {
    const clean = !shot.dirty
    const points = Math.round((grade === 'perfect' ? PERFECT_POINTS : GOOD_POINTS) * (clean ? multiplierFor(state.combo) : 1))
    state.score += points
    state.played++
    if (clean) {
      state.clean++
      state.combo++
      state.bestCombo = Math.max(state.bestCombo, state.combo)
    }
    hands[shot.hand].behindSince = null
    emit({ type: 'hit', shot, grade, points })
  }

  function missed(shot: Shot) {
    if (shot.hand === resting) return emit({ type: 'skip', shot })
    state.played++
    slip(shot.hand)
    hands[shot.hand].behindSince ??= shot.at
    emit({ type: 'miss', shot })
  }

  function closeBar() {
    const up = HANDS.every(h => hands[h].behindSince === null)
    const together = up && !resting && HANDS.every(h => !hands[h].flawed)
    const points = (up ? UP_POINTS : 0) + (together ? TOGETHER_POINTS : 0)
    state.bars++
    if (together) state.together++
    state.score += points
    for (const h of HANDS) hands[h].flawed = false
    emit({ type: 'bar', points, together })
  }

  return {
    state,
    get accuracy() { return state.played ? state.clean / state.played : 0 },
    get resting() { return resting },

    // Assist: one hand sits out, its notes count for nothing either way
    rest(hand: Hand | null) {
      if (!assist) return
      resting = hand
      if (hand) hands[hand].behindSince = null
    },

    // 0 flying, 1 down: how far this hand has fallen behind
    lag(hand: Hand, now: number) {
      const since = hands[hand].behindSince
      return since === null ? 0 : Math.min(1, (now - since) / fallMs)
    },

    // Where the lanes are, in beats: the tempo can move between phrases
    beatAt(now: number) {
      const span = [...spans].reverse().find(s => s.at <= now) ?? spans[0]
      return span ? span.beat + (now - span.at) / span.ms : 0
    },

    noteOn(key: number, at: number) {
      const hand: Hand = key < SPLIT ? 'left' : 'right'
      if (state.over || hand === resting) return
      let wrong: Shot | undefined
      for (const lot of lots) {
        if (lot.hand !== hand) continue
        const verdict = lot.judge.press(key, at)
        if (verdict?.grade === 'wrong') wrong ??= lot.shots[verdict.index]
        else if (verdict) return hit(lot.shots[verdict.index], verdict)
      }
      if (wrong && !wrong.dirty) {
        wrong.dirty = true
        slip(hand)
        emit({ type: 'wrong', shot: wrong })
      }
    },

    tick(now: number) {
      if (state.over) return
      while (phrase < stage.phrases && now >= nextAt - SHOWN_BEATS * dialAt(stage, phrase, assist)) schedule()
      for (const lot of lots) for (const { index } of lot.judge.tick(now - ARRIVAL_GRACE_MS)) missed(lot.shots[index])
      lots = lots.filter(lot => lot.judge.left > 0)
      while (barEnds.length && now >= barEnds[0] + BAR_GRACE_MS) { barEnds.shift(); closeBar() }
      const fell = HANDS.find(h => now - (hands[h].behindSince ?? Infinity) >= fallMs)
      if (fell) end(false, fell)
      else if (phrase >= stage.phrases && !lots.length && !barEnds.length) end(true)
    },
  }
}

export type Run = ReturnType<typeof createRun>
