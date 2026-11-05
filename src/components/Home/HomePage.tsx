import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, CloudDownload, FolderOpen, LayoutGrid, List, Loader2, Search, Settings, X } from 'lucide-react'
import { useStore } from '../../store'
import { useMidiFile } from '../../hooks/useMidiFile'
import { t } from '../../utils/i18n'
import { deviceSongs, filterSongs, matchesSearch, songCard, songFacets, sortSongs, type FilterOption } from '../../utils/homeSongs'
import { genreLabel, type SongSort } from '../../utils/songCatalog'
import { ARRANGEMENT_LABEL, Card, FilterSelect, Toggle, songSortOptions } from '../SongBrowser/SongBrowser'
import { SettingsDropdown } from '../Settings/controls'
import { songKey } from '../../utils/practiceSession'
import FaceTheMusicMark from '../FaceTheMusicMark'
import LearnHome from '../Lessons/LearnHome'
import type { SongServerList, SongServerSong } from '../../types'

const PAGE = 100
const SEARCH_DELAY_MS = 200

type Source = 'device' | 'server'
type Section = 'learn' | 'library'

// ── Where every session starts: find a song, on this device or the home server ──
export default function HomePage() {
  const { openFile } = useMidiFile()
  const hasSong = useStore(s => !!s.midi)
  const libraryFolder = useStore(s => s.libraryFolder)
  const libraryFiles = useStore(s => s.libraryFiles)
  const demoFiles = useStore(s => s.demoFiles)
  const hideDemoFolder = useStore(s => s.hideDemoFolder)

  const [section, setSection] = useState<Section>('library')
  const [source, setSource] = useState<Source>('device')
  const [view, setView] = useState<'cards' | 'list'>('cards')
  const [progress, setProgress] = useState<Record<string, { mastery?: number }>>({})
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState<string | null>(null)
  const [artist, setArtist] = useState<string | null>(null)
  const [artistSearch, setArtistSearch] = useState('')
  const [arrangement, setArrangement] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [songKeyFilter, setSongKeyFilter] = useState('')
  const [classicOnly, setClassicOnly] = useState(false)
  const [sort, setSort] = useState<SongSort>('title')
  const [catalog, setCatalog] = useState<unknown>(null)
  const [facets, setFacets] = useState<Pick<SongServerList, 'arrangements' | 'difficulties' | 'keys' | 'classics'>>({ arrangements: [], difficulties: [], keys: [], classics: 0 })

  const [address, setAddress] = useState('')
  const [connected, setConnected] = useState(false)
  const [serverSongs, setServerSongs] = useState<SongServerSong[]>([])
  const [serverTotal, setServerTotal] = useState(0)
  const [genres, setGenres] = useState<FilterOption[]>([])
  const [artists, setArtists] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [deviceShown, setDeviceShown] = useState(PAGE)
  const [searching, setSearching] = useState(false)
  const latestQuery = useRef(0)
  const lookedForServer = useRef(false)

  const findServer = useCallback(async () => {
    lookedForServer.current = true
    setSearching(true)
    const found = await window.electronAPI.songServerDiscover()
    setSearching(false)
    if (found) { setAddress(found); setConnected(true); setError('') }
    return found
  }, [])

  // ── A saved server opens on its songs; without one this page never touches the network
  useEffect(() => {
    void window.electronAPI.getPrefs().then(p => {
      if (p.homeView === 'list') setView('list')
      setProgress(p.practiceProgress ?? {})
      useStore.setState({ lessonPassed: p.lessonPassed ?? [] })
      if (p.homeSection === 'learn') setSection('learn')
      if (!p.songServerUrl) return
      setAddress(p.songServerUrl)
      setConnected(true)
      setSource('server')
    })
  }, [])

  // A library folder's own catalog.json, the same file the home server reads
  useEffect(() => {
    let current = true
    setCatalog(null)
    if (libraryFolder) void window.electronAPI.readSongCatalog(libraryFolder).then(c => { if (current) setCatalog(c) }).catch(() => {})
    return () => { current = false }
  }, [libraryFolder])

  const load = useCallback(async (offset: number) => {
    const id = ++latestQuery.current
    setLoading(true)
    try {
      const r = await window.electronAPI.songServerQuery(address, {
        q, genre: genre ?? '', artist: artist ?? '', arrangement, difficulty, key: songKeyFilter,
        classic: classicOnly ? 1 : '', sort, offset, limit: PAGE,
      })
      if (id !== latestQuery.current) return
      setServerSongs(old => (offset ? [...old, ...r.songs] : r.songs))
      setServerTotal(r.total)
      setGenres(r.genres)
      setArtists(r.artists)
      setFacets(r)
      setError('')
      lookedForServer.current = false
      void window.electronAPI.setPrefs({ songServerUrl: address })
    } catch {
      if (id !== latestQuery.current) return
      // A computer's address can change: look once before giving up on it
      const moved = !lookedForServer.current && await findServer()
      if (id !== latestQuery.current) return
      if (!moved || moved === address) setError(t`Can't reach the server. Check the address and that it's running.`)
    }
    setLoading(false)
  }, [address, q, genre, artist, arrangement, difficulty, songKeyFilter, classicOnly, sort, findServer])

  useEffect(() => {
    if (source === 'server' && !connected && !address && !lookedForServer.current) void findServer()
  }, [source, connected, address, findServer])

  useEffect(() => {
    if (source !== 'server' || !connected) return
    const timer = setTimeout(() => void load(0), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [source, connected, load])

  // ── The same list, from what's already here ──────────────────────────────
  const allDevice = useMemo(() => {
    const library = hideDemoFolder ? libraryFiles.filter(f => !/[\\/]Demo[\\/]/.test(f.path)) : libraryFiles
    return deviceSongs(library.length || hideDemoFolder ? library : demoFiles, libraryFolder, catalog)
  }, [libraryFiles, demoFiles, hideDemoFolder, libraryFolder, catalog])
  const deviceFilters = useMemo(() => ({ q, genre: genre ?? '', artist: artist ?? '', arrangement, difficulty, key: songKeyFilter, classic: classicOnly }),
    [q, genre, artist, arrangement, difficulty, songKeyFilter, classicOnly])
  const filteredDevice = useMemo(() => sortSongs(filterSongs(allDevice, deviceFilters), sort), [allDevice, deviceFilters, sort])
  const deviceFacets = useMemo(() => songFacets(allDevice, deviceFilters), [allDevice, deviceFilters])

  const isServer = source === 'server'
  const songs = isServer ? serverSongs : filteredDevice.slice(0, deviceShown)
  const total = isServer ? serverTotal : filteredDevice.length
  const shownFacets = isServer ? { ...facets, genres, artists } : deviceFacets
  const genreOptions = shownFacets.genres
  const artistOptions = shownFacets.artists.filter(a => matchesSearch(a.name, artistSearch))

  const changeView = () => {
    const next = view === 'cards' ? 'list' : 'cards'
    setView(next)
    void window.electronAPI.setPrefs({ homeView: next })
  }

  const changeSection = (next: Section) => {
    setSection(next)
    void window.electronAPI.setPrefs({ homeSection: next })
  }

  const clearFilters = () => {
    setGenre(null); setArtist(null); setArrangement(''); setDifficulty(''); setSongKeyFilter(''); setClassicOnly(false); setSort('title')
  }
  const switchSource = (next: Source) => {
    setSource(next); clearFilters(); setError(''); setDeviceShown(PAGE)
  }
  const filtered = !!(genre || artist || arrangement || difficulty || songKeyFilter || classicOnly || sort !== 'title')
  const asFacet = (list: { name: string; count: number }[]) => list.map(o => ({ value: o.name, count: o.count }))

  const open = async (song: SongServerSong) => {
    if (opening) return
    setOpening(song.path)
    setError('')
    try {
      const path = isServer ? await window.electronAPI.songServerDownload(address, song.path, song.size) : song.path
      const store = useStore.getState()
      if (isServer && store.libraryFolder) store.setLibraryFiles(await window.electronAPI.scanMidiFolder(store.libraryFolder))
      store.openSong(path)
    } catch {
      setError(t`Couldn't download that song.`)
    }
    setOpening(null)
  }

  const pickFolder = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) useStore.getState().setLibraryFolderAndFiles(folder, await window.electronAPI.scanMidiFolder(folder))
  }

  const showConnect = isServer && !connected
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: 'var(--bg-modal-header)', color: 'var(--text-default)' }}>
      <header className="orfeo-rise-in" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border2)' }}>
        <FaceTheMusicMark width={150} fill="var(--text-amber)" />
        <div role="tablist" aria-label={t`Sections`} className="home-tabs">
          <button role="tab" aria-selected={section === 'learn'} className="home-tab" onClick={() => changeSection('learn')}>{t`Learn`}</button>
          <button role="tab" aria-selected={section === 'library'} className="home-tab" onClick={() => changeSection('library')}>{t`Library`}</button>
        </div>
        {section === 'learn' && <span style={{ flex: 1 }} />}
        {section === 'library' && <label className="home-search">
          <Search size={15} aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t`Search songs and artists`} aria-label={t`Search songs and artists`} />
          {q && <button onClick={() => setQ('')} aria-label={t`Clear search`}><X size={14} /></button>}
        </label>}
        {section === 'library' && <div role="tablist" aria-label={t`Song source`} className="home-tabs">
          <button role="tab" aria-selected={!isServer} className="home-tab" onClick={() => switchSource('device')}>{t`This device`}</button>
          <button role="tab" aria-selected={isServer} className="home-tab" onClick={() => switchSource('server')}>{t`Home server`}</button>
        </div>}
        <button className="home-action" onClick={openFile}><FolderOpen size={14} aria-hidden />{t`Open file`}</button>
        <button className="home-icon" onClick={() => useStore.getState().openSettingsWindow()} aria-label={t`Settings`}><Settings size={16} /></button>
        {hasSong && <button className="home-action home-primary" onClick={() => useStore.getState().setHomeOpen(false)}><ArrowLeft size={14} aria-hidden />{t`Back to song`}</button>}
      </header>

      {section === 'learn' ? <LearnHome /> : showConnect ? (
        <form className="home-connect" onSubmit={e => { e.preventDefault(); if (address.trim()) { setConnected(true); setError('') } }}>
          <h2>{searching ? t`Looking for a home server…` : t`Connect a home server`}</h2>
          <p>{t`Browse a big song collection from your computer. Songs download when you open them, and stay on this device.`}</p>
          <p>{t`On the computer, run:`} <code>npm run android:songs -- "your song folder"</code></p>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="192.168.0.35:8765" aria-label={t`Server address`} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="home-action home-primary" type="submit">{t`Connect`}</button>
            <button className="home-link" type="button" disabled={searching} onClick={() => void findServer()}>{t`Find automatically`}</button>
          </div>
        </form>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <nav aria-label={t`Filters`} className="orfeo-rise-in orfeo-rise-in-2" style={{ width: 240, flexShrink: 0, overflowY: 'auto', padding: '12px 10px', borderRight: '1px solid var(--border2)' }}>
            <h3 className="home-heading">{t`Genre`}</h3>
            <FilterButton label={t`All`} active={!genre} onClick={() => { setGenre(null); setArtist(null) }} />
            {genreOptions.map(g => <FilterButton key={g.name} label={genreLabel(g.name)} count={g.count} active={genre === g.name} onClick={() => { setGenre(genre === g.name ? null : g.name); setArtist(null); setDeviceShown(PAGE) }} />)}
            <h3 className="home-heading" style={{ marginTop: 16 }}>{t`Sort`}</h3>
            {songSortOptions().map(o => <FilterButton key={o.value} label={o.label.replace(/^[^:]*:\s*/, '')} active={sort === o.value} onClick={() => setSort(o.value)} />)}
            {shownFacets.artists.length > 0 && <>
              <h3 className="home-heading" style={{ marginTop: 16 }}>{t`Artist`}</h3>
              {shownFacets.artists.length > 8 && <input className="home-filter-search" value={artistSearch} onChange={e => setArtistSearch(e.target.value)} placeholder={t`Find an artist`} aria-label={t`Find an artist`} />}
              <FilterButton label={t`All`} active={!artist} onClick={() => setArtist(null)} />
              {artistOptions.map(a => <FilterButton key={a.name} label={a.name} count={a.count} active={artist === a.name} onClick={() => setArtist(artist === a.name ? null : a.name)} />)}
            </>}
          </nav>

          <main className="orfeo-rise-in orfeo-rise-in-3" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40, padding: '6px 16px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              <span aria-live="polite">{total === 1 ? t`1 song` : `${total.toLocaleString()} ${t`songs`}`}</span>
              {loading && isServer && <Loader2 size={13} className="home-spin" aria-label={t`Loading`} />}
              <span style={{ flex: 1 }} />
              <button className="home-icon" onClick={changeView} aria-label={view === 'cards' ? t`Show as a list` : t`Show as cards`}>
                {view === 'cards' ? <List size={16} /> : <LayoutGrid size={16} />}
              </button>
              {isServer
                ? <button className="home-link" onClick={() => setConnected(false)}>{t`Change server`}</button>
                : <button className="home-link" onClick={pickFolder}>{libraryFolder ? t`Change folder` : t`Choose your song folder`}</button>}
            </div>
            {(!isServer || connected) && (
              <div className="home-filterbar">
                <FilterSelect title={t`Genre`} all={t`All genres`} value={genre ?? ''} options={asFacet(shownFacets.genres)} onChange={v => { setGenre(v || null); setArtist(null) }} label={genreLabel} />
                <FilterSelect title={t`Composer`} all={t`All composers`} value={artist ?? ''} options={asFacet(shownFacets.artists)} onChange={v => setArtist(v || null)} />
                <FilterSelect title={t`Arrangement`} all={t`All arrangements`} value={arrangement} options={asFacet(shownFacets.arrangements)} onChange={setArrangement} label={v => ARRANGEMENT_LABEL[v]?.() ?? v} />
                <FilterSelect title={t`Difficulty`} all={t`Any difficulty`} value={difficulty} options={asFacet(shownFacets.difficulties)} onChange={setDifficulty} label={v => t`Difficulty ${v}`} />
                <FilterSelect title={t`Key`} all={t`Any key`} value={songKeyFilter} options={asFacet(shownFacets.keys)} onChange={setSongKeyFilter} />
                <div style={{ width: 150, flexShrink: 0 }}>
                  <SettingsDropdown value={sort} options={songSortOptions()} onChange={setSort} title={t`Sort songs`} />
                </div>
                {shownFacets.classics > 0 && <Toggle label={t`Classic composers`} value={classicOnly} onChange={setClassicOnly} />}
                {filtered && <button className="home-link" onClick={clearFilters}>{t`Clear filters`}</button>}
              </div>
            )}
            {error && <div role="alert" className="home-error">{error}</div>}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 12px' }}>
              {view === 'cards' && <div className="home-cards">
                {songs.map(s => (
                  <div key={s.path} className="home-card">
                    <Card card={songCard(s)} loaded={false} onOpen={() => void open(s)} />
                    {!!progress[songKey(s.path)]?.mastery && <span className="home-card-mastery">{progress[songKey(s.path)].mastery}%</span>}
                    {isServer && (
                      <span className="home-card-state">
                        {opening === s.path ? <Loader2 size={14} className="home-spin" aria-label={t`Opening`} />
                          : s.local ? <Check size={14} aria-label={t`On this device`} />
                          : <CloudDownload size={14} aria-label={t`Downloads when opened`} />}
                      </span>
                    )}
                  </div>
                ))}
              </div>}
              {view === 'list' && songs.map(s => (
                <button key={s.path} className="home-song" onClick={() => void open(s)} disabled={!!opening}>
                  <span className="home-song-title">{s.title}</span>
                  <span className="home-song-artist">{s.artist}</span>
                  <span className="home-song-genre">{s.genre}</span>
                  {opening === s.path ? <Loader2 size={14} className="home-spin" aria-label={t`Opening`} />
                    : !isServer ? <span style={{ width: 14 }} />
                    : s.local ? <Check size={14} aria-label={t`On this device`} />
                    : <CloudDownload size={14} aria-label={t`Downloads when opened`} />}
                </button>
              ))}
              {!songs.length && !loading && !error && <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>{t`No songs found.`}</p>}
              {songs.length < total && (
                <button className="home-action" style={{ margin: '12px auto', display: 'flex' }} onClick={() => (isServer ? void load(serverSongs.length) : setDeviceShown(n => n + PAGE))}>{t`Show more`}</button>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}

function FilterButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button className="home-filter" aria-pressed={active} onClick={onClick}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {count != null && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{count.toLocaleString()}</span>}
    </button>
  )
}
