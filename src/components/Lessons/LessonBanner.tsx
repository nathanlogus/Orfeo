import { useEffect } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { usePlayback } from '../../hooks/usePlayback'
import { lessonById } from '../../lessons/courseData'
import { beginAttempt, exitLesson, nextStep, stepsOf } from '../../lessons/session'

// ── The lesson's strip above the score, for the steps played on it ───────────
export default function LessonBanner() {
  const run = useStore(s => s.lessonRun)
  const playing = useStore(s => s.playbackState === 'playing' || !!s.countIn)
  const connected = useStore(s => s.midiDeviceConnected)
  const { play, stop } = usePlayback()
  const step = run?.step

  // Every step starts from the top, and leaving a lesson stops its music
  useEffect(() => { stop() }, [step, stop])
  useEffect(() => () => stop(), [stop])
  useEffect(() => () => {
    // Lessons can leave the app while the score is hidden behind Home. Clear
    // the lesson-only cursor treatment as the banner unmounts as a safeguard.
    document.documentElement.classList.remove('lesson-hide-bar')
  }, [])

  const lesson = run && lessonById(run.id)
  if (!lesson || (step !== 'hear' && step !== 'wait' && step !== 'time')) return null

  const text = step === 'hear' ? t`Listen and follow the score.`
    : step === 'wait' ? t`Play each note. The music waits for you.`
    : run.percent === null ? t`Now play it in time, with a count-in. Get 90% twice in a row.`
    : run.clean > 0 ? `${run.percent}%. ${t`One more clean run.`}`
    : `${run.percent}%. ${t`You need 90%, twice in a row. Go again.`}`
  const steps = stepsOf(lesson)

  return (
    <div className="lesson-strip" role="status">
      <span className="lesson-strip-tag">{`${t`Lesson`} ${lesson.id}`}</span>
      <span key={step} className="lesson-strip-text">
        <span className="lesson-strip-main">{step !== 'hear' && !connected ? t`Connect a MIDI keyboard to play this step.` : text}</span>
        <span className="lesson-strip-sub">{`${lesson.title} · ${t`step ${steps.indexOf(step) + 1} of ${steps.length}`}`}</span>
      </span>
      {step === 'time' && <span className="lesson-strip-runs" aria-label={t`Runs in time`}>
        <span data-done={run.clean > 0 || undefined}>{run.clean > 0 ? `${t`Run 1`} · ${run.percent}%` : t`Run 1`}</span>
        <span>{t`Run 2`}</span>
      </span>}
      <button className="o-link lesson-strip-leave" onClick={exitLesson}>{t`Leave lesson`}</button>
      {step === 'hear' && <button className="lesson-strip-btn" data-outline onClick={nextStep}>{t`Continue`}<ChevronRight size={16} aria-hidden /></button>}
      <button className="lesson-strip-btn" data-instant disabled={playing} onClick={() => { beginAttempt(); void play() }}><Play size={14} fill="currentColor" aria-hidden />{run.percent === null ? t`Start` : t`Go again`}</button>
    </div>
  )
}
