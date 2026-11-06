import { useState } from 'react'
import { Check, Lock, Play } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { COURSE, LESSONS, SHELF } from '../../lessons/courseData'
import { isOpen, nextLesson } from '../../lessons/progress'
import { openPiece, startLesson } from '../../lessons/session'
import { CARD_FILLS } from '../SongBrowser/SongBrowser'

// ── The course on the home page: units down the side, lessons in the middle ──
export default function LearnHome() {
  const passed = useStore(s => s.lessonPassed)
  const connected = useStore(s => s.midiDeviceConnected)
  const next = nextLesson(COURSE, passed)
  const [chosen, setChosen] = useState<number | 'pieces' | null>(null)
  const unit = COURSE.find(u => u.n === chosen) ?? COURSE.find(u => u.lessons.some(l => l.id === next?.id)) ?? COURSE[COURSE.length - 1]

  return (
    <div className="learn">
      <nav aria-label={t`Units`} className="learn-nav pliage-rise-in pliage-rise-in-2">
        <h3 className="lib-nav-head">{`${t`Reading music`} · ${t`${passed.length} of ${LESSONS.length} lessons`}`}</h3>
        {COURSE.map(u => (
          <button key={u.n} className="lib-nav-item learn-unit" aria-pressed={chosen !== 'pieces' && u.n === unit.n} onClick={() => setChosen(u.n)}>
            <span className="learn-unit-n">{u.n}</span>
            <span className="lib-ellipsis" style={{ flex: 1 }}>{u.title}</span>
            <span className="learn-unit-n">{`${u.lessons.filter(l => passed.includes(l.id)).length}/${u.lessons.length}`}</span>
          </button>
        ))}
        <h3 className="lib-nav-head">{t`Practice`}</h3>
        <button className="lib-nav-item learn-unit" aria-pressed={chosen === 'pieces'} onClick={() => setChosen('pieces')}>
          <span style={{ flex: 1 }}>{t`Pieces`}</span>
          <span className="learn-unit-n">{SHELF.length}</span>
        </button>
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
        <div className="learn-head">
          <div className="learn-head-text">
            <span className="lib-tag" style={{ background: 'var(--paint-rose)' }}>{`${t`Unit`} ${unit.n}`}</span>
            <h1 className="learn-title">{unit.title}</h1>
          </div>
          {next
            ? <button className="o-btn-primary learn-go" onClick={() => void startLesson(next.id)}><Play size={14} fill="currentColor" aria-hidden /><span className="lib-ellipsis">{`${passed.length ? t`Continue` : t`Start`}: ${next.title}`}</span></button>
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
