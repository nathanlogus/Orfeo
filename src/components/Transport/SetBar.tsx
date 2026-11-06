import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { closeSet, encoreSong, endSet, playEncore, setScore, skipSong, type SetResult } from '../../utils/setSession'
import { t } from '../../utils/i18n'

const UP_NEXT = 8

const stateLabels: Record<SetResult['state'], () => string> = {
  played: () => t`Played through`,
  listened: () => t`Listened`,
  skipped: () => t`Skipped`,
  failed: () => t`Couldn't open`,
}

// ── The set's quiet strip on the roll, and the short score between songs ─────
export function SetBar() {
  const run = useStore((s) => s.setRun)
  const [upNext, setUpNext] = useState(false)
  if (!run || run.stage === 'summary') return null
  const later = run.songs.slice(run.index + 1)
  const scored = run.stage === 'score' ? run.results[run.index] : null
  return <>
    {scored && (
      <div className="set-score" role="status">
        <span className="o-note">{scored.title}</span>
        <span className="set-score-pct">{scored.percent === null ? t`Listened` : `${scored.percent}%`}</span>
        {later[0] && <span className="o-note">{t`Next: ${later[0].title}`}</span>}
      </div>
    )}
    <div className="set-bar app-no-drag">
      <span className="set-bar-song">{run.encore ? t`Encore` : t`Song ${run.index + 1} of ${run.songs.length}`} · {run.songs[run.index].title}</span>
      {later.length > 0 && <button aria-expanded={upNext} onClick={() => setUpNext(!upNext)}>{t`Up next`}</button>}
      <button onClick={skipSong}>{t`Skip`}</button>
      <button onClick={endSet}>{t`End set`}</button>
      {upNext && later.length > 0 && (
        <ol className="set-next">
          {later.slice(0, UP_NEXT).map((song, i) => <li key={`${song.path}${i}`}>{song.title}</li>)}
          {later.length > UP_NEXT && <li className="o-note">{t`and ${later.length - UP_NEXT} more`}</li>}
        </ol>
      )}
    </div>
  </>
}

// ── How the set went: every song, and the set as a whole. Ending early comes here too. ──
export function SetSummary() {
  const run = useStore((s) => s.setRun)
  const open = run?.stage === 'summary'
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open)
  if (!run || !open) return null
  const score = setScore(run.results)
  const encore = encoreSong(run)
  return (
    <div className="pr-result-floor app-no-drag touch-hit">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="set-summary-title" className="pr-result theme-paper">
        <button className="o-close pr-result-close" aria-label={t`Close`} onClick={closeSet}><X size={18} /></button>
        <div className="pr-result-scroll">
          <div className="pr-result-head">
            <span className="o-note">{t`${run.results.filter(r => !r.encore).length} of ${run.songs.length - (run.encore ? 1 : 0)} songs`}</span>
            <h1 id="set-summary-title">{t`How the set went.`}</h1>
          </div>
          <div className="pr-result-main">
            <div className="pr-result-disc">
              <span>{score === null ? '–' : `${score}%`}</span>
              <small>{t`set score`}</small>
              <i aria-hidden="true" />
            </div>
            <div className="pr-result-rows">
              {run.results.map((r, i) => (
                <div className="pr-result-row" key={i}>
                  <span className="set-row-title">{r.title}</span>
                  <span className="pr-result-pct">{r.percent === null ? '–' : `${r.percent}%`}</span>
                  <span className="pr-result-tag" data-up={r.encore}>{r.encore ? t`Encore` : stateLabels[r.state]()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pr-result-actions">
          <button className="o-btn-quiet" onClick={closeSet}>{t`Back to library`}</button>
          <span className="o-spacer" />
          {encore && <button className="o-btn-primary o-btn-lg" onClick={playEncore}>{t`Encore: ${encore.title}`}</button>}
        </div>
      </div>
    </div>
  )
}
