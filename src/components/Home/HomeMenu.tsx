import { lazy, useEffect, useRef, useState, type ComponentType } from 'react'
import { Play, Settings } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { songCard, type LastPlayed } from '../../utils/homeSongs'
import { MENU_KEYS, menuTap, songsInProgress, weakestPhrase, type MenuAction } from '../../utils/homeMenu'
import { barRange } from '../../utils/practiceResult'
import type { PhraseProgress } from '../../utils/practiceScore'
import { COURSE } from '../../lessons/courseData'
import { nextLesson } from '../../lessons/progress'
import { startLesson } from '../../lessons/session'
import { Art, masteryLabel } from '../SongBrowser/SongBrowser'
import { NewVersionDot } from '../Settings/NewVersionDot'
import PliageMark from '../PliageMark'
import PliageLogo from '../PliageLogo'
import type { SongServerSong } from '../../types'

export type MenuSection = 'library' | 'learn' | 'arcade' | 'jam'

// Loaded on opening, so three.js and the band stay out of the first screen
const ArcadeHome = lazy(() => import('../../arcade/ArcadeHome'))
const JamHome = lazy(() => import('../../jam/JamHome'))

// A game mode stays off the menu until it's available. To wire one in, set `available` and `home`.
export const GAME_MODES: { id: MenuSection; name: () => string; note: () => string; available: boolean; home: ComponentType | null }[] = [
  { id: 'arcade', name: () => t`Arcade`, note: () => t`Short games for your hands and ears`, available: true, home: ArcadeHome },
  { id: 'jam', name: () => t`Jam`, note: () => t`Play along with a band that listens`, available: true, home: JamHome },
]

const IN_PROGRESS = 4
const NOTE_FILLS = ['var(--paint-yellow)', 'var(--paint-rose)', 'var(--paint-lime)', 'var(--paint-sky)']

// Keys and notes belong to whatever is on top of the page, not to the page
const OVERLAY = '[aria-modal="true"], [role="menu"], [role="listbox"]'
export const pageOnTop = () => !useStore.getState().lessonRun && !document.querySelector(OVERLAY)

function pulse(shape: Element) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  shape.animate(still ? { opacity: [0.7, 1] } : { scale: [1, 1.07, 1] }, { duration: 420, easing: 'ease-out' })
}

interface Props {
  last: { played: LastPlayed; song: SongServerSong } | null
  songs: SongServerSong[]
  phrases?: PhraseProgress[]
  mastery: number
  masteryOf: (path: string) => number
  homeServer: boolean
  failed: boolean
  onResume: () => void
  onFixPhrase: (phrase: number) => void
  onOpenSong: (song: SongServerSong) => void
  onOpenSection: (section: MenuSection) => void
  onChooseFolder: () => void
}

// ── The first screen: where to go, with a preview of what's there ────────────
export default function HomeMenu(props: Props) {
  const { last, songs, phrases, masteryOf, failed, onResume, onFixPhrase, onOpenSection } = props
  const hasSong = useStore(s => !!s.midi)
  const connected = useStore(s => s.midiDeviceConnected)
  const midiName = useStore(s => s.midiDeviceName)
  const passed = useStore(s => s.lessonPassed)
  const next = nextLesson(COURSE, passed)
  const unit = COURSE.find(u => u.lessons.some(l => l.id === next?.id))
  const inProgress = songsInProgress(songs, masteryOf, IN_PROGRESS)
  const weak = last ? weakestPhrase(phrases) : null

  const items: { id: 'continue' | MenuSection; name: string; note: string }[] = [
    ...(last ? [{ id: 'continue' as const, name: t`Continue`, note: songCard(last.song).title }] : []),
    { id: 'library', name: t`Library`, note: inProgress.length ? t`${inProgress.length} in progress` : t`Find something to play` },
    { id: 'learn', name: t`Learn`, note: next?.title ?? t`Course complete` },
    ...GAME_MODES.filter(m => m.available).map(m => ({ id: m.id, name: m.name(), note: m.note() })),
  ]
  const [highlight, setHighlight] = useState(items[0].id)
  const index = Math.max(0, items.findIndex(i => i.id === highlight))
  const current = items[index]
  const activate = (id: typeof current.id) => { if (id === 'continue') onResume(); else onOpenSection(id) }

  const move = (step: number) => {
    const { id } = items[(index + step + items.length) % items.length]
    setHighlight(id)
    document.getElementById(`menu-${id}`)?.focus()
  }
  const act = (action: MenuAction) => { if (action === 'select') activate(current.id); else move(action === 'up' ? -1 : 1) }
  const latest = useRef({ act, hasSong })
  latest.current = { act, hasSong }
  const shapes = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Capture, so an overlay about to close on this key is still there to see
    const onKey = (e: KeyboardEvent) => {
      if (!pageOnTop() || (e.repeat && e.key === 'Enter')) return
      const onItem = e.target === document.body || (e.target as HTMLElement).closest?.('.menu-item')
      const action = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'Enter' && onItem ? 'select' : null
      if (action) { e.preventDefault(); e.stopPropagation(); latest.current.act(action) }
      if (e.key === 'Escape' && latest.current.hasSong) { e.stopPropagation(); useStore.getState().setHomeOpen(false) }
    }
    window.addEventListener('keydown', onKey, true)
    let alone: number | null = null
    const stopListening = useStore.subscribe((s, prev) => {
      if (s.midiHeldKeys === prev.midiHeldKeys) return
      const list = shapes.current?.children
      for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key) && list?.length) pulse(list[key % list.length])
      const tap = menuTap(alone, s.midiHeldKeys, prev.midiHeldKeys)
      alone = tap.alone
      if (tap.action && pageOnTop()) latest.current.act(tap.action)
    })
    return () => { window.removeEventListener('keydown', onKey, true); stopListening() }
  }, [])

  return (
    <div className="theme-paper lib-page menu">
      <div ref={shapes} className="menu-shapes" aria-hidden>
        <span className="o-disc" style={{ right: -90, bottom: -60, width: 340, height: 340 }} />
        <span className="o-triangle" style={{ right: '38%', top: 52, width: 110, height: 96 }} />
        <span className="o-disc" style={{ left: -70, bottom: 90, width: 180, height: 180, background: 'var(--paint-blue)' }} />
        <span className="o-triangle" style={{ right: 56, top: 120, width: 74, height: 64, background: 'var(--paint-lime)' }} />
      </div>

      <header className="lib-header menu-top pliage-rise-in">
        <span className="lib-logo"><span className="lib-logo-disc"><PliageMark height={20} tone="sun" /></span><PliageLogo height={26} tone="night" /></span>
        <span className="o-spacer" />
        <span className="lib-listening">
          <span className={`o-dot ${connected ? 'o-dot-on' : 'o-dot-off'}`} />
          <span className="lib-ellipsis">{connected ? midiName || t`MIDI keyboard` : t`No keyboard. Plug one in to play along.`}</span>
        </span>
        <button className="o-icon-btn" style={{ position: 'relative' }} onClick={() => useStore.getState().openSettingsWindow()} aria-label={t`Settings`}><Settings size={18} /><NewVersionDot /></button>
      </header>

      {failed && <div role="alert" className="lib-alert"><span className="o-dot o-dot-alert" />{t`Couldn't open that song.`}</div>}

      <div className="menu-main">
        <div className="menu-side pliage-rise-in pliage-rise-in-2">
          <nav aria-label={t`Main menu`} className="menu-list" style={{ '--i': index } as React.CSSProperties}>
            <span className="menu-slab" aria-hidden />
            {items.map(item => (
              <button
                key={item.id} id={`menu-${item.id}`} className="menu-item" aria-current={item.id === current.id || undefined}
                onPointerEnter={e => { if (e.pointerType === 'mouse') setHighlight(item.id) }}
                onFocus={e => { if (e.target.matches(':focus-visible')) setHighlight(item.id) }}
                // A tap shows what's there first: a phone has no hover to preview with
                onClick={e => { if ((e.nativeEvent as PointerEvent).pointerType === 'touch' && item.id !== current.id) setHighlight(item.id); else activate(item.id) }}
              >
                <span className="menu-item-name">{item.name}</span>
                <span className="menu-item-note lib-ellipsis">{item.note}</span>
              </button>
            ))}
          </nav>
          <div className="menu-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd>{t`Move`}</span>
            <span><kbd>Enter</kbd>{t`Select`}</span>
            {hasSong && <span><kbd>Esc</kbd>{t`Back to song`}</span>}
            {connected && <span className="menu-hints-keys" role="group" aria-label={t`Keys on your keyboard`}>
              {MENU_KEYS.map(k => <span key={k.note}><kbd data-piano>{k.name}</kbd>{k.action === 'up' ? t`Up` : k.action === 'down' ? t`Down` : t`Select`}</span>)}
            </span>}
          </div>
        </div>

        <section key={current.id} aria-label={current.name} className="menu-panel">
          {current.id === 'continue' && last ? <ContinuePanel {...props} last={last} />
            : current.id === 'library' ? <LibraryPanel {...props} inProgress={inProgress} />
            : current.id === 'learn' ? <LearnPanel onOpen={() => onOpenSection('learn')} />
            : <>
              <h2 className="o-title-lg">{current.name}</h2>
              <p className="o-note">{current.note}</p>
              <button className="o-btn-primary o-btn-lg menu-go" onClick={() => activate(current.id)}><Play size={15} fill="currentColor" aria-hidden />{t`Start`}</button>
            </>}
        </section>
      </div>

      {(weak !== null || next) && <section aria-label={t`Next up`} className="menu-next pliage-rise-in pliage-rise-in-3">
        <span className="menu-next-head">{t`Next up`}</span>
        {weak !== null && last && <button className="menu-card" style={{ background: 'var(--paint-rose)' }} onClick={() => onFixPhrase(weak)}>
          <span className="lib-tag">{t`Fix a phrase`}</span>
          <span className="menu-card-title lib-ellipsis">{barRange(weak, weak, [], last.played.bars ?? 0, 0).label}</span>
          <span className="lib-ellipsis">{songCard(last.song).title}</span>
        </button>}
        {next && <button className="menu-card" style={{ background: 'var(--paint-lime)' }} onClick={() => void startLesson(next.id)}>
          <span className="lib-tag">{t`Next lesson`}</span>
          <span className="menu-card-title lib-ellipsis">{next.title}</span>
          <span className="lib-ellipsis">{unit && `${t`Unit`} ${unit.n} · ${unit.title}`}</span>
        </button>}
      </section>}
    </div>
  )
}

function ContinuePanel({ last, mastery, onResume }: Props & { last: NonNullable<Props['last']> }) {
  const card = songCard(last.song)
  const { bar, bars, level } = last.played
  return (
    <>
      <span className="menu-cover"><Art card={card} tilt={-3} /></span>
      <div className="menu-panel-text">
        <h2 className="o-title-lg lib-clamp">{card.title}</h2>
        {card.people[0] && <span className="o-note">{card.people[0]}</span>}
        <span className="menu-facts">
          {bar && <span className="lib-tag">{t`bar ${bar} of ${bars}`}</span>}
          {level && <span className="lib-tag">{t`level ${level}`}</span>}
          <span className="lib-tag">{masteryLabel(mastery)}</span>
        </span>
        <button className="o-btn-primary o-btn-lg menu-go" onClick={onResume}><Play size={15} fill="currentColor" aria-hidden />{t`Resume`}</button>
      </div>
    </>
  )
}

function LibraryPanel({ songs, inProgress, masteryOf, homeServer, onOpenSong, onOpenSection, onChooseFolder }: Props & { inProgress: SongServerSong[] }) {
  const libraryFolder = useStore(s => s.libraryFolder)
  if (!songs.length && !homeServer) {
    return (
      <div className="menu-panel-text">
        <h2 className="o-title-lg">{t`Where are your songs?`}</h2>
        <p className="o-note">{t`Pick a folder with MIDI, MusicXML, Guitar Pro or karaoke files. Pliage keeps watching it, so new songs show up by themselves.`}</p>
        <div className="menu-actions">
          <button className="o-btn-primary o-btn-lg" onClick={onChooseFolder}>{t`Choose your song folder`}</button>
          <button className="o-btn o-btn-lg" onClick={() => onOpenSection('library')}>{t`Open Library`}</button>
        </div>
      </div>
    )
  }
  return (
    <div className="menu-panel-text">
      <h2 className="o-title-lg">{inProgress.length ? t`In progress` : t`Nothing in progress yet`}</h2>
      {inProgress.length > 0
        ? <div className="menu-songs">
          {inProgress.map((song, i) => {
            const card = songCard(song)
            return (
              <button key={song.path} className="menu-song" style={{ '--fill': NOTE_FILLS[i % NOTE_FILLS.length] } as React.CSSProperties} onClick={() => onOpenSong(song)}>
                <Art card={card} />
                <span className="menu-song-text">
                  <span className="lib-ellipsis">{card.title}</span>
                  <span className="o-progress"><span style={{ width: `${masteryOf(song.path)}%` }} /></span>
                </span>
                <span className="o-note">{masteryLabel(masteryOf(song.path))}</span>
              </button>
            )
          })}
        </div>
        : <p className="o-note">{t`Play a song and it shows up here as you learn it.`}</p>}
      <div className="menu-actions">
        <button className="o-btn-primary o-btn-lg menu-go" onClick={() => onOpenSection('library')}>{t`Open Library`}</button>
        {!libraryFolder && !homeServer && <button className="o-btn o-btn-lg" onClick={onChooseFolder}>{t`Choose your song folder`}</button>}
        {!libraryFolder && !homeServer && songs.length > 0 && !inProgress.length && <button className="o-btn o-btn-lg" onClick={() => onOpenSong(songs[0])}>{t`Play the demo songs`}</button>}
      </div>
    </div>
  )
}

function LearnPanel({ onOpen }: { onOpen: () => void }) {
  const passed = useStore(s => s.lessonPassed)
  const next = nextLesson(COURSE, passed)
  const unit = COURSE.find(u => u.lessons.some(l => l.id === next?.id))
  const done = unit?.lessons.filter(l => passed.includes(l.id)).length ?? 0
  return (
    <div className="menu-panel-text">
      {next && unit
        ? <>
          <span className="lib-tag" style={{ background: 'var(--paint-rose)' }}>{`${t`Unit`} ${unit.n} · ${unit.title}`}</span>
          <h2 className="o-title-lg">{next.title}</h2>
          <p className="o-note">{next.goal}</p>
          <span className="menu-unit">
            <span className="o-progress"><span style={{ width: `${(done / unit.lessons.length) * 100}%` }} /></span>
            <span className="o-note">{t`${done} of ${unit.lessons.length} lessons`}</span>
          </span>
          <div className="menu-actions">
            <button className="o-btn-primary o-btn-lg menu-go" onClick={() => void startLesson(next.id)}><Play size={15} fill="currentColor" aria-hidden />{passed.length ? t`Continue` : t`Start`}</button>
            <button className="o-btn o-btn-lg" onClick={onOpen}>{t`Open Learn`}</button>
          </div>
        </>
        : <>
          <h2 className="o-title-lg">{t`Course complete`}</h2>
          <button className="o-btn-primary o-btn-lg menu-go" onClick={onOpen}>{t`Open Learn`}</button>
        </>}
    </div>
  )
}
