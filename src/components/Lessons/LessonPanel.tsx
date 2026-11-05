import { ArrowLeft, ArrowRight, Check as CheckIcon, Play } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { COURSE, LESSONS, lessonById } from '../../lessons/courseData'
import { isOpen } from '../../lessons/progress'
import { drillPassed, exitLesson, lessonScores, nextStep, startLesson, stepsOf, type LessonStep } from '../../lessons/session'
import type { Check, Clef, Lesson } from '../../lessons/course'
import DrillStep from './DrillStep'
import MiniStaff, { HeldKeys, KeyMap, RhythmLine } from './MiniStaff'

const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*/g, '')

const texClef = (tex: string): Clef => (tex.includes('\\clef F4') ? (tex.includes('\\clef G2') ? 'grand' : 'bass') : tex.includes('\\clef G2') && tex.split('\\staff').length > 2 ? 'grand' : 'treble')

function LearnPicture({ lesson }: { lesson: Lesson }) {
  const check: Check | undefined = lesson.check
  if (check?.kind === 'keys') return <KeyMap highlight="c" />
  if (check?.kind === 'tap') return <RhythmLine tokens={check.patterns[1] ?? check.patterns[0]} beats={check.beats} />
  if (check?.kind === 'notes') return <MiniStaff clef={check.clef} columns={check.notes.map(n => [n])} keyName={check.key} label={lesson.title} />
  if (lesson.tex && lesson.notes) {
    const key = lesson.tex.match(/\\ks (\w+)/)?.[1]
    return <MiniStaff clef={texClef(lesson.tex)} columns={lesson.notes.map(n => [n])} keyName={key} label={lesson.title} />
  }
  return null
}

const STEP_TEXT = (): Record<LessonStep, [string, string]> => ({
  hear: [t`Hear`, t`Listen and follow the score`],
  learn: [t`Learn`, t`One idea, on a small score`],
  drill: [t`Drill`, t`A short check, 90% to pass`],
  wait: [t`Play, waiting`, t`The music waits for you`],
  time: [t`Play in time`, t`90% twice in a row`],
  done: ['', ''],
})

function Steps({ lesson, step }: { lesson: Lesson; step: LessonStep }) {
  const steps = stepsOf(lesson)
  const now = steps.indexOf(step)
  const text = STEP_TEXT()
  return (
    <ol className="lesson-steps">
      {steps.map((s, i) => (
        <li key={s} data-state={i < now ? 'done' : i === now ? 'now' : 'todo'} aria-current={i === now ? 'step' : undefined}>
          <span className="lesson-step-dot">{i < now ? <CheckIcon size={14} aria-hidden /> : i === now ? <Play size={13} fill="currentColor" aria-hidden /> : null}</span>
          <span className="lesson-step-text"><span className="lesson-step-name">{text[s][0]}</span><span className="o-note">{text[s][1]}</span></span>
        </li>
      ))}
    </ol>
  )
}

function Passed({ lesson, canGoOn, after }: { lesson: Lesson; canGoOn: boolean; after?: Lesson }) {
  const passed = useStore(s => s.lessonPassed)
  const unit = COURSE.find(u => u.lessons.includes(lesson))
  const done = unit ? unit.lessons.filter(l => passed.includes(l.id)).length : 0
  const { drill, runs } = lessonScores()
  const stats: [string, number][] = [...(drill === null ? [] : [[t`Drill`, drill] as [string, number]]), ...runs.map((r, i) => [t`In time, run ${i + 1}`, r] as [string, number])]
  return (
    <div className="theme-paper lesson-passed">
      <span className="o-disc" style={{ right: -80, top: -80, width: 420, height: 420, background: 'var(--paint-lime)' }} aria-hidden />
      <span className="o-triangle" style={{ right: 300, top: 120, width: 90, height: 80, transform: 'rotate(-12deg)' }} aria-hidden />
      <span className="lesson-passed-star" aria-hidden />
      <div className="lesson-passed-text">
        <span className="lesson-passed-tag"><CheckIcon size={16} color="var(--paint-lime)" aria-hidden />{t`Lesson passed`}</span>
        <h1 className="lesson-passed-title">{lesson.title}</h1>
        <span className="lesson-passed-goal">{`${t`Lesson`} ${lesson.id} · ${lesson.goal}`}</span>
        {stats.length > 0 && <div className="lesson-stats">
          {stats.map(([name, value]) => <div key={name} className="lesson-stat"><span className="o-note">{name}</span><span className="lesson-stat-value">{`${value}%`}</span></div>)}
        </div>}
        {unit && <div className="lesson-unit">
          <span>{`${t`Unit`} ${unit.n} · ${unit.title} · ${t`${done} of ${unit.lessons.length}`}`}</span>
          <div className="lesson-unit-bar" role="img" aria-label={t`Unit ${unit.n}: ${done} of ${unit.lessons.length} lessons passed`}>
            {unit.lessons.map((l, i) => <span key={l.id} data-on={i < done || undefined} />)}
          </div>
        </div>}
      </div>
      <span className="o-spacer" />
      <div className="theme-studio lesson-next">
        {canGoOn && after ? <>
          <span className="lesson-next-text">
            <span style={{ color: 'var(--stone)', fontSize: 'var(--text-base)' }}>{t`Next`}</span>
            <span className="lesson-next-title">{`${after.id} ${after.title}`} <span className="lesson-next-goal">{`· ${after.goal}`}</span></span>
          </span>
          <button className="o-btn o-btn-lg" onClick={exitLesson}>{t`Back to Learn`}</button>
          <button className="o-btn-primary o-btn-lg" onClick={() => void startLesson(after.id)}>{t`Next lesson`}<ArrowRight size={16} aria-hidden /></button>
        </> : <>
          <span className="o-spacer" />
          <button className="o-btn-primary o-btn-lg" onClick={exitLesson}>{t`Back to Learn`}</button>
        </>}
      </div>
    </div>
  )
}

// ── Learn, Drill and the end of a lesson: the steps that sit over the score ──
export default function LessonPanel() {
  const run = useStore(s => s.lessonRun)
  const passed = useStore(s => s.lessonPassed)
  const connected = useStore(s => s.midiDeviceConnected)
  const lesson = run && lessonById(run.id)
  if (!lesson || (run.step !== 'learn' && run.step !== 'drill' && run.step !== 'done')) return null

  const index = LESSONS.indexOf(lesson)
  const after = LESSONS[index + 1]
  const canGoOn = !!after && isOpen(COURSE, passed, after.id)
  return (
    <div className="lesson-page">
      {/* alphaTab's cursor sits above everything, so it would show through */}
      <style>{'[data-score-view] .at-cursors { visibility: hidden; }'}</style>
      {run.step === 'done' ? <Passed lesson={lesson} canGoOn={canGoOn} after={after} /> : <>
        <aside className="theme-paper lesson-aside">
          <button className="o-btn" style={{ alignSelf: 'flex-start' }} onClick={exitLesson}><ArrowLeft size={16} aria-hidden />{t`Leave lesson`}</button>
          <div className="lesson-aside-head">
            <span className="lib-tag" style={{ background: 'var(--paint-rose)' }}>{`${t`Lesson`} ${lesson.id}`}</span>
            <h1 className="lesson-aside-title">{lesson.title}</h1>
            <span className="o-note">{lesson.goal}</span>
          </div>
          <Steps lesson={lesson} step={run.step} />
          {run.step === 'drill' && lesson.check?.kind === 'notes' && <>
            <span className="o-spacer" />
            <span className="o-note">{t`About 30% of the notes come from earlier lessons, and notes you missed lately come up more often.`}</span>
          </>}
        </aside>
        <main className="lesson-main">
          <div className="lesson-work">
            {run.step === 'learn' && <>
              <p className="lesson-learn-text">{plain(lesson.learn ?? '')}</p>
              <div className="lesson-stage"><LearnPicture lesson={lesson} /></div>
              {lesson.after && <p className="o-note">{plain(lesson.after)}</p>}
              <button className="o-btn-primary o-btn-lg" style={{ alignSelf: 'flex-start' }} onClick={nextStep}>{t`Continue`}</button>
            </>}
            {run.step === 'drill' && lesson.check && <>
              {!connected && lesson.check.kind !== 'chunks' && lesson.check.kind !== 'scan' && lesson.check.kind !== 'intervals' && <div role="alert" className="lesson-alert"><span className="o-dot o-dot-alert" />{t`This drill needs a MIDI keyboard. Connect one and press a key.`}</div>}
              <DrillStep key={lesson.id} lesson={lesson} check={lesson.check} onPass={percent => { drillPassed(percent); nextStep() }} />
            </>}
          </div>
          <HeldKeys height={200} className="lesson-keys" />
        </main>
      </>}
    </div>
  )
}
