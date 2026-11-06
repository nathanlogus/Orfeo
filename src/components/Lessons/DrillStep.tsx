import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import bravuraUrl from '@coderline/alphatab/font/Bravura.woff2?url'
import { EyeOff } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { metronomeContext, scheduleMetronomeClick } from '../../hooks/useMetronome'
import { onLiveNote } from '../../hooks/useMidiInput'
import { useMidiSettings } from '../../store/midiSettings'
import { chordPress, earlierNotes, midiOf, missedNote, nextPrompt, noteLabel, promptCount, tapBeats, touchScore, type Prompt, type Struck } from '../../lessons/drill'
import { COURSE, EXERCISES } from '../../lessons/courseData'
import { PASS, tapMarks, tapScore, trackUnits, type TapMark } from '../../lessons/progress'
import { allLessons, type Check, type Lesson, type TouchStyle } from '../../lessons/course'
import MiniStaff, { KeyMap, RhythmLine } from './MiniStaff'

const SHOW_SHAPE_MS = 3000
const SCAN_SEC = 30
const NEXT_MS = 350
const SHOW_ANSWER_MS = 1100
// Long enough to read why, or which taps were off
const SHOW_MISS_MS = 2200
const SHOW_TAPS_MS = 1800
const EAR_GAP_MS = 750
const TAP_BPM = 76
const TAP_WINDOW_SEC = 0.16

type Answer = 'right' | 'wrong' | null
// A prompt scored out of 1: partly right for rhythms, all or nothing otherwise. key: the wrong one played.
type Score = (value: number, detail?: { key?: number; holdMs?: number }) => void

const TAP_MARK = (): Record<TapMark, string> => ({
  'on-time': t`On time`, early: t`A little early`, late: t`A little late`, missed: t`Missed`, extra: t`Extra tap`,
})

const DRILL_TAG = (check: Check): [string, string] => {
  switch (check.kind) {
    case 'tap': return [t`Rhythm`, 'var(--paint-lime)']
    case 'shapes': return [t`Memory`, 'var(--paint-rose)']
    case 'touch': return [t`Touch`, 'var(--paint-lime)']
    case 'chords': return [t`Chords`, 'var(--paint-yellow)']
    case 'quiz': return [t`Theory`, 'var(--sand)']
    case 'intervals': case 'chunks': return [t`Shape`, 'var(--paint-blue)']
    case 'scan': return [t`Scan`, 'var(--sand)']
    default: return [t`Notes`, 'var(--paint-yellow)']
  }
}

// Fires for every key that goes down on the MIDI keyboard
function useKeyPress(onPress: (key: number) => void) {
  const handler = useRef(onPress)
  handler.current = onPress
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.midiHeldKeys === prev.midiHeldKeys) return
    for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key)) handler.current(key)
  }), [])
}

const namesOf = (prompt: Prompt): string | null => (prompt.kind === 'note' ? prompt.name : null)

export default function DrillStep({ lesson, check, onPass }: { lesson: Lesson; check: Check; onPass: (percent: number) => void }) {
  const total = promptCount(check)
  const earlier = useMemo(() => earlierNotes(allLessons(trackUnits(COURSE, lesson.id)), lesson), [lesson])
  const missed = useRef<string[]>([])
  const lastPhrase = useRef<Struck[] | null>(null)
  const context = (index: number) => ({ index, earlier, missed: missed.current, exercises: EXERCISES, rng: Math.random })
  const [index, setIndex] = useState(0)
  const [prompt, setPrompt] = useState(() => nextPrompt(check, context(0)))
  const [score, setScore] = useState(0)
  const [answer, setAnswer] = useState<Answer>(null)
  const [wrongKey, setWrongKey] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const [results, setResults] = useState<boolean[]>([])

  // A ref, not the answer state: two keys in one update would both get past that
  const scoring = useRef(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const scorePrompt = useCallback<Score>((value, { key, holdMs } = {}) => {
    if (scoring.current) return
    scoring.current = true
    const miss = value < 1
    const name = namesOf(prompt)
    if (name && miss) missed.current = [...missed.current, name]
    setScore(s => s + value)
    setResults(r => [...r, !miss])
    setAnswer(miss ? 'wrong' : 'right')
    setWrongKey(miss ? key ?? null : null)
    timer.current = window.setTimeout(() => {
      scoring.current = false
      setAnswer(null)
      setIndex(i => {
        const next = i + 1
        if (next >= total) setFinished(true)
        else setPrompt(nextPrompt(check, context(next)))
        return next
      })
    }, holdMs ?? (name && miss ? SHOW_MISS_MS : miss ? SHOW_ANSWER_MS : NEXT_MS))
  }, [prompt, total, check])

  // Missed notes stay in the list: they keep coming back more often until they stick
  const retry = () => {
    setIndex(0); setScore(0); setFinished(false); setResults([])
    setPrompt(nextPrompt(check, context(0)))
  }

  if (finished) {
    const percent = Math.round((score / total) * 100)
    const passed = score / total >= PASS
    return (
      <div className="theme-paper lesson-result">
        <span className="lesson-result-score">{percent}%</span>
        <span className="o-note" style={{ flex: 1 }}>{passed ? t`Well read.` : t`You need 90% to go on. Try it again: it sticks with repetition.`}</span>
        {passed
          ? <button className="o-btn-primary o-btn-lg" onClick={() => onPass(percent)}>{t`Continue`}</button>
          : <button className="o-btn-primary o-btn-lg" onClick={retry}>{t`Try again`}</button>}
      </div>
    )
  }

  const answered = results.length
  const noteMiss = prompt.kind === 'note' && answer === 'wrong' && wrongKey !== null ? missedNote(prompt.name, wrongKey) : null
  const noteName = prompt.kind === 'note' && `${t`That was`} ${noteMiss?.played ?? noteLabel(prompt.name)}`
  const [tag, tagFill] = DRILL_TAG(check)
  return (
    <div className="lesson-drill">
      <div className="lesson-drill-head">
        <span className="lib-tag" style={{ background: tagFill }}>{`${tag} · ${lesson.id}`}</span>
        <span className="o-note" style={{ flex: 1 }}>{lesson.drill}</span>
        <span className="lesson-so-far">{`${answered ? t`${Math.round((score / answered) * 100)}% so far` : ''}${answered ? ' · ' : ''}${t`90% to pass`}`}</span>
      </div>
      <div className="lesson-stage">
        <PromptView key={index} prompt={prompt} answer={answer} lastPhrase={lastPhrase} onScore={scorePrompt} />
        <p aria-live="polite" className="lesson-answer" data-answer={answer ?? undefined}>
          {answer && <><span className="lesson-answer-word">{answer === 'right' ? t`Right` : t`Not quite`}</span>{noteName && <span>{noteName}</span>}</>}
        </p>
      </div>
      {prompt.kind === 'note' && <p className="lesson-miss" aria-live="polite">{noteMiss && <>
        <span>{noteMiss.amount === 'steps' ? (noteMiss.lower ? t`The note was ${noteMiss.want}, ${noteMiss.count} ${noteMiss.count === 1 ? t`step` : t`steps`} lower.` : t`The note was ${noteMiss.want}, ${noteMiss.count} ${noteMiss.count === 1 ? t`step` : t`steps`} higher.`)
          : noteMiss.amount === 'half' ? (noteMiss.lower ? t`The note was ${noteMiss.want}, a half step lower.` : t`The note was ${noteMiss.want}, a half step higher.`)
          : noteMiss.lower ? t`The note was ${noteMiss.want}, ${noteMiss.count} ${noteMiss.count === 1 ? t`octave` : t`octaves`} lower.` : t`The note was ${noteMiss.want}, ${noteMiss.count} ${noteMiss.count === 1 ? t`octave` : t`octaves`} higher.`}</span>
        <span className="o-note">{t`${noteMiss.want} comes back more often until it sticks.`}</span>
      </>}</p>}
      <div className="lesson-dots" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
        {Array.from({ length: total }, (_, i) => <span key={i} data-state={i < answered ? (results[i] ? 'right' : 'wrong') : i === index ? 'now' : undefined} />)}
      </div>
    </div>
  )
}

function PromptView({ prompt, answer, lastPhrase, onScore }: { prompt: Prompt; answer: Answer; lastPhrase: { current: Struck[] | null }; onScore: Score }) {
  switch (prompt.kind) {
    case 'keys': return <KeysPrompt prompt={prompt} onScore={onScore} />
    case 'note': return <NotePrompt prompt={prompt} onScore={onScore} />
    case 'chord': return <ChordPrompt prompt={prompt} onScore={onScore} />
    case 'shape': return <ShapePrompt prompt={prompt} answer={answer} onScore={onScore} />
    case 'choice': return (
      <>
        <h2 className="lesson-prompt">{prompt.question}</h2>
        <MiniStaff clef={prompt.clef} columns={prompt.columns} label={prompt.question} />
        <Options options={prompt.options} answer={answer} onPick={o => onScore(o === prompt.answer ? 1 : 0)} />
      </>
    )
    case 'scan': return <ScanPrompt prompt={prompt} answer={answer} onScore={onScore} />
    case 'tap': return <TapPrompt prompt={prompt} onScore={onScore} />
    case 'touch': return <TouchPrompt prompt={prompt} lastPhrase={lastPhrase} onScore={onScore} />
    case 'quiz': return <QuizPrompt prompt={prompt} answer={answer} onScore={onScore} />
  }
}

function Options({ options, answer, onPick }: { options: string[]; answer: Answer; onPick: (option: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null)
  return <div role="group" aria-label={t`Answer`} className="lesson-options">{options.map(o => <button key={o} aria-pressed={picked === o} data-answer={(picked === o && answer) || undefined} disabled={!!answer} onClick={() => { setPicked(o); onPick(o) }}>{o}</button>)}</div>
}

function KeysPrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'keys' }>; onScore: Score }) {
  useKeyPress(key => onScore(prompt.exact ? (key === 60 ? 1 : 0) : (key % 12 === 0 ? 1 : 0)))
  return (
    <>
      <h2 className="lesson-prompt">{prompt.exact ? t`Press Middle C` : t`Press any C`}</h2>
      <KeyMap highlight={prompt.exact ? 'middle' : 'c'} />
    </>
  )
}

function NotePrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'note' }>; onScore: Score }) {
  useKeyPress(key => onScore(key === midiOf(prompt.name) ? 1 : 0, { key }))
  return (
    <>
      <h2 className="lesson-prompt">{t`Press this note`}</h2>
      <MiniStaff clef={prompt.clef} columns={[[prompt.name]]} keyName={prompt.key} label={t`Press this note`} />
    </>
  )
}

function ChordPrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'chord' }>; onScore: Score }) {
  useKeyPress(key => {
    const result = chordPress(prompt, key, useStore.getState().midiHeldKeys)
    if (result !== 'more') onScore(result === 'done' ? 1 : 0)
  })
  const title = prompt.name ? t`Play ${prompt.name}` : prompt.notes.length === 2 ? t`Press both notes together` : t`Press these notes together`
  return (
    <>
      <h2 className="lesson-prompt">{title}</h2>
      {prompt.name ? <p className="o-note">{t`Any octave, any inversion.`}</p> : <MiniStaff clef={prompt.clef} columns={[prompt.notes]} label={title} />}
    </>
  )
}

const TOUCH_ASK = (): Record<TouchStyle, string> => ({
  soft: t`Play these softly`, loud: t`Play these loudly`, even: t`Play these evenly`,
  legato: t`Play these smoothly`, staccato: t`Play these short and light`, pedal: t`Play these, changing the pedal after each note`,
})

const TOUCH_MISS = (): Record<TouchStyle, string> => ({
  soft: t`Softer than the last phrase: a slower press, from close to the keys.`,
  loud: t`Louder than the last phrase: a quicker key, with the arm's weight behind it.`,
  even: t`Keep every note the same loudness and the same distance apart.`,
  legato: t`Hold each key until the next one goes down, then let go.`,
  staccato: t`Let each key spring back up well before the next note.`,
  pedal: t`After each note, lift the pedal and press it down again.`,
})

const TOUCH_UNSEEN = (): Partial<Record<TouchStyle, string>> => ({
  soft: t`Your keyboard sends the same touch for every note, so this passes on the notes alone.`,
  loud: t`Your keyboard sends the same touch for every note, so this passes on the notes alone.`,
  pedal: t`No pedal has been heard, so this passes on the notes alone.`,
})

// Other keys are ignored: this drill is about the touch, and the play steps check the notes
function TouchPrompt({ prompt, lastPhrase, onScore }: { prompt: Extract<Prompt, { kind: 'touch' }>; lastPhrase: { current: Struck[] | null }; onScore: Score }) {
  const struck = useRef<Struck[]>([])
  const pedal = useRef(0)
  const [count, setCount] = useState(0)
  const [note, setNote] = useState('')
  useEffect(() => {
    const unlisten = onLiveNote((key, vel) => {
      if (struck.current.length === prompt.notes.length || key !== midiOf(prompt.notes[struck.current.length])) return
      struck.current.push({ vel, on: performance.now(), pedal: pedal.current })
      pedal.current = 0
      setCount(struck.current.length)
      if (struck.current.length < prompt.notes.length) return
      const { detected } = useMidiSettings.getState()
      const { value, seen } = touchScore(prompt.style, struck.current, lastPhrase.current, !!detected.sustain)
      lastPhrase.current = struck.current
      if (!seen) setNote(TOUCH_UNSEEN()[prompt.style] ?? '')
      else if (value < 1) setNote(TOUCH_MISS()[prompt.style])
      onScore(value, { holdMs: !seen || value < 1 ? SHOW_MISS_MS : undefined })
    })
    const unkeys = useStore.subscribe((s, prev) => {
      if (s.midiHeldKeys === prev.midiHeldKeys) return
      for (const key of prev.midiHeldKeys) {
        if (s.midiHeldKeys.has(key)) continue
        const open = struck.current.findIndex((n, i) => n.off === undefined && midiOf(prompt.notes[i]) === key)
        if (open >= 0) struck.current[open].off = performance.now()
      }
    })
    const unpedal = useMidiSettings.subscribe((s, prev) => { if (s.sustainDown !== prev.sustainDown) pedal.current++ })
    return () => { unlisten(); unkeys(); unpedal() }
  }, [])
  const ask = TOUCH_ASK()[prompt.style]
  return (
    <>
      <h2 className="lesson-prompt">{ask}</h2>
      <MiniStaff clef={prompt.clef} columns={prompt.notes.map(n => [n])} label={ask} />
      <p className="o-note" aria-live="polite">{note || t`${count} of ${prompt.notes.length} notes`}</p>
    </>
  )
}

function QuizPrompt({ prompt, answer, onScore }: { prompt: Extract<Prompt, { kind: 'quiz' }>; answer: Answer; onScore: Score }) {
  const timers = useRef<number[]>([])
  const hear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = (prompt.hear ?? []).map((notes, i) => window.setTimeout(() => {
      for (const n of notes) (window as any).__pliagePlayNote?.(midiOf(n), 90, EAR_GAP_MS, undefined, false)
    }, i * EAR_GAP_MS))
  }
  useEffect(() => {
    hear()
    return () => timers.current.forEach(clearTimeout)
  }, [])
  return (
    <>
      <h2 className="lesson-prompt">{prompt.question}</h2>
      {prompt.hear && <button className="o-btn o-btn-lg" onClick={hear}>{t`Hear it again`}</button>}
      <Options options={prompt.options} answer={answer} onPick={o => onScore(o === prompt.answer ? 1 : 0)} />
    </>
  )
}

function ShapePrompt({ prompt, answer, onScore }: { prompt: Extract<Prompt, { kind: 'shape' }>; answer: Answer; onScore: Score }) {
  const [hidden, setHidden] = useState(false)
  const [looks, setLooks] = useState(0)
  const played = useRef(0)
  useEffect(() => {
    setHidden(false)
    played.current = 0
    const timer = setTimeout(() => setHidden(true), SHOW_SHAPE_MS)
    return () => clearTimeout(timer)
  }, [looks])
  useKeyPress(key => {
    if (!hidden) return
    if (key !== midiOf(prompt.names[played.current])) { onScore(0); return }
    if (++played.current === prompt.names.length) onScore(1)
  })
  return (
    <>
      <h2 className="lesson-prompt">{hidden ? t`Now play it from memory` : t`Look at the shape`}</h2>
      {hidden
        ? <div className="lesson-hidden"><EyeOff size={22} aria-hidden />{t`The notes are hidden. Play the bar you just read.`}</div>
        : <MiniStaff clef={prompt.clef} columns={prompt.names.map(n => [n])} label={t`Look at the shape`} />}
      {hidden
        ? <button className="o-btn o-btn-lg" disabled={!!answer} onClick={() => setLooks(n => n + 1)}>{t`Show it again`}</button>
        : <button className="o-btn-primary o-btn-lg" onClick={() => setHidden(true)}>{t`I've got it`}</button>}
    </>
  )
}

function MiniScore({ tex }: { tex: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let api: any = null
    let cancelled = false
    void import('@coderline/alphatab').then(at => {
      if (cancelled || !host.current) return
      api = new at.AlphaTabApi(host.current, {
        core: { useWorkers: false, smuflFontSources: new Map([[at.FontFileFormat.Woff2, new URL(bravuraUrl, document.baseURI).href]]) },
        display: { staveProfile: at.StaveProfile.Score },
      } as any)
      api.tex(tex)
    })
    return () => { cancelled = true; api?.destroy() }
  }, [tex])
  return <div ref={host} style={{ width: '100%', maxHeight: 340, overflow: 'auto', background: 'var(--paper-card)', borderRadius: 'var(--radius-md)' }} />
}

function ScanPrompt({ prompt, answer, onScore }: { prompt: Extract<Prompt, { kind: 'scan' }>; answer: Answer; onScore: Score }) {
  const [left, setLeft] = useState(SCAN_SEC)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft(n => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  if (left > 0) return (
    <>
      <MiniScore tex={prompt.tex} />
      <button className="o-btn-primary o-btn-lg" onClick={() => setLeft(0)}>{`${t`I've got it`} (${left})`}</button>
    </>
  )
  return (
    <>
      <h2 className="lesson-prompt">{prompt.question}</h2>
      <Options options={prompt.options} answer={answer} onPick={o => onScore(o === prompt.answer ? 1 : 0)} />
    </>
  )
}

function TapPrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'tap' }>; onScore: Score }) {
  const [state, setState] = useState<'ready' | 'going'>('ready')
  const [activeBeat, setActiveBeat] = useState<number | null>(null)
  const [marks, setMarks] = useState<(TapMark | null)[]>([])
  const taps = useRef<number[]>([])
  const start = useRef(0)
  const timers = useRef<number[]>([])
  const beatSec = 60 / TAP_BPM
  const { onsets, length } = tapBeats(prompt.tokens)
  const due = onsets.map(b => b * beatSec)
  const showMarks = (now = metronomeContext().currentTime - start.current) => setMarks(tapMarks(due, taps.current, TAP_WINDOW_SEC, now))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useKeyPress(() => {
    if (state !== 'going') return
    taps.current.push(metronomeContext().currentTime - start.current)
    showMarks()
  })

  const go = () => {
    const when = metronomeContext().currentTime + 0.1
    const countIn = prompt.beats
    start.current = when + countIn * beatSec
    taps.current = []
    // Fade drops the clicks halfway, so the student keeps the beat alone
    const clicks = prompt.fade ? countIn + Math.floor(length / 2) : countIn + length
    for (let i = 0; i < clicks; i++) scheduleMetronomeClick(when + i * beatSec, i % prompt.beats === 0)
    for (let beat = 0; beat < length; beat++) timers.current.push(window.setTimeout(() => setActiveBeat(beat), (0.1 + (countIn + beat) * beatSec) * 1000))
    for (const beat of [...onsets, length]) timers.current.push(window.setTimeout(showMarks, (0.1 + (countIn + beat) * beatSec + TAP_WINDOW_SEC * 2) * 1000))
    timers.current.push(window.setTimeout(() => {
      showMarks(Infinity)
      onScore(tapScore(due, taps.current, TAP_WINDOW_SEC), { holdMs: SHOW_TAPS_MS })
    }, (0.1 + (countIn + length) * beatSec + TAP_WINDOW_SEC) * 1000))
    setState('going')
  }

  const label = TAP_MARK()
  return (
    <>
      <h2 className="lesson-prompt">{prompt.fade ? t`Keep tapping when the clicks stop. Any key counts.` : t`Tap this rhythm on any key after the count-in.`}</h2>
      <RhythmLine tokens={prompt.tokens} beats={prompt.beats} activeBeat={activeBeat} />
      {state === 'ready' && <button className="o-btn-primary o-btn-lg" onClick={go}>{t`Start`}</button>}
      {state === 'going' && <div className="lesson-taps" role="status" aria-label={t`Your taps`}>
        {onsets.map((beat, i) => <span key={beat} style={{ flex: (onsets[i + 1] ?? length) - beat }} data-mark={marks[i] ?? undefined}>{marks[i] && label[marks[i]!]}</span>)}
        {marks.slice(onsets.length).map((_, i) => <span key={i} style={{ flex: 1 }} data-mark="extra">{label.extra}</span>)}
      </div>}
    </>
  )
}
