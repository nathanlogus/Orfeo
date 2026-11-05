import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import bravuraUrl from '@coderline/alphatab/font/Bravura.woff2?url'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { metronomeContext, scheduleMetronomeClick } from '../../hooks/useMetronome'
import { earlierNotes, midiOf, nextPrompt, noteParts, promptCount, tapBeats, type Prompt } from '../../lessons/drill'
import { EXERCISES, LESSONS } from '../../lessons/courseData'
import { PASS, tapScore } from '../../lessons/progress'
import type { Check, Lesson } from '../../lessons/course'
import MiniStaff, { KeyMap, RhythmLine } from './MiniStaff'

const SHOW_SHAPE_MS = 3000
const SCAN_SEC = 30
const NEXT_MS = 350
const SHOW_ANSWER_MS = 1100
const TAP_BPM = 76
const TAP_WINDOW_SEC = 0.16

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

export default function DrillStep({ lesson, check, onPass }: { lesson: Lesson; check: Check; onPass: () => void }) {
  const total = promptCount(check)
  const earlier = useMemo(() => earlierNotes(LESSONS, lesson), [lesson])
  const missed = useRef<string[]>([])
  const context = (index: number) => ({ index, earlier, missed: missed.current, exercises: EXERCISES, rng: Math.random })
  const [index, setIndex] = useState(0)
  const [prompt, setPrompt] = useState(() => nextPrompt(check, context(0)))
  const [score, setScore] = useState(0)
  const [answer, setAnswer] = useState<'right' | 'wrong' | null>(null)
  const [finished, setFinished] = useState(false)

  // A prompt scored out of 1: partly right for rhythms, all or nothing otherwise
  const scorePrompt = useCallback((value: number) => {
    if (answer) return
    const miss = value < 1
    const name = namesOf(prompt)
    if (name && miss) missed.current = [...missed.current, name]
    setScore(s => s + value)
    setAnswer(miss ? 'wrong' : 'right')
    setTimeout(() => {
      setAnswer(null)
      setIndex(i => {
        const next = i + 1
        if (next >= total) setFinished(true)
        else setPrompt(nextPrompt(check, context(next)))
        return next
      })
    }, miss ? SHOW_ANSWER_MS : NEXT_MS)
  }, [answer, prompt, total, check])

  const retry = () => {
    missed.current = []
    setIndex(0); setScore(0); setFinished(false)
    setPrompt(nextPrompt(check, context(0)))
  }

  if (finished) {
    const percent = Math.round((score / total) * 100)
    const passed = score / total >= PASS
    return (
      <div className="lesson-drill">
        <p className="lesson-big">{percent}%</p>
        <p>{passed ? t`Well read.` : t`You need 90% to go on. Try it again: it sticks with repetition.`}</p>
        {passed
          ? <button className="home-action home-primary" onClick={onPass}>{t`Continue`}</button>
          : <button className="home-action home-primary" onClick={retry}>{t`Try again`}</button>}
      </div>
    )
  }

  return (
    <div className="lesson-drill">
      <div className="lesson-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}><span style={{ width: `${(index / total) * 100}%` }} /></div>
      <PromptView key={index} prompt={prompt} answer={answer} onScore={scorePrompt} />
      <p aria-live="polite" className={answer === 'wrong' ? 'lesson-wrong' : 'lesson-right'} style={{ minHeight: '1.5em' }}>
        {answer === 'right' && t`Right`}
        {answer === 'wrong' && (prompt.kind === 'note' ? `${t`That was`} ${noteParts(prompt.name).letter}${noteParts(prompt.name).accidental.replace('#', '♯').replace('b', '♭')}` : t`Not quite`)}
      </p>
    </div>
  )
}

function PromptView({ prompt, answer, onScore }: { prompt: Prompt; answer: 'right' | 'wrong' | null; onScore: (value: number) => void }) {
  switch (prompt.kind) {
    case 'keys': return <KeysPrompt prompt={prompt} onScore={onScore} />
    case 'note': return <NotePrompt prompt={prompt} onScore={onScore} />
    case 'pair': return <PairPrompt prompt={prompt} onScore={onScore} />
    case 'shape': return <ShapePrompt prompt={prompt} onScore={onScore} />
    case 'choice': return (
      <>
        <p>{prompt.question}</p>
        <MiniStaff clef={prompt.clef} columns={prompt.columns} label={prompt.question} />
        <Options options={prompt.options} answer={answer} onPick={o => onScore(o === prompt.answer ? 1 : 0)} />
      </>
    )
    case 'scan': return <ScanPrompt prompt={prompt} answer={answer} onScore={onScore} />
    case 'tap': return <TapPrompt prompt={prompt} onScore={onScore} />
  }
}

function Options({ options, answer, onPick }: { options: string[]; answer: unknown; onPick: (option: string) => void }) {
  return <div className="lesson-options">{options.map(o => <button key={o} className="home-action" disabled={!!answer} onClick={() => onPick(o)}>{o}</button>)}</div>
}

function KeysPrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'keys' }>; onScore: (v: number) => void }) {
  useKeyPress(key => onScore(prompt.exact ? (key === 60 ? 1 : 0) : (key % 12 === 0 ? 1 : 0)))
  return (
    <>
      <p>{prompt.exact ? t`Press Middle C` : t`Press any C`}</p>
      <KeyMap highlight={prompt.exact ? 'middle' : 'c'} />
    </>
  )
}

function NotePrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'note' }>; onScore: (v: number) => void }) {
  useKeyPress(key => onScore(key === midiOf(prompt.name) ? 1 : 0))
  return (
    <>
      <p>{t`Press this note`}</p>
      <MiniStaff clef={prompt.clef} columns={[[prompt.name]]} keyName={prompt.key} label={t`Press this note`} />
    </>
  )
}

function PairPrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'pair' }>; onScore: (v: number) => void }) {
  const want = [midiOf(prompt.left), midiOf(prompt.right)]
  useKeyPress(key => {
    if (!want.includes(key)) { onScore(0); return }
    const held = useStore.getState().midiHeldKeys
    if (want.every(k => held.has(k))) onScore(1)
  })
  return (
    <>
      <p>{t`Press both notes together`}</p>
      <MiniStaff clef="grand" columns={[[prompt.left, prompt.right]]} label={t`Press both notes together`} />
    </>
  )
}

function ShapePrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'shape' }>; onScore: (v: number) => void }) {
  const [hidden, setHidden] = useState(false)
  const played = useRef(0)
  useEffect(() => {
    const timer = setTimeout(() => setHidden(true), SHOW_SHAPE_MS)
    return () => clearTimeout(timer)
  }, [])
  useKeyPress(key => {
    if (!hidden) return
    if (key !== midiOf(prompt.names[played.current])) { onScore(0); return }
    if (++played.current === prompt.names.length) onScore(1)
  })
  return (
    <>
      <p>{hidden ? t`Now play it from memory` : t`Look at the shape`}</p>
      <MiniStaff clef={prompt.clef} columns={hidden ? [] : prompt.names.map(n => [n])} label={t`Look at the shape`} />
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
  return <div ref={host} style={{ width: '100%', maxHeight: 340, overflow: 'auto', background: '#fff', borderRadius: 'var(--radius-md)' }} />
}

function ScanPrompt({ prompt, answer, onScore }: { prompt: Extract<Prompt, { kind: 'scan' }>; answer: unknown; onScore: (v: number) => void }) {
  const [left, setLeft] = useState(SCAN_SEC)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft(n => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  if (left > 0) return (
    <>
      <MiniScore tex={prompt.tex} />
      <button className="home-action" onClick={() => setLeft(0)}>{`${t`I've got it`} (${left})`}</button>
    </>
  )
  return (
    <>
      <p>{prompt.question}</p>
      <Options options={prompt.options} answer={answer} onPick={o => onScore(o === prompt.answer ? 1 : 0)} />
    </>
  )
}

function TapPrompt({ prompt, onScore }: { prompt: Extract<Prompt, { kind: 'tap' }>; onScore: (v: number) => void }) {
  const [state, setState] = useState<'ready' | 'going'>('ready')
  const [activeBeat, setActiveBeat] = useState<number | null>(null)
  const taps = useRef<number[]>([])
  const start = useRef(0)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useKeyPress(() => { if (state === 'going') taps.current.push(metronomeContext().currentTime - start.current) })

  const go = () => {
    const beatSec = 60 / TAP_BPM
    const { onsets, length } = tapBeats(prompt.tokens)
    const when = metronomeContext().currentTime + 0.1
    const countIn = prompt.beats
    start.current = when + countIn * beatSec
    taps.current = []
    // Fade drops the clicks halfway, so the student keeps the beat alone
    const clicks = prompt.fade ? countIn + Math.floor(length / 2) : countIn + length
    for (let i = 0; i < clicks; i++) scheduleMetronomeClick(when + i * beatSec, i % prompt.beats === 0)
    for (let beat = 0; beat < length; beat++) timers.current.push(window.setTimeout(() => setActiveBeat(beat), (0.1 + (countIn + beat) * beatSec) * 1000))
    timers.current.push(window.setTimeout(() => {
      onScore(tapScore(onsets.map(b => b * beatSec), taps.current, TAP_WINDOW_SEC))
    }, (0.1 + (countIn + length) * beatSec + TAP_WINDOW_SEC) * 1000))
    setState('going')
  }

  return (
    <>
      <p>{prompt.fade ? t`Keep tapping when the clicks stop. Any key counts.` : t`Tap this rhythm on any key after the count-in.`}</p>
      <RhythmLine tokens={prompt.tokens} beats={prompt.beats} activeBeat={activeBeat} />
      {state === 'ready' && <button className="home-action home-primary" onClick={go}>{t`Start`}</button>}
    </>
  )
}
