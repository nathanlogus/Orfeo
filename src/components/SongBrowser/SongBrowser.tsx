// ── Song Browser — every Library song as a card, with filters ─────────────────
// The sidebar list stays the place to organise files; this is the place to
// choose what to play. Cards come from the Library scan plus the optional
// catalog.json in the library folder (see utils/songCatalog.ts), so it works on
// any library: without a catalog a card is just its file name.
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { LayoutGrid, Search, X } from 'lucide-react'
import { useStore } from '../../store'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { t } from '../../utils/i18n'
import { SettingsDropdown, Switch } from '../Settings/controls'
import {
  NO_FILTERS, buildCards, facets, filterCards, formatDuration, genreLabel, placeholderHue, sortCards,
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

function Art({ card }: { card: SongCard }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [card.art])
  const box: CSSProperties = { aspectRatio: '1', width: '100%', display: 'block', objectFit: 'cover', background: 'var(--bg-tile)' }
  if (card.art && !broken) {
    return <img src={card.art} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} style={{ ...box, outline: '1px solid rgba(255, 255, 255, 0.1)', outlineOffset: -1 }} />
  }
  const hue = placeholderHue(card.genres[0]?.name ?? card.folder ?? card.title)
  return (
    <div aria-hidden style={{
      ...box, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(145deg, hsl(${hue} 34% 26%), hsl(${(hue + 40) % 360} 30% 13%))`,
      color: `hsl(${hue} 45% 78%)`, fontSize: 34, fontWeight: 600, fontFamily: 'var(--font-ui)',
    }}>
      {card.title.trim().charAt(0).toUpperCase()}
    </div>
  )
}

export const Card = memo(function Card({ card, loaded, onOpen }: { card: SongCard; loaded: boolean; onOpen: (path: string) => void }) {
  const facts = [card.key, card.bpm ? `${card.bpm} BPM` : null, formatDuration(card.duration)].filter(Boolean).join(' · ')
  return (
    <button
      onClick={() => onOpen(card.path)}
      aria-current={loaded || undefined}
      style={{
        display: 'flex', flexDirection: 'column', minWidth: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
        background: 'var(--bg-tile)', color: 'var(--text-default)', borderRadius: 6, overflow: 'hidden',
        border: `1px solid ${loaded ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
      }}
    >
      <Art card={card} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 9px 9px', minWidth: 0, flex: 1 }}>
        <span title={card.title} style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {card.title}
        </span>
        <span title={card.people.join(', ')} style={{ fontSize: 11, minHeight: 15, color: 'var(--text-inactive)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {card.people.join(', ')}
        </span>
        {(card.genres.length > 0 || card.difficulty !== null) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', height: 17 }}>
            {card.genres.slice(0, 2).map(g => (
              <span
                key={g.name}
                title={g.guessed ? t`Genre guessed from the title or composer` : undefined}
                style={{
                  flexShrink: 0, fontSize: 10, lineHeight: '15px', padding: '0 6px', borderRadius: 8,
                  color: 'var(--text-amber)', border: `1px ${g.guessed ? 'dashed' : 'solid'} var(--accent-amber-strong)`,
                }}
              >{genreLabel(g.name)}</span>
            ))}
            {card.difficulty !== null && (
              <span role="img" aria-label={t`Difficulty ${card.difficulty} of 5`} title={t`Difficulty ${card.difficulty} of 5`} style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, color: 'var(--text-amber)', background: 'var(--bg-tile)' }}>
                {'●'.repeat(card.difficulty)}<span style={{ opacity: 0.3 }}>{'●'.repeat(Math.max(0, 5 - card.difficulty))}</span>
              </span>
            )}
          </span>
        )}
        <span style={{ marginTop: 'auto', fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {facts}
        </span>
      </span>
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
    <div style={{ width: 150, flexShrink: 0 }}>
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
      style={{ position: 'fixed', inset: 0, zIndex: 8000, display: 'flex', flexDirection: 'column', background: 'var(--bg-modal)', color: 'var(--text-default)', fontFamily: 'var(--font-ui)' }}
    >
      <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: '1px solid var(--bg-tile)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LayoutGrid size={15} strokeWidth={1.5} color="var(--text-amber)" />
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-amber)' }}>{t`Songs`}</h2>
          <div style={{ flex: 1, maxWidth: 420, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 4, background: 'var(--bg-field)', border: '1px solid var(--border2)' }}>
            <Search size={12} color="var(--text-inactive)" />
            <input
              value={filters.query}
              onChange={e => set({ query: e.target.value })}
              placeholder={t`Search titles, composers and genres`}
              aria-label={t`Search songs`}
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'inherit' }}
            />
          </div>
          <span role="status" style={{ fontSize: 11, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
            {t`${matches.length} of ${cards.length} songs`}
          </span>
          <button onClick={onClose} aria-label={t`Close song browser`} style={{ marginLeft: 'auto', display: 'flex', padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <FilterSelect title={t`Genre`} all={t`All genres`} value={filters.genre} options={options.genres} onChange={genre => set({ genre })} label={genreLabel} />
          <FilterSelect title={t`Composer`} all={t`All composers`} value={filters.person} options={options.people} onChange={person => set({ person })} />
          <FilterSelect title={t`Arrangement`} all={t`All arrangements`} value={filters.arrangement} options={options.arrangements} onChange={arrangement => set({ arrangement })} label={v => ARRANGEMENT_LABEL[v]?.() ?? v} />
          <FilterSelect title={t`Difficulty`} all={t`Any difficulty`} value={filters.difficulty} options={options.difficulties} onChange={difficulty => set({ difficulty })} label={v => t`Difficulty ${v} of 5`} />
          <FilterSelect title={t`Key`} all={t`Any key`} value={filters.key} options={options.keys} onChange={key => set({ key })} />
          <FilterSelect title={t`Hand tracks`} all={t`Any hand layout`} value={filters.hands} options={options.hands} onChange={hands => set({ hands })} label={v => HANDS_LABEL[v]?.() ?? v} />
          <div style={{ width: 150, flexShrink: 0 }}>
            <SettingsDropdown value={sort} options={sortOptions} onChange={setSort} title={t`Sort songs`} />
          </div>
          {hasClassics && <Toggle label={t`Classic composers`} value={filters.classicOnly} onChange={classicOnly => set({ classicOnly })} />}
          {hasGuesses && <Toggle label={t`Include guessed genres`} value={filters.includeGuessed} onChange={includeGuessed => set({ includeGuessed })} />}
          {hasSoloLines && <Toggle label={t`Single-line solos`} value={filters.showSoloLines} onChange={showSoloLines => set({ showSoloLines })} />}
          {filtered && (
            <button onClick={() => setFilters(NO_FILTERS)} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-amber)', fontFamily: 'inherit', padding: 4 }}>
              {t`Clear filters`}
            </button>
          )}
        </div>
      </div>

      <div ref={gridRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {matches.length === 0 ? (
          <p style={{ margin: '48px 0', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-inactive)' }}>
            {cards.length === 0 ? t`No songs in your library yet.` : t`No songs match these filters.`}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {matches.slice(0, shown).map(card => (
              <Card key={card.path} card={card} loaded={card.path === loadedPath} onOpen={onOpen} />
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-inactive)', flexShrink: 0 }}>
      <Switch value={value} onChange={onChange} label={label} />
      <span aria-hidden>{label}</span>
    </span>
  )
}
