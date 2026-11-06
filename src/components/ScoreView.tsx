import { useEffect, useRef, useState } from 'react'
import bravuraUrl from '@coderline/alphatab/font/Bravura.woff2?url'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { usePlayback } from '../hooks/usePlayback'
import { fingerEvents } from '../utils/fingering'
import { handHex } from '../utils/handPalette'
import { NES } from '../utils/noteEditorState'
import { dropSelfTies, isScoreFor, leftHandChannels, offLevel, partsToShow, staffHands, stavesToShow, tickKey, ticksInLevel, transposeKeySignature } from '../utils/scoreSource'
import { playedBars, sheetFromMidi, type SheetBar } from '../utils/sheetFromNotes'
import { noteSelection } from './NoteEditor/noteSelection'
import { inPracticeLevel } from '../utils/practiceLevels'
import { FULL_LEVEL } from '../utils/practiceScore'
import { AUTO_LEVEL } from '../utils/practiceSession'

const OFF_LEVEL_INK = '#c9c2b6'

// ── Score view ────────────────────────────────────────────────────────────
// Engraves the notation file a song was imported from. alphaTab has no sound
// of its own here: EnabledExternalMedia makes its player a time axis that
// follows Pliage's clock. Pliage's MIDI for these files comes from the same
// alphaTab generator (foreignFormatImport.ts), so the two share one timeline.
// The Track Panel's eye picks the parts, and each hand of a piano's two staves.
// `live` is the Note Editor's sheet instead: written from the notes being edited
// (sheetFromNotes.ts) and written again after each edit, and a tap selects a note.
const REWRITE_MS = 150
const TAP_PX = 8
const TAP_REACH_PX = 22
const TOOLBAR_HINT_PX = 28
const LIVE_SCALE = 0.8
const ALPHATAB_PPQ = 960

// Below the full level, what the level leaves out is dimmed: taking it off would
// rewrite the bars.
export default function ScoreView({ bytes, live = false, style }: { bytes: Uint8Array | null; live?: boolean; style: React.CSSProperties }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const picksRef = useRef<HTMLDivElement>(null)
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
    let barStarts: Map<unknown, number[]> | null = null
    let dimmed: any[] = []
    const fileView = new Map<any, number>()
    let cancelled = false

    // The current line stays at the top, so the lines below it can be read ahead
    const keepLineAtTop = () => {
      const bar = host.querySelector('.at-cursor-bar')?.getBoundingClientRect()
      if (!bar) return
      const offset = bar.top - scroller.getBoundingClientRect().top - (live ? TOOLBAR_HINT_PX : 12)
      if (Math.abs(offset) > 1) scroller.scrollTop += offset
    }
    const syncCursor = () => {
      const { currentTime, midi } = useStore.getState()
      const header = NES.editMidi?.header
      if (live) { if (header) api.tickPosition = header.secondsToTicks(currentTime) * (ALPHATAB_PPQ / header.ppq) }
      // Skip empty bars cuts the song Pliage plays, never the score
      else api.timePosition = (currentTime + (midi?._leadSec ?? 0)) * 1000
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
        if (live) return // fingers would crowd the sheet being corrected
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
    // Each playing of a bar, repeats unrolled: alphaTab's own lookup, the same
    // generator the song's MIDI came from
    const playings = () => {
      if (barStarts) return barStarts
      const generator = new at.midi.MidiFileGenerator(score, api.settings, new at.midi.AlphaSynthMidiFileHandler(new at.midi.MidiFile()))
      generator.generate()
      barStarts = new Map()
      for (const bar of generator.tickLookup.masterBars) barStarts.set(bar.masterBar, [...(barStarts.get(bar.masterBar) ?? []), bar.start])
      return barStarts
    }
    const dimOffLevel = () => {
      const { practiceLevel, midi } = useStore.getState()
      if (live || practiceLevel >= FULL_LEVEL || !midi) return
      const asked = ticksInLevel(midi.tracks, midi._leadTick ?? 0, inPracticeLevel)
      const { Color, NoteStyle, NoteSubElement, BeatStyle, BeatSubElement } = at.model
      const dim = Color.fromJson(OFF_LEVEL_INK)
      const paint = (style: any, parts: number[]) => parts.forEach(part => style.colors.set(part, dim))
      for (const part of score.tracks) for (const staff of part.staves) for (const bar of staff.bars) for (const voice of bar.voices) for (const beat of voice.beats) {
        const off = beat.notes.filter((written: any) => {
          // A tied note sounds once, from where the tie starts
          const note = written.tieOrigin ?? written
          const starts = playings().get(note.beat.voice.bar.masterBar) ?? []
          return offLevel(asked, starts.map((start: number) => tickKey(note.realValue, start + note.beat.playbackStart)))
        })
        for (const note of off) {
          note.style ??= new NoteStyle()
          dimmed.push(note)
          paint(note.style, [NoteSubElement.StandardNotationNoteHead, NoteSubElement.StandardNotationAccidentals, NoteSubElement.StandardNotationEffects])
        }
        if (off.length && off.length === beat.notes.length) {
          beat.style = new BeatStyle()
          dimmed.push(beat)
          paint(beat.style, [BeatSubElement.StandardNotationStem, BeatSubElement.StandardNotationFlags, BeatSubElement.StandardNotationBeams])
        }
      }
    }
    const levelView = () => {
      const { practiceLevel, phraseLevels } = useStore.getState()
      return practiceLevel >= FULL_LEVEL ? '' : `${practiceLevel}|${practiceLevel === AUTO_LEVEL ? phraseLevels : ''}`
    }
    const shownParts = (): any[] => {
      if (live) return score.tracks
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
    const viewOf = () => `${useStore.getState().detectedKey?.transpose ?? 0}|${levelView()}|${shownParts().map(p => `${p.index}:${p.staves.map((s: any) => +s.showStandardNotation)}`)}`
    const redrawIfChanged = () => {
      if (!score || viewOf() === drawn) return
      drawn = viewOf()
      transposeScore(useStore.getState().detectedKey?.transpose ?? 0)
      for (const element of dimmed) element.style = undefined
      dimmed = []
      markHands(useStore.getState().detectedKey?.transpose ?? 0)
      dimOffLevel()
      api.renderScore(score, shownParts().map(p => p.index))
    }

    // ── The Note Editor's sheet ───────────────────────────────────────────────
    let heads = new Map<object, object[]>()
    let noteBoxes: { note: object; x: number; y: number; w: number; h: number }[] = []
    let notation: { bytes: Uint8Array | null; bars: SheetBar[] | null } = { bytes: null, bars: null }
    let rewriteTimer: ReturnType<typeof setTimeout> | undefined
    const shownTracks = () => useStore.getState().tracks.filter(t => t.visible).map(t => t.index)
    let writtenTracks = ''
    const rewrite = () => {
      const s = useStore.getState()
      if (!at || !api || !NES.editMidi) return
      const source = isScoreFor(s.scoreSource, (s.midi as any)?._filePath) ? s.scoreSource.bytes : null
      if (source !== notation.bytes) {
        let bars = null
        try { bars = source && playedBars(at, source) } catch (e) { console.warn('[Pliage] Score has no usable bars:', e) }
        notation = { bytes: source, bars }
      }
      const shown = shownTracks()
      writtenTracks = `${shown}`
      const sheet = sheetFromMidi(at, NES.editMidi, { settings: api.settings, played: notation.bars, lead: s.midi?._leadTick ?? 0, key: s.detectedKey, shown: i => shown.includes(i) })
      if (!sheet) return
      score = sheet.score
      heads = sheet.heads
      fileView.clear()
      suggested = false
      drawn = ''
      redrawIfChanged()
    }
    const paintPicks = () => {
      picksRef.current?.replaceChildren(...noteBoxes.filter(b => heads.get(b.note)?.some(n => noteSelection.has(n as any))).map(b => {
        const pick = document.createElement('span')
        pick.className = 'pr-sheet-pick'
        pick.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`
        return pick
      }))
    }
    const measureNotes = () => {
      noteBoxes = []
      for (const system of api.boundsLookup?.staffSystems ?? []) for (const master of system.bars) for (const bar of master.bars) for (const beat of bar.beats) {
        for (const n of beat.notes ?? []) noteBoxes.push({ note: n.note, ...n.noteHeadBounds })
      }
      paintPicks()
    }
    const nearestNote = (x: number, y: number) => {
      let best: object | null = null, bestDistance = TAP_REACH_PX
      for (const b of noteBoxes) {
        const distance = Math.hypot(x - (b.x + b.w / 2), y - (b.y + b.h / 2))
        if (distance < bestDistance && heads.has(b.note)) { best = b.note; bestDistance = distance }
      }
      return best
    }
    // On release, so a finger scrolling the sheet selects nothing
    let down: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onPointerUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_PX) return
      down = null
      const box = host.getBoundingClientRect()
      const note = nearestNote(e.clientX - box.left, e.clientY - box.top)
      const notes = (note ? heads.get(note) : null) as any[] | null
      if (!e.shiftKey && !e.ctrlKey) noteSelection.clear()
      if (!notes) return
      for (const n of notes) noteSelection.add(n)
      ;(window as any).__pliagePlayNote?.(notes[0].midi)
      seek(notes[0].time)
    }
    if (live) {
      host.addEventListener('pointerdown', onPointerDown)
      host.addEventListener('pointerup', onPointerUp)
      NES.onSheetChange = () => { clearTimeout(rewriteTimer); rewriteTimer = setTimeout(rewrite, REWRITE_MS) }
    }
    const unsubscribePicks = live ? noteSelection.subscribe(paintPicks) : () => {}

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
          includeNoteBounds: live,
          smuflFontSources: new Map([[at.FontFileFormat.Woff2, new URL(bravuraUrl, document.baseURI).href]]),
        },
        // alphaTab fades voices after the first, and many piano files give each hand its own voice
        display: { staveProfile: at.StaveProfile.Score, scale: live ? LIVE_SCALE : 1, resources: { secondaryGlyphColor: '#000000' } },
        notation: { fingeringMode: at.FingeringMode.ScoreForcePiano },
        player: {
          playerMode: at.PlayerMode.EnabledExternalMedia,
          enableCursor: true,
          enableUserInteraction: false,
          scrollMode: at.ScrollMode.Off,
        },
      } as any)
      api.error.on((e: unknown) => { console.error('[Pliage] Score view failed:', e); setFailed(true) })
      api.postRenderFinished.on(syncCursor)
      if (live) api.postRenderFinished.on(measureNotes)
      else api.beatMouseDown.on((beat: unknown) => {
        api.tickPosition = api.tickCache.getBeatStart(beat)
        const { midi, playbackState } = useStore.getState()
        const time = api.timePosition / 1000 - (midi?._leadSec ?? 0)
        if (playbackState === 'playing') seekAndPlay(time); else seek(time)
      })
      unsubscribe = useStore.subscribe((s, prev) => {
        if (s.currentTime !== prev.currentTime) syncCursor()
        if (live && `${shownTracks()}` !== writtenTracks) NES.onSheetChange?.()
        else if (s.tracks !== prev.tracks || s.detectedKey !== prev.detectedKey || s.practiceLevel !== prev.practiceLevel) redrawIfChanged()
        // A phrase's Auto level waits for a pause: engraving would stall the song
        else if (s.playbackState !== 'playing' && (s.phraseLevels !== prev.phraseLevels || prev.playbackState === 'playing')) redrawIfChanged()
      })
      if (live) { rewrite(); return }
      // api.load would draw the first part alone
      score = dropSelfTies((at as any).importer.ScoreLoader.loadScoreFromBytes(bytes!, api.settings))
      redrawIfChanged()
    })().catch((e) => { console.error('[Pliage] Score view failed:', e); setFailed(true) })

    return () => {
      cancelled = true
      cursorMoves.disconnect()
      unsubscribe()
      unsubscribePicks()
      clearTimeout(rewriteTimer)
      if (live) NES.onSheetChange = null
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointerup', onPointerUp)
      api?.destroy()
    }
  }, [bytes, live])

  return (
    <div ref={scrollerRef} data-score-view style={{ ...style, minHeight: 0, overflow: 'auto', position: 'relative', background: 'var(--paper-card)' }}>
      <style>{`
        [data-score-view] .at-cursor-bar { background: rgba(255, 222, 59, 0.55); }
        [data-score-view] .at-cursor-beat { background: #000000; width: 2px; }
        .lesson-hide-bar [data-score-view] .at-cursor-bar { background: var(--paper-card); opacity: 1 !important; }
      `}</style>
      <div style={{ position: 'relative', marginTop: live ? TOOLBAR_HINT_PX : 0 }}>
        <div ref={hostRef} />
        <div ref={picksRef} aria-hidden="true" />
      </div>
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
