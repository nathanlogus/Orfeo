import { useEffect } from 'react'
import { ChevronRight, Play, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { usePlayback } from '../../hooks/usePlayback'
import { lessonById } from '../../lessons/courseData'
import { beginAttempt, exitLesson, nextStep } from '../../lessons/session'

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

  const lesson = run && lessonById(run.id)
  if (!lesson || (step !== 'hear' && step !== 'wait' && step !== 'time')) return null

  const text = step === 'hear' ? t`Listen and follow the score.`
    : step === 'wait' ? t`Play each note. The music waits for you.`
    : run.percent === null ? t`Now play it in time, with a count-in. Get 90% twice in a row.`
    : run.clean > 0 ? `${run.percent}%. ${t`One more clean run.`}`
    : `${run.percent}%. ${t`You need 90%, twice in a row. Go again.`}`

  return (
    <div className="lesson-banner" role="status">
      <span className="home-heading" style={{ margin: 0, padding: 0 }}>{`${t`Lesson`} ${lesson.id}`}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{step !== 'hear' && !connected ? t`Connect a MIDI keyboard to play this step.` : text}</span>
      <button className="home-action home-primary" disabled={playing} onClick={() => { beginAttempt(); void play() }}><Play size={14} aria-hidden />{t`Start`}</button>
      {step === 'hear' && <button className="home-action" onClick={nextStep}>{t`Continue`}<ChevronRight size={14} aria-hidden /></button>}
      <button className="home-icon" onClick={exitLesson} aria-label={t`Leave lesson`}><X size={16} /></button>
    </div>
  )
}
