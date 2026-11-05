import { useState } from 'react'
import { Check, Lock, Play } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { COURSE, SHELF } from '../../lessons/courseData'
import { isOpen, nextLesson } from '../../lessons/progress'
import { openPiece, startLesson } from '../../lessons/session'

// ── The course on the home page: units down the side, lessons in the middle ──
export default function LearnHome() {
  const passed = useStore(s => s.lessonPassed)
  const connected = useStore(s => s.midiDeviceConnected)
  const next = nextLesson(COURSE, passed)
  const [chosen, setChosen] = useState<number | 'pieces' | null>(null)
  const unit = COURSE.find(u => u.n === chosen) ?? COURSE.find(u => u.lessons.some(l => l.id === next?.id)) ?? COURSE[COURSE.length - 1]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <nav aria-label={t`Units`} className="orfeo-rise-in orfeo-rise-in-2" style={{ width: 240, flexShrink: 0, overflowY: 'auto', padding: '12px 10px', borderRight: '1px solid var(--border2)' }}>
        <h3 className="home-heading">{t`Reading music`}</h3>
        {COURSE.map(u => (
          <button key={u.n} className="home-filter" aria-pressed={chosen !== 'pieces' && u.n === unit.n} onClick={() => setChosen(u.n)}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`${u.n}. ${u.title}`}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{`${u.lessons.filter(l => passed.includes(l.id)).length}/${u.lessons.length}`}</span>
          </button>
        ))}
        <h3 className="home-heading" style={{ marginTop: 16 }}>{t`Practice`}</h3>
        <button className="home-filter" aria-pressed={chosen === 'pieces'} onClick={() => setChosen('pieces')}>
          <span>{t`Pieces`}</span>
          <span style={{ color: 'var(--text-muted)' }}>{SHELF.length}</span>
        </button>
      </nav>
      {chosen === 'pieces' ? <main className="orfeo-rise-in orfeo-rise-in-3" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px' }}>
        <h2 style={{ margin: '0 0 4px', color: 'var(--text-active)', fontSize: 'var(--text-lg)' }}>{t`Pieces`}</h2>
        <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{t`Real music to play once you've done the unit shown. Public domain, from dacapo, OpenGoldberg, PianoXML and PDMX.`}</p>
        {SHELF.map(piece => (
          <button key={piece.file} className="lesson-row" onClick={() => void openPiece(piece.file, piece.title)}>
            <span className="lesson-row-id">{`${t`Unit`} ${piece.after}`}</span>
            <span className="lesson-row-title">{piece.title}</span>
            <span className="lesson-row-goal">{piece.why}</span>
          </button>
        ))}
      </main> : <main className="orfeo-rise-in orfeo-rise-in-3" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ flex: 1, margin: 0, color: 'var(--text-active)', fontSize: 'var(--text-lg)' }}>{unit.title}</h2>
          {next
            ? <button className="home-action home-primary" onClick={() => void startLesson(next.id)}><Play size={14} aria-hidden />{`${passed.length ? t`Continue` : t`Start`}: ${next.title}`}</button>
            : <span style={{ color: 'var(--text-amber)' }}>{t`Course complete`}</span>}
        </div>
        {unit.intro && <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{unit.intro}</p>}
        {!connected && <div role="alert" className="home-error" style={{ margin: '0 0 12px' }}>{t`Lessons listen to a MIDI keyboard. Connect one to play along.`}</div>}
        {unit.lessons.map((lesson, i) => {
          const done = passed.includes(lesson.id)
          const open = isOpen(COURSE, passed, lesson.id)
          const skip = open && !done && i === unit.lessons.length - 1 && !passed.includes(unit.lessons[i - 1]?.id)
          return (
            <button key={lesson.id} className="lesson-row" disabled={!open} onClick={() => void startLesson(lesson.id)}>
              <span style={{ width: 16, flexShrink: 0, display: 'flex', color: done ? 'var(--text-amber)' : 'var(--text-muted)' }}>
                {done ? <Check size={15} aria-label={t`Passed`} /> : open ? <Play size={13} aria-hidden /> : <Lock size={13} aria-label={t`Locked`} />}
              </span>
              <span className="lesson-row-id">{lesson.id}</span>
              <span className="lesson-row-title">{lesson.title}</span>
              <span className="lesson-row-goal">{skip ? t`Pass this to skip the unit` : lesson.goal}</span>
            </button>
          )
        })}
      </main>}
    </div>
  )
}
