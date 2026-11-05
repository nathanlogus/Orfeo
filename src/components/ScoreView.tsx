import { useEffect, useRef, useState } from 'react'
import bravuraUrl from '@coderline/alphatab/font/Bravura.woff2?url'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { usePlayback } from '../hooks/usePlayback'
import { fingerEvents } from '../utils/fingering'
import { handHex } from '../utils/handPalette'
import { leftHandChannels, partsToShow, staffHands, stavesToShow, transposeKeySignature } from '../utils/scoreSource'

// ── Score view ────────────────────────────────────────────────────────────
// Engraves the notation file a song was imported from. alphaTab has no sound
// of its own here: EnabledExternalMedia makes its player a time axis that
// follows Orfeo's clock. Orfeo's MIDI for these files comes from the same
// alphaTab generator (foreignFormatImport.ts), so the two share one timeline.
// The Track Panel's eye picks the parts, and each hand of a piano's two staves.
export default function ScoreView({ bytes, style }: { bytes: Uint8Array; style: React.CSSProperties }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const { seek, seekAndPlay } = usePlayback()

  useEffect(() => {
    const scroller = scrollerRef.current, host = hostRef.current
    if (!scroller || !host) return
    setFailed(false)
    let api: any = null
    let unsubscribe = () => {}
    let drawn = ''
    let score: any = null
    let at: any = null
    const fileView = new Map<any, number>()
    let cancelled = false

    // The current line stays at the top, so the lines below it can be read ahead
    const keepLineAtTop = () => {
      const bar = host.querySelector('.at-cursor-bar')?.getBoundingClientRect()
      if (!bar) return
      const offset = bar.top - scroller.getBoundingClientRect().top - 12
      if (Math.abs(offset) > 1) scroller.scrollTop += offset
    }
    const syncCursor = () => {
      const { currentTime, midi } = useStore.getState()
      // Skip empty bars cuts the song Orfeo plays, never the score
      api.timePosition = (currentTime + (midi?._leadSec ?? 0)) * 1000
    }
    // Written pitch and key signature, on the score itself so a file's own
    // transposition (a guitar's octave) stays underneath
    const transposeScore = (semitones: number) => {
      for (const part of score.tracks) for (const staff of part.staves) {
        if (staff.isPercussion) continue
        if (!fileView.has(staff)) fileView.set(staff, staff.displayTranspositionPitch)
        staff.displayTranspositionPitch = fileView.get(staff)! - semitones
        for (const bar of staff.bars) {
          if (!fileView.has(bar)) fileView.set(bar, bar.keySignature)
          bar.keySignature = transposeKeySignature(fileView.get(bar)!, semitones)
        }
      }
    }
    // Hand colours match the roll. Fingers suit the written pitch, so they follow
    // Transpose. A finger printed in the file is the editor's, and stays.
    const printed = new WeakSet()
    let suggested = false
    const markHands = (semitones: number) => {
      for (const part of score.tracks) staffHands(part).forEach((hand, s) => {
        const struck = new Map<number, any[]>()
        for (const bar of part.staves[s].bars) for (const voice of bar.voices) for (const beat of voice.beats) {
          const time = bar.masterBar.start + beat.playbackStart
          for (const note of beat.notes) {
            if (!suggested && note.isFingering) printed.add(note)
            if (note.isTieDestination) continue
            struck.set(time, [...(struck.get(time) ?? []), note])
            if (part.staves.length === 1) continue
            note.style = new at.model.NoteStyle()
            note.style.colors.set(at.model.NoteSubElement.StandardNotationNoteHead, at.model.Color.fromJson(handHex()[hand === 'L' ? 'lh' : 'rh']))
          }
        }
        const events = [...struck.keys()].sort((a, b) => a - b).map(t => struck.get(t)!)
        const fingers = fingerEvents(
          hand,
          events.map(notes => notes.map(n => n.realValue + semitones)),
          events.map(notes => notes.map(n => (printed.has(n) ? n.leftHandFinger + 1 : 0))),
        )
        events.forEach((notes, e) => notes.forEach((note, n) => {
          if (!printed.has(note) && fingers[e][n]) note.leftHandFinger = fingers[e][n] - 1
        }))
      })
      suggested = true
    }
    const shownParts = () => {
      const { tracks, midi } = useStore.getState()
      const channels = tracks.map(t => ({ visible: t.visible, channel: midi?.tracks.find(m => m.index === t.index)?.channel ?? -1 }))
      const leftHands = leftHandChannels<any>(score.tracks)
      for (const [part, left] of leftHands) {
        const [top, bottom] = stavesToShow(part, left, channels)
        part.staves[0].showStandardNotation = top
        part.staves[1].showStandardNotation = bottom
      }
      // Here a left hand is still its piano's lower staff, one part with the right
      const parts = channels.map(c => {
        const piano = [...leftHands].find(([, left]) => left.includes(c.channel))?.[0]
        return piano ? { ...c, channel: piano.playbackInfo.primaryChannel } : c
      })
      return partsToShow<any>(score.tracks, parts)
    }
    const viewOf = () => `${useStore.getState().detectedKey?.transpose ?? 0}|${shownParts().map(p => `${p.index}:${p.staves.map((s: any) => +s.showStandardNotation)}`)}`
    const redrawIfChanged = () => {
      if (!score || viewOf() === drawn) return
      drawn = viewOf()
      transposeScore(useStore.getState().detectedKey?.transpose ?? 0)
      markHands(useStore.getState().detectedKey?.transpose ?? 0)
      api.renderScore(score, shownParts().map(p => p.index))
    }
    // alphaTab moves its cursor some frames after a seek, so follow the cursor itself
    const cursorMoves = new MutationObserver((changes) => {
      if (changes.some(c => (c.target as Element).classList.contains('at-cursor-bar'))) keepLineAtTop()
    })
    cursorMoves.observe(host, { subtree: true, attributes: true, attributeFilter: ['style'] })

    void (async () => {
      at = await import('@coderline/alphatab')
      if (cancelled) return
      api = new at.AlphaTabApi(host, {
        core: {
          // shortcut: engraves on the main thread, a worker needs alphaTab's Vite plugin if long scores stall
          useWorkers: false,
          tracks: 'all',
          smuflFontSources: new Map([[at.FontFileFormat.Woff2, new URL(bravuraUrl, document.baseURI).href]]),
        },
        // alphaTab fades voices after the first, and many piano files give each hand its own voice
        display: { staveProfile: at.StaveProfile.Score, resources: { secondaryGlyphColor: '#000000' } },
        notation: { fingeringMode: at.FingeringMode.ScoreForcePiano },
        player: {
          playerMode: at.PlayerMode.EnabledExternalMedia,
          enableCursor: true,
          enableUserInteraction: false,
          scrollMode: at.ScrollMode.Off,
        },
      } as any)
      api.error.on((e: unknown) => { console.error('[Orfeo] Score view failed:', e); setFailed(true) })
      api.postRenderFinished.on(syncCursor)
      api.beatMouseDown.on((beat: unknown) => {
        api.tickPosition = api.tickCache.getBeatStart(beat)
        const { midi, playbackState } = useStore.getState()
        const time = api.timePosition / 1000 - (midi?._leadSec ?? 0)
        if (playbackState === 'playing') seekAndPlay(time); else seek(time)
      })
      unsubscribe = useStore.subscribe((s, prev) => {
        if (s.currentTime !== prev.currentTime) syncCursor()
        if (s.tracks !== prev.tracks || s.detectedKey !== prev.detectedKey) redrawIfChanged()
      })
      // api.load would draw the first part alone
      score = (at as any).importer.ScoreLoader.loadScoreFromBytes(bytes, api.settings)
      redrawIfChanged()
    })().catch((e) => { console.error('[Orfeo] Score view failed:', e); setFailed(true) })

    return () => {
      cancelled = true
      cursorMoves.disconnect()
      unsubscribe()
      api?.destroy()
    }
  }, [bytes])

  return (
    <div ref={scrollerRef} data-score-view style={{ ...style, minHeight: 0, overflow: 'auto', position: 'relative', background: 'var(--paper-card)' }}>
      <style>{`
        [data-score-view] .at-cursor-bar { background: rgba(255, 222, 59, 0.55); }
        [data-score-view] .at-cursor-beat { background: #000000; width: 2px; }
        .lesson-hide-bar [data-score-view] .at-cursor-bar { background: var(--paper-card); opacity: 1 !important; }
      `}</style>
      <div ref={hostRef} />
      {failed && (
        <div role="alert" className="pr-score-failed theme-paper">
          <div>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 10h18M3 14h18M3 18h18M4 4l16 16" /></svg>
            <span className="pr-score-failed-title">{t`Couldn’t draw this score.`}</span>
            <span className="o-note">{t`The song still plays on the piano roll.`}</span>
            <button className="o-btn" onClick={() => useStore.getState().setScoreViewMode('roll')}>{t`Show the piano roll`}</button>
          </div>
        </div>
      )}
    </div>
  )
}
