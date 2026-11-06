import { useRef } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { BarRange } from '../../utils/practiceResult'
import { t } from '../../utils/i18n'

const closeResult = () => useStore.setState({ practiceResult: null })

// ── How it went: the song's summary, over everything. Shown when a song ends or
// from End, and only after keys were played (utils/practiceSession.ts). ─────
export default function ResultsScreen() {
  const r = useStore((s) => s.practiceResult)
  const ref = useRef<HTMLDivElement>(null)
  const { seek, play } = usePlayback()
  useFocusTrap(ref, !!r)
  if (!r) return null

  const practise = (range: BarRange) => {
    closeResult()
    const s = useStore.getState()
    // A loop follows along to the bars you picked
    if (s.loopRegionActive && s.loopStart !== null) s.setLoopRegion(range.time, range.end)
    seek(range.time)
    void play()
  }
  const count = (state: string) => r.map.filter(m => m.state === state).length
  return (
    <div className="pr-result-floor app-no-drag touch-hit">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pr-result-title" className="pr-result theme-paper">
        <button className="o-close pr-result-close" aria-label={t`Close`} onClick={closeResult}><X size={18} /></button>
        <div className="pr-result-scroll">
          <div className="pr-result-head">
            <span className="o-note">{r.song} · {r.level === 0 ? t`automatic level` : t`level ${r.level}`} · {t`${r.tempoPercent}% tempo`}</span>
            <h1 id="pr-result-title">{r.title}</h1>
            {r.notCounted && <span className="o-note">{r.notCounted}</span>}
          </div>

          <div className="pr-result-main">
            <div className="pr-result-disc">
              <span>{r.percent}%</span>
              <small>{t`of notes in time`}</small>
              <i aria-hidden="true" />
            </div>
            <div className="pr-result-rows">
              {r.rows.map(row => (
                <div className="pr-result-row" key={row.bars}>
                  <span className="pr-result-bars">{row.bars}</span>
                  <div className="pr-result-bar">
                    <div className="o-progress"><span style={{ width: `${row.percent}%` }} /></div>
                    <span className="o-note">{row.note}</span>
                  </div>
                  <span className="pr-result-pct">{row.percent}%</span>
                  <span className="pr-result-tag" data-up={row.moved}>{row.tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pr-result-song">
            <div className="pr-result-song-head">
              <span className="pr-result-song-name">{t`The whole song`}</span>
              <span className="o-note">{t`${r.mastery}% learned`}{r.mastery > r.masteryBefore && ` · ${t`up from ${r.masteryBefore}%`}`}</span>
              <span className="o-spacer" />
              <span className="pr-result-key" data-state="learned">{t`Learned`}</span>
              <span className="pr-result-key" data-state="started">{t`Started`}</span>
              <span className="pr-result-key" data-state="none">{t`Not yet`}</span>
            </div>
            <div className="pr-result-map" role="img"
              aria-label={t`${r.map.length} phrases of four bars: ${count('learned')} learned, ${count('started')} started, ${count('none')} not yet`}>
              {r.map.map((m, i) => <div key={i} data-state={m.state} data-played={m.played} />)}
            </div>
          </div>
        </div>

        <div className="pr-result-actions">
          <button className="o-btn-quiet" onClick={() => { closeResult(); useStore.getState().setHomeOpen(true) }}>{t`Back to library`}</button>
          <span className="o-spacer" />
          {r.next && <button className="o-btn o-btn-lg" onClick={() => practise(r.next!)}>{t`Next: bars ${r.next.shortLabel}`}</button>}
          <button className="o-btn-primary o-btn-lg" onClick={() => practise(r.again)}>{t`Play bars ${r.again.shortLabel} again`}</button>
        </div>
      </div>
    </div>
  )
}
