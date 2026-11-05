// ── Song Browser — every Library song as a card, with filters ─────────────────
// The sidebar list stays the place to organise files; this is the place to
// choose what to play. Cards come from the Library scan plus the optional
// catalog.json in the library folder (see utils/songCatalog.ts), so it works on
// any library: without a catalog a card is just its file name.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CloudDownload, Loader2, Search, X } from 'lucide-react'
import { useStore } from '../../store'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { t } from '../../utils/i18n'
import { SettingsDropdown, Switch } from '../Settings/controls'
import {
  NO_FILTERS, buildCards, facets, filterCards, formatDuration, genreLabel, sortCards,
  type Facet, type SongCard, type SongFilters, type SongSort,
} from '../../utils/songCatalog'

const PAGE = 120 // cards added each time the grid scrolls near its end

export const HANDS_LABEL: Record<string, () => string> = {
  named: () => t`Named hand tracks`,
  split: () => t`Two hand tracks`,
  'one-stream': () => t`One piano part`,
  none: () => t`No piano part`,
}

export const ARRANGEMENT_LABEL: Record<string, () => string> = {
  'solo-piano': () => t`Solo piano`,
  'piano-led': () => t`Piano-led`,
  band: () => t`Full band`,
  'solo-line': () => t`Single-line solo`,
}

export const songSortOptions = (): { value: SongSort; label: string }[] => [
  { value: 'title', label: t`Sort: Title` },
  { value: 'person', label: t`Sort: Composer` },
  { value: 'easiest', label: t`Sort: Easiest first` },
  { value: 'tempo', label: t`Sort: Tempo` },
  { value: 'length', label: t`Sort: Length` },
]

export const CARD_FILLS = ['var(--paint-lime)', 'var(--paint-yellow)', 'var(--paint-blue)', 'var(--sand)', 'var(--paint-rose)', 'var(--paint-olive)']

export function masteryLabel(percent: number) {
  return percent >= 100 ? t`Learned` : percent > 0 ? t`${percent}% learned` : t`Not started yet`
}

export function Art({ card, tilt = 0 }: { card: Pick<SongCard, 'art' | 'title'>; tilt?: number }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [card.art])
  const style = tilt ? { transform: `rotate(${tilt}deg)` } : undefined
  if (card.art && !broken) return <img className="lib-art" src={card.art} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} style={style} />
  return <span className="lib-art" aria-hidden style={style}>{card.title.trim().charAt(0).toUpperCase()}</span>
}

export type SongStatus = 'opening' | 'local' | 'remote' | 'failed'

export function StatusTag({ status }: { status: SongStatus }) {
  return (
    <span className="lib-status" data-status={status}>
      {status === 'opening' && <><Loader2 size={13} className="home-spin" aria-hidden />{t`Opening…`}</>}
      {status === 'local' && <><Check size={13} aria-hidden />{t`On this device`}</>}
      {status === 'remote' && <><CloudDownload size={13} aria-hidden />{t`Downloads when opened`}</>}
      {status === 'failed' && t`Didn't open`}
    </span>
  )
}

// A server song on its way: real numbers once the first bytes arrive
export function Downloading({ percent }: { percent: number | null }) {
  if (percent === null) return null
  return <>
    <span className="lib-download" role="progressbar" aria-label={t`Downloading`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span>
    <span className="lib-download-text">{`${t`Downloading`} · ${percent}%`}</span>
  </>
}

export const Card = memo(function Card({ card, index, loaded, mastery, status, percent = null, failure, onOpen }: {
  card: SongCard
  index: number
  loaded: boolean
  mastery?: number
  status?: SongStatus
  percent?: number | null
  failure?: string
  onOpen: (path: string) => void
}) {
  const facts = [card.key, card.bpm ? `${card.bpm} BPM` : null, formatDuration(card.duration)].filter(Boolean).join(' · ')
  // Try again is its own button, and a button can't hold one
  if (status === 'failed') return (
    <div className="lib-card lib-card-failed">
      <StatusTag status={status} />
      <span className="lib-card-title" title={card.title}>{card.title}</span>
      <span className="lib-card-artist">{failure}</span>
      <button className="o-btn lib-retry" onClick={() => onOpen(card.path)}>{t`Try again`}</button>
    </div>
  )
  return (
    <button className="lib-card" data-opening={status === 'opening' || undefined} onClick={() => onOpen(card.path)} aria-current={loaded || undefined} style={{ background: CARD_FILLS[index % CARD_FILLS.length] }}>
      <span className="lib-card-top">
        <Art card={card} tilt={index % 2 ? -2 : 2} />
        <span className="lib-card-tags">
          {card.genres.slice(0, 2).map(g => (
            <span key={g.name} className="lib-tag" data-guessed={g.guessed || undefined} title={g.guessed ? t`Genre guessed from the title or composer` : undefined}>{genreLabel(g.name)}</span>
          ))}
          {status && <StatusTag status={status} />}
        </span>
      </span>
      <span className="lib-card-title" title={card.title}>{card.title}</span>
      <span className="lib-card-artist" title={card.people.join(', ')}>{card.people.join(', ')}</span>
      <span className="lib-card-facts">
        <span>{facts}</span>
        {card.difficulty !== null && (
          <span role="img" aria-label={t`Difficulty ${card.difficulty} of 5`} title={t`Difficulty ${card.difficulty} of 5`}>
            {'●'.repeat(card.difficulty)}<span style={{ opacity: 0.3 }}>{'●'.repeat(Math.max(0, 5 - card.difficulty))}</span>
          </span>
        )}
      </span>
      {status === 'opening' ? <Downloading percent={percent} /> : mastery !== undefined && <>
        <span className="lib-card-bar"><span style={{ width: `${mastery}%` }} /></span>
        <span className="lib-card-artist">{masteryLabel(mastery)}</span>
      </>}
    </button>
  )
})

export function FilterSelect({ title, all, value, options, onChange, label }: {
  title: string
  all: string
  value: string
  options: Facet[]
  onChange: (v: string) => void
  label?: (v: string) => string
}) {
  const show = label ?? ((v: string) => v)
  const list = useMemo(() => {
    const items = [{ value: '', label: all }, ...options.map(o => ({ value: o.value, label: `${show(o.value)} (${o.count})` }))]
    // a chosen value stays visible even after another filter leaves it no songs
    return value && !options.some(o => o.value === value) ? [...items, { value, label: show(value) }] : items
  }, [options, value, all]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="lib-filter">
      <SettingsDropdown value={value} options={list} onChange={onChange} title={title} />
    </div>
  )
}

export function SongBrowser({ onOpen, onClose }: { onOpen: (path: string) => void; onClose: () => void }) {
  const libraryFolder = useStore((s) => s.libraryFolder)
  const libraryFiles = useStore((s) => s.libraryFiles)
  const hiddenLibraryFiles = useStore((s) => s.hiddenLibraryFiles)
  const showHiddenLibraryFiles = useStore((s) => s.showHiddenLibraryFiles)
  const loadedPath = useStore((s) => (s.midi as any)?._filePath as string | undefined)

  const [catalog, setCatalog] = useState<unknown>(null)
  const [filters, setFilters] = useState<SongFilters>(NO_FILTERS)
  const [sort, setSort] = useState<SongSort>('title')
  const [shown, setShown] = useState(PAGE)
  const set = (patch: Partial<SongFilters>) => setFilters(f => ({ ...f, ...patch }))

  const dialogRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)

  useEffect(() => {
    let current = true
    setCatalog(null)
    if (libraryFolder) window.electronAPI.readSongCatalog(libraryFolder).then(c => { if (current) setCatalog(c) }).catch(() => {})
    return () => { current = false }
  }, [libraryFolder])

  // Capture phase: Escape closes this view and goes no further into the app
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dialogRef.current?.querySelector('[aria-expanded="true"]')) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const cards = useMemo(() => {
    const hidden = new Set(hiddenLibraryFiles)
    const visible = showHiddenLibraryFiles ? libraryFiles : libraryFiles.filter(f => !hidden.has(f.path))
    return buildCards(visible, libraryFolder, catalog)
  }, [libraryFiles, libraryFolder, catalog, hiddenLibraryFiles, showHiddenLibraryFiles])

  const matches = useMemo(() => sortCards(filterCards(cards, filters), sort), [cards, filters, sort])
  const options = useMemo(() => facets(cards, filters), [cards, filters])
  const hasClassics = useMemo(() => cards.some(c => c.classic), [cards])
  const hasSoloLines = useMemo(() => cards.some(c => c.soloLine), [cards])
  const hasGuesses = useMemo(() => cards.some(c => c.genres.some(g => g.guessed)), [cards])
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  // Thousands of cards at once would stall the window, so the grid grows as it scrolls
  useEffect(() => {
    setShown(PAGE)
    gridRef.current?.scrollTo({ top: 0 })
  }, [filters, sort])
  useEffect(() => {
    const end = endRef.current
    if (!end) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setShown(n => n + PAGE) },
      { root: gridRef.current, rootMargin: '600px' },
    )
    io.observe(end)
    return () => io.disconnect()
  }, [matches.length, shown])

  const sortOptions = songSortOptions()

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t`Song browser`}
      className="theme-paper lib-browser"
    >
      <div className="lib-browser-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 className="o-title">{t`Songs`}</h2>
          <label className="o-field lib-search" style={{ flex: 1, maxWidth: 480 }}>
            <Search size={17} aria-hidden />
            <input value={filters.query} onChange={e => set({ query: e.target.value })} placeholder={t`Search titles, composers and genres`} aria-label={t`Search songs`} />
          </label>
          <span role="status" className="o-note" style={{ whiteSpace: 'nowrap' }}>{t`${matches.length} of ${cards.length} songs`}</span>
          <span className="o-spacer" />
          <button className="o-close" onClick={onClose} aria-label={t`Close song browser`}><X size={18} /></button>
        </div>

        <div className="lib-filters">
          <FilterSelect title={t`Genre`} all={t`All genres`} value={filters.genre} options={options.genres} onChange={genre => set({ genre })} label={genreLabel} />
          <FilterSelect title={t`Composer`} all={t`All composers`} value={filters.person} options={options.people} onChange={person => set({ person })} />
          <FilterSelect title={t`Arrangement`} all={t`All arrangements`} value={filters.arrangement} options={options.arrangements} onChange={arrangement => set({ arrangement })} label={v => ARRANGEMENT_LABEL[v]?.() ?? v} />
          <FilterSelect title={t`Difficulty`} all={t`Any difficulty`} value={filters.difficulty} options={options.difficulties} onChange={difficulty => set({ difficulty })} label={v => t`Difficulty ${v} of 5`} />
          <FilterSelect title={t`Key`} all={t`Any key`} value={filters.key} options={options.keys} onChange={key => set({ key })} />
          <FilterSelect title={t`Hand tracks`} all={t`Any hand layout`} value={filters.hands} options={options.hands} onChange={hands => set({ hands })} label={v => HANDS_LABEL[v]?.() ?? v} />
          <div className="lib-filter">
            <SettingsDropdown value={sort} options={sortOptions} onChange={setSort} title={t`Sort songs`} />
          </div>
          {hasClassics && <Toggle label={t`Classic composers`} value={filters.classicOnly} onChange={classicOnly => set({ classicOnly })} />}
          {hasGuesses && <Toggle label={t`Include guessed genres`} value={filters.includeGuessed} onChange={includeGuessed => set({ includeGuessed })} />}
          {hasSoloLines && <Toggle label={t`Single-line solos`} value={filters.showSoloLines} onChange={showSoloLines => set({ showSoloLines })} />}
          {filtered && (
            <button className="o-link" onClick={() => setFilters(NO_FILTERS)}>{t`Clear filters`}</button>
          )}
        </div>
      </div>

      <div ref={gridRef} className="lib-browser-grid">
        {matches.length === 0 ? (
          <p className="o-note" style={{ margin: '48px 0', textAlign: 'center' }}>
            {cards.length === 0 ? t`No songs in your library yet.` : t`No songs match these filters.`}
          </p>
        ) : (
          <div className="lib-grid">
            {matches.slice(0, shown).map((card, i) => (
              <Card key={card.path} card={card} index={i} loaded={card.path === loadedPath} onOpen={onOpen} />
            ))}
          </div>
        )}
        {shown < matches.length && <div ref={endRef} style={{ height: 1 }} />}
      </div>
    </div>,
    document.body,
  )
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="lib-toggle">
      <Switch value={value} onChange={onChange} label={label} />
      <span aria-hidden>{label}</span>
    </span>
  )
}
