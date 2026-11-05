import { X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { COURSE, LESSONS, lessonById } from '../../lessons/courseData'
import { isOpen } from '../../lessons/progress'
import { exitLesson, nextStep, startLesson } from '../../lessons/session'
import type { Check, Clef, Lesson } from '../../lessons/course'
import DrillStep from './DrillStep'
import MiniStaff, { KeyMap, RhythmLine } from './MiniStaff'

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

// ── Learn, Drill and the end of a lesson: the steps that sit over the score ──
export default function LessonPanel() {
  const run = useStore(s => s.lessonRun)
  const passed = useStore(s => s.lessonPassed)
  const connected = useStore(s => s.midiDeviceConnected)
  const lesson = run && lessonById(run.id)
  if (!lesson || (run.step !== 'learn' && run.step !== 'drill' && run.step !== 'done')) return null

  const index = LESSONS.indexOf(lesson)
  const after = LESSONS[index + 1]
  const canGoOn = after && isOpen(COURSE, passed, after.id)
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 61, display: 'flex', flexDirection: 'column', background: 'var(--bg-modal-header)', color: 'var(--text-default)', overflowY: 'auto' }}>
      {/* alphaTab's cursor sits above everything, so it would show through */}
      <style>{'[data-score-view] .at-cursors { visibility: hidden; }'}</style>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border2)' }}>
        <span className="home-heading" style={{ margin: 0, padding: 0 }}>{`${t`Lesson`} ${lesson.id}`}</span>
        <h1 style={{ flex: 1, margin: 0, color: 'var(--text-active)', fontSize: 'var(--text-lg)' }}>{lesson.title}</h1>
        <button className="home-icon" onClick={exitLesson} aria-label={t`Leave lesson`}><X size={16} /></button>
      </header>
      <div className="lesson-body">
        {run.step === 'learn' && <>
          <p className="lesson-goal">{lesson.goal}</p>
          <p>{plain(lesson.learn ?? '')}</p>
          <LearnPicture lesson={lesson} />
          {lesson.after && <p style={{ color: 'var(--text-muted)' }}>{plain(lesson.after)}</p>}
          <button className="home-action home-primary" onClick={nextStep}>{t`Continue`}</button>
        </>}
        {run.step === 'drill' && lesson.check && <>
          {lesson.drill && <p className="lesson-goal">{lesson.drill}</p>}
          {!connected && lesson.check.kind !== 'chunks' && lesson.check.kind !== 'scan' && lesson.check.kind !== 'intervals' && <div role="alert" className="home-error">{t`This drill needs a MIDI keyboard. Connect one and press a key.`}</div>}
          <DrillStep key={lesson.id} lesson={lesson} check={lesson.check} onPass={nextStep} />
        </>}
        {run.step === 'done' && <>
          <p className="lesson-big">{t`Lesson passed`}</p>
          <p>{lesson.goal}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {canGoOn && <button className="home-action home-primary" onClick={() => void startLesson(after.id)}>{t`Next lesson`}</button>}
            <button className="home-action" onClick={exitLesson}>{t`Back to Learn`}</button>
          </div>
        </>}
      </div>
    </div>
  )
}
