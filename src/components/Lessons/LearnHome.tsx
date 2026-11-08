import { Fragment, useEffect, useState } from 'react'
import { Check, Lock, Play, Sparkles, Timer, TrendingUp } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { COURSE, LESSONS, SHELF } from '../../lessons/courseData'
import { allLessons } from '../../lessons/course'
import { isOpen, nextLesson } from '../../lessons/progress'
import { openPiece, startLesson } from '../../lessons/session'
import { CARD_FILLS } from '../SongBrowser/SongBrowser'
import { EXPLORE_TOOLS } from './exploreTools'
import { practiceDayKey, practiceStreak, type PracticeDays } from '../../utils/practiceTime'

const TRACK_NAME = (): Record<string, string> => ({ 'Reading music': t`Reading music`, 'Piano skills': t`Piano skills` })
const TRACKS = [...new Set(COURSE.map(u => u.track))]
const unitsOf = (track: string) => COURSE.filter(u => u.track === track)

// ── The course on the home page: units down the side, lessons in the middle ──
export default function LearnHome() {
  const passed = useStore(s => s.lessonPassed)
  const connected = useStore(s => s.midiDeviceConnected)
  const first = nextLesson(COURSE, passed)
  const [chosen, setChosen] = useState<number | 'pieces' | null>(null)
  const [practiceDays, setPracticeDays] = useState<PracticeDays>({})
  const [challenge, setChallenge] = useState<{ id: string; title: string } | null>(null)
  useEffect(() => {
    const load = () => void window.electronAPI.getPrefs().then(p => setPracticeDays(p.practiceDays ?? {})).catch(() => {})
    load(); window.addEventListener('pliage-practice-days', load)
    return () => window.removeEventListener('pliage-practice-days', load)
  }, [])
  // Turn existing score lessons into no-preview sight-reading attempts. This
  // makes the challenge pool broad enough to move through course difficulty.
  const sightLessons = LESSONS.filter(l => l.tex || l.file)
  const startSight = () => {
    const sorted = [...sightLessons].sort((a, b) => a.id.localeCompare(b.id))
    const progress = LESSONS.length ? passed.length / LESSONS.length : 0
    const level = Math.min(4, Math.floor(progress * 5))
    const bands = [0, 0.2, 0.4, 0.6, 0.8]
    const band = sorted.filter((_, i) => i / Math.max(1, sorted.length - 1) >= bands[level] && i / Math.max(1, sorted.length - 1) < (bands[level + 1] ?? 1.01))
    const pool = band.length ? band : sorted.slice(-1)
    const pick = pool[(new Date().getDate() + passed.length) % pool.length]
    if (pick) { setChallenge({ id: pick.id, title: pick.title }); void startLesson(pick.id, 'sight') }
  }
  const startWorkout = () => {
    const pool = LESSONS.filter(l => l.check && (l.tex || l.file))
    const pick = pool.find(l => !passed.includes(l.id)) ?? pool[new Date().getDate() % pool.length]
    if (pick) void startLesson(pick.id)
  }
  const todayKey = practiceDayKey()
  const minutes = Math.floor((practiceDays[todayKey]?.seconds ?? 0) / 60)
  const streak = practiceStreak(practiceDays, todayKey)
  const weekMinutes = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    return practiceDays[practiceDayKey(d)]?.seconds ?? 0
  }).reduce((sum, seconds) => sum + seconds, 0) / 60
  const unit = COURSE.find(u => u.n === chosen) ?? COURSE.find(u => u.lessons.some(l => l.id === first?.id)) ?? COURSE[COURSE.length - 1]
  // Up next, and Continue, stay on the track being looked at
  const next = nextLesson(unitsOf(unit.track), passed)
  const trackStarted = allLessons(unitsOf(unit.track)).some(l => passed.includes(l.id))

  return (
    <div className="learn">
      <nav aria-label={t`Units`} className="learn-nav pliage-rise-in pliage-rise-in-2">
        {TRACKS.map(track => {
          const lessons = allLessons(unitsOf(track))
          return (
            <Fragment key={track}>
              <h3 className="lib-nav-head">{`${TRACK_NAME()[track]} · ${t`${lessons.filter(l => passed.includes(l.id)).length} of ${lessons.length} lessons`}`}</h3>
              {unitsOf(track).map(u => (
                <button key={u.n} className="lib-nav-item learn-unit" aria-pressed={chosen !== 'pieces' && u.n === unit.n} onClick={() => setChosen(u.n)}>
                  <span className="learn-unit-n">{u.n}</span>
                  <span className="lib-ellipsis" style={{ flex: 1 }}>{u.title}</span>
                  <span className="learn-unit-n">{`${u.lessons.filter(l => passed.includes(l.id)).length}/${u.lessons.length}`}</span>
                </button>
              ))}
            </Fragment>
          )
        })}
        <h3 className="lib-nav-head">{t`Practice`}</h3>
        <button className="lib-nav-item learn-unit" aria-pressed={chosen === 'pieces'} onClick={() => setChosen('pieces')}>
          <span style={{ flex: 1 }}>{t`Pieces`}</span>
          <span className="learn-unit-n">{SHELF.length}</span>
        </button>
        <h3 className="lib-nav-head">{t`Explore`}</h3>
        {EXPLORE_TOOLS.map(tool => (
          <button key={tool.id} className="lib-nav-item learn-unit" onClick={tool.open}>
            <span style={{ flex: 1 }}>{tool.name()}</span>
          </button>
        ))}
      </nav>
      {chosen === 'pieces' ? <main className="learn-main pliage-rise-in pliage-rise-in-3">
        <h1 className="learn-title">{t`Pieces`}</h1>
        <p className="o-note">{t`Real music to play once you've done the unit shown. Public domain, from dacapo, OpenGoldberg, PianoXML and PDMX.`}</p>
        <div className="learn-pieces">
          {SHELF.map((piece, i) => (
            <button key={piece.file} className="learn-piece" style={{ background: CARD_FILLS[i % CARD_FILLS.length] }} onClick={() => void openPiece(piece.file, piece.title)}>
              <span className="lib-tag">{`${t`Unit`} ${piece.after}`}</span>
              <span className="learn-piece-text">
                <span className="learn-piece-title">{piece.title}</span>
                <span className="learn-piece-why">{piece.why}</span>
              </span>
            </button>
          ))}
        </div>
      </main> : <main className="learn-main pliage-rise-in pliage-rise-in-3">
        <section className="learn-feature-cards" aria-label={t`Practice tools`}>
          <article className="learn-feature-card"><Sparkles size={18} /><strong>{t`Sight-reading challenge`}</strong><span>{challenge ? `${t`Last challenge`}: ${challenge.title}` : t`A no-preview score exercise, matched to your course progress.`}</span><button className="o-btn-primary" onClick={startSight} disabled={!sightLessons.length}>{t`Start challenge`}</button></article>
          <article className="learn-feature-card"><Timer size={18} /><strong>{t`Practice time`}</strong><span>{t`${minutes} min today · ${Math.round(weekMinutes)} min this week`}</span><small>{t`${practiceDays[todayKey]?.sessions ?? 0} sessions today · ${streak} day streak. Time counts while a song is playing.`}</small></article>
          <article className="learn-feature-card"><TrendingUp size={18} /><strong>{t`5-minute skill workout`}</strong><span>{t`A short scored exercise selected from your lesson course.`}</span><button className="o-btn" onClick={startWorkout}>{t`Start workout`}</button></article>
        </section>
        <div className="learn-head">
          <div className="learn-head-text">
            <span className="lib-tag" style={{ background: 'var(--paint-rose)' }}>{`${t`Unit`} ${unit.n}`}</span>
            <h1 className="learn-title">{unit.title}</h1>
          </div>
          {next
            ? <button className="o-btn-primary learn-go" onClick={() => void startLesson(next.id)}><Play size={14} fill="currentColor" aria-hidden /><span className="lib-ellipsis">{`${trackStarted ? t`Continue` : t`Start`}: ${next.title}`}</span></button>
            : <span className="learn-title" style={{ fontSize: 'var(--text-xl)' }}>{t`Course complete`}</span>}
        </div>
        {unit.intro && <p className="o-note">{unit.intro}</p>}
        {!connected && <div role="alert" className="lib-alert" style={{ margin: 0 }}><span className="o-dot o-dot-alert" />{t`Lessons listen to a MIDI keyboard. Connect one to play along.`}</div>}
        <div className="learn-rows">
          {unit.lessons.map((lesson, i) => {
            const done = passed.includes(lesson.id)
            const open = isOpen(COURSE, passed, lesson.id)
            const skip = open && !done && i === unit.lessons.length - 1 && !passed.includes(unit.lessons[i - 1]?.id)
            const upNext = lesson.id === next?.id
            return (
              <button key={lesson.id} className="learn-row" data-state={done ? 'done' : upNext ? 'next' : open ? 'open' : 'locked'} disabled={!open} onClick={() => void startLesson(lesson.id)}>
                <span className="learn-row-dot">
                  {done ? <Check size={16} aria-hidden /> : open ? <Play size={15} aria-hidden /> : <Lock size={15} aria-hidden />}
                </span>
                <span className="learn-row-id">{lesson.id}</span>
                <span className="learn-row-text">
                  <span className="learn-row-title">{lesson.title}</span>
                  <span className="learn-row-goal">{skip ? t`Pass this to skip the unit` : lesson.goal}</span>
                </span>
                <span className="learn-row-state">{done ? t`Passed` : upNext ? t`Up next` : open ? t`Open` : t`Locked`}</span>
              </button>
            )
          })}
        </div>
      </main>}
    </div>
  )
}
