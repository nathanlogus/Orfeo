import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, FolderOpen, LayoutGrid, List, Loader2, Search, Settings, Wifi, X } from 'lucide-react'
import '../../styles/redesign-home.css'
import { useStore } from '../../store'
import { useMidiFile } from '../../hooks/useMidiFile'
import { t } from '../../utils/i18n'
import { deviceSongs, filterSongs, matchesSearch, songCard, songFacets, sortSongs, type FilterOption } from '../../utils/homeSongs'
import { genreLabel, type SongSort } from '../../utils/songCatalog'
import { ARRANGEMENT_LABEL, Art, CARD_FILLS, HANDS_LABEL, Card, FilterSelect, StatusTag, Toggle, masteryLabel, songSortOptions, type SongStatus } from '../SongBrowser/SongBrowser'
import { SettingsDropdown } from '../Settings/controls'
import { songKey } from '../../utils/practiceSession'
import OrfeoMark from '../OrfeoMark'
import LearnHome from '../Lessons/LearnHome'
import FirstRun from './FirstRun'
import type { SongServerList, SongServerSong } from '../../types'

const PAGE = 100
const SEARCH_DELAY_MS = 200
const GENRE_CHIPS = 5
const COPIED_MS = 1500
const SERVER_COMMAND = 'npm run android:songs -- "your song folder"'

type Source = 'device' | 'server'
type Section = 'learn' | 'library'

// ── Where every session starts: find a song, on this device or the home server ──
export default function HomePage() {
  const { openFile } = useMidiFile()
  const hasSong = useStore(s => !!s.midi)
  const loadedPath = useStore(s => (s.midi as any)?._filePath as string | undefined)
  const loadedName = useStore(s => s.midi?.fileName ?? '')
  const libraryFolder = useStore(s => s.libraryFolder)
  const libraryFiles = useStore(s => s.libraryFiles)
  const demoFiles = useStore(s => s.demoFiles)
  const hideDemoFolder = useStore(s => s.hideDemoFolder)
  const midiConnected = useStore(s => s.midiDeviceConnected)
  const midiName = useStore(s => s.midiDeviceName)

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
  const [handsFilter, setHandsFilter] = useState('')
  const [classicOnly, setClassicOnly] = useState(false)
  const [sort, setSort] = useState<SongSort>('title')
  const [catalog, setCatalog] = useState<unknown>(null)
  const [facets, setFacets] = useState<Pick<SongServerList, 'arrangements' | 'difficulties' | 'keys' | 'hands' | 'classics'>>({ arrangements: [], difficulties: [], keys: [], hands: [], classics: 0 })

  const [address, setAddress] = useState('')
  const [connected, setConnected] = useState(false)
  const [serverSongs, setServerSongs] = useState<SongServerSong[]>([])
  const [serverTotal, setServerTotal] = useState(0)
  const [genres, setGenres] = useState<FilterOption[]>([])
  const [artists, setArtists] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [deviceShown, setDeviceShown] = useState(PAGE)
  const [searching, setSearching] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
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
      // Only a truly new install: anyone with a folder, a server or progress already knows the app
      if (!p.firstRunDone && !p.libraryFolder && !p.songServerUrl && !p.practiceProgress && !p.homeView) setFirstRun(true)
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
        q, genre: genre ?? '', artist: artist ?? '', arrangement, difficulty, key: songKeyFilter, hands: handsFilter,
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
  }, [address, q, genre, artist, arrangement, difficulty, songKeyFilter, handsFilter, classicOnly, sort, findServer])

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
  const deviceFilters = useMemo(() => ({ q, genre: genre ?? '', artist: artist ?? '', arrangement, difficulty, key: songKeyFilter, hands: handsFilter, classic: classicOnly }),
    [q, genre, artist, arrangement, difficulty, songKeyFilter, handsFilter, classicOnly])
  const filteredDevice = useMemo(() => sortSongs(filterSongs(allDevice, deviceFilters), sort), [allDevice, deviceFilters, sort])
  const deviceFacets = useMemo(() => songFacets(allDevice, deviceFilters), [allDevice, deviceFilters])

  const isServer = source === 'server'
  const songs = isServer ? serverSongs : filteredDevice.slice(0, deviceShown)
  const total = isServer ? serverTotal : filteredDevice.length
  const shownFacets = isServer ? { ...facets, genres, artists } : deviceFacets
  const genreOptions = shownFacets.genres
  const artistOptions = shownFacets.artists.filter(a => matchesSearch(a.name, artistSearch))
  const masteryOf = useCallback((path: string) => progress[songKey(path)]?.mastery ?? 0, [progress])

  // The song to go back to: the loaded one, or the furthest along of the unfinished ones
  const keepGoing = useMemo<SongServerSong | null>(() => {
    if (hasSong) return allDevice.find(s => s.path === loadedPath) ?? { path: loadedName, title: loadedName.replace(/\.[^.]+$/, ''), artist: '', genre: '', size: 0, local: true }
    return allDevice.filter(s => masteryOf(s.path) > 0 && masteryOf(s.path) < 100).sort((a, b) => masteryOf(b.path) - masteryOf(a.path))[0] ?? null
  }, [hasSong, loadedPath, loadedName, allDevice, masteryOf])

  const changeView = (next: 'cards' | 'list') => {
    setView(next)
    void window.electronAPI.setPrefs({ homeView: next })
  }

  const changeSection = (next: Section) => {
    setSection(next)
    void window.electronAPI.setPrefs({ homeSection: next })
  }

  const clearFilters = () => {
    setGenre(null); setArtist(null); setArrangement(''); setDifficulty(''); setSongKeyFilter(''); setHandsFilter(''); setClassicOnly(false); setSort('title')
  }
  const switchSource = (next: Source) => {
    setSource(next); clearFilters(); setError(''); setDeviceShown(PAGE)
  }
  const pickGenre = (name: string | null) => { setGenre(name); setArtist(null); setDeviceShown(PAGE) }
  const filtered = !!(genre || artist || arrangement || difficulty || songKeyFilter || handsFilter || classicOnly || sort !== 'title')
  const asFacet = (list: { name: string; count: number }[]) => list.map(o => ({ value: o.name, count: o.count }))

  const open = async (song: SongServerSong, fromServer = isServer) => {
    if (opening) return
    setOpening(song.path)
    setFailed(null)
    setError('')
    try {
      const path = fromServer ? await window.electronAPI.songServerDownload(address, song.path, song.size) : song.path
      const store = useStore.getState()
      if (fromServer && store.libraryFolder) store.setLibraryFiles(await window.electronAPI.scanMidiFolder(store.libraryFolder))
      store.openSong(path)
    } catch {
      setFailed(song.path)
      setError(t`Couldn't download that song.`)
    }
    setOpening(null)
  }

  const pickFolder = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) useStore.getState().setLibraryFolderAndFiles(folder, await window.electronAPI.scanMidiFolder(folder))
    return !!folder
  }

  const statusOf = (s: SongServerSong): SongStatus | undefined =>
    opening === s.path ? 'opening' : failed === s.path ? 'failed' : !isServer ? undefined : s.local ? 'local' : 'remote'

  if (firstRun) {
    return <FirstRun pickFolder={pickFolder} onDone={server => {
      setFirstRun(false)
      void window.electronAPI.setPrefs({ firstRunDone: true })
      if (server) switchSource('server')
    }} />
  }

  const showConnect = isServer && !connected
  // The top genres as chips, always with the chosen one; the Genre filter below still holds them all
  const byCount = [...genreOptions].sort((a, b) => b.count - a.count)
  const chips = [...byCount.slice(0, GENRE_CHIPS), ...byCount.slice(GENRE_CHIPS).filter(g => g.name === genre)]
  const sourceSwitch = (
    <div role="group" aria-label={t`Song source`} className="lib-source">
      <button aria-pressed={!isServer} onClick={() => switchSource('device')}><span className={`o-dot${isServer ? ' o-dot-off' : ''}`} />{t`This device`}</button>
      <button aria-pressed={isServer} onClick={() => switchSource('server')}><span className={`o-dot${isServer ? '' : ' o-dot-off'}`} />{t`Home server`}</button>
    </div>
  )

  return (
    <div className="theme-paper lib-page">
      <header className="lib-header orfeo-rise-in">
        <span className="lib-logo"><span className="lib-logo-disc"><OrfeoMark height={18} /></span>Orfeo</span>
        <div role="tablist" aria-label={t`Sections`} className="lib-seg">
          <button role="tab" aria-selected={section === 'library'} onClick={() => changeSection('library')}>{t`Library`}</button>
          <button role="tab" aria-selected={section === 'learn'} onClick={() => changeSection('learn')}>{t`Learn`}</button>
        </div>
        <span className="o-spacer" />
        {section === 'learn' && midiConnected && <span className="lib-listening"><span className="o-dot o-dot-on" />{t`Lessons listen to ${midiName || t`your keyboard`}`}</span>}
        {section === 'library' && <label className="o-field lib-search">
          <Search size={17} aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t`Search songs and artists`} aria-label={t`Search songs and artists`} />
          {q && <button onClick={() => setQ('')} aria-label={t`Clear search`}><X size={16} /></button>}
        </label>}
        {section === 'library' && !showConnect && <div role="group" aria-label={t`View`} className="lib-seg lib-seg-icons">
          <button aria-pressed={view === 'cards'} aria-label={t`Show as cards`} onClick={() => changeView('cards')}><LayoutGrid size={17} /></button>
          <button aria-pressed={view === 'list'} aria-label={t`Show as a list`} onClick={() => changeView('list')}><List size={17} /></button>
        </div>}
        <button className="o-btn lib-open" onClick={openFile}><FolderOpen size={16} aria-hidden />{t`Open file`}</button>
        <button className="o-icon-btn" onClick={() => useStore.getState().openSettingsWindow()} aria-label={t`Settings`}><Settings size={18} /></button>
        {hasSong && <button className="o-btn-primary" onClick={() => useStore.getState().setHomeOpen(false)}><ArrowLeft size={16} aria-hidden />{t`Back to song`}</button>}
      </header>

      {section === 'learn' ? <LearnHome /> : showConnect ? (
        <ConnectServer
          address={address} setAddress={setAddress} searching={searching} error={error} sourceSwitch={sourceSwitch}
          onConnect={() => { if (address.trim()) { setConnected(true); setError('') } }}
          onFind={() => void findServer()}
        />
      ) : (
        <div className="lib-scroll">
          {view === 'cards' && <section className="lib-hero orfeo-rise-in orfeo-rise-in-2">
            <h1 className="o-display lib-headline">{t`What are we playing?`}</h1>
            <div className="lib-hero-side">
              {sourceSwitch}
              {genreOptions.length > 0 && <div className="lib-chips">
                <button aria-pressed={!genre} onClick={() => pickGenre(null)}>{t`All`}{!genre && ` ${total.toLocaleString()}`}</button>
                {chips.map(g => <button key={g.name} aria-pressed={genre === g.name} onClick={() => pickGenre(genre === g.name ? null : g.name)}>{`${genreLabel(g.name)} ${g.count.toLocaleString()}`}</button>)}
              </div>}
            </div>
          </section>}

          <div className="lib-tools orfeo-rise-in orfeo-rise-in-2">
            <div className="lib-filters">
              {view === 'cards' && <FilterSelect title={t`Genre`} all={t`All genres`} value={genre ?? ''} options={asFacet(shownFacets.genres)} onChange={v => { setGenre(v || null); setArtist(null) }} label={genreLabel} />}
              {view === 'cards' && <FilterSelect title={t`Composer`} all={t`All composers`} value={artist ?? ''} options={asFacet(shownFacets.artists)} onChange={v => setArtist(v || null)} />}
              <FilterSelect title={t`Arrangement`} all={t`All arrangements`} value={arrangement} options={asFacet(shownFacets.arrangements)} onChange={setArrangement} label={v => ARRANGEMENT_LABEL[v]?.() ?? v} />
              <FilterSelect title={t`Difficulty`} all={t`Any difficulty`} value={difficulty} options={asFacet(shownFacets.difficulties)} onChange={setDifficulty} label={v => t`Difficulty ${v}`} />
              <FilterSelect title={t`Key`} all={t`Any key`} value={songKeyFilter} options={asFacet(shownFacets.keys)} onChange={setSongKeyFilter} />
              <FilterSelect title={t`Hand tracks`} all={t`Any hand layout`} value={handsFilter} options={asFacet(shownFacets.hands ?? [])} onChange={setHandsFilter} label={v => HANDS_LABEL[v]?.() ?? v} />
              <div className="lib-filter">
                <SettingsDropdown value={sort} options={songSortOptions()} onChange={setSort} title={t`Sort songs`} />
              </div>
              {shownFacets.classics > 0 && <Toggle label={t`Classic composers`} value={classicOnly} onChange={setClassicOnly} />}
            </div>
            <div className="lib-count">
              <span aria-live="polite">{total === 1 ? t`1 song` : `${total.toLocaleString()} ${isServer ? t`songs on the home server` : t`songs`}`}</span>
              {loading && isServer && <Loader2 size={15} className="home-spin" aria-label={t`Loading`} />}
              <span className="o-spacer" />
              {filtered && <button className="o-link" onClick={clearFilters}>{t`Clear filters`}</button>}
              {isServer
                ? <button className="o-link" onClick={() => setConnected(false)}>{t`Change server`}</button>
                : <button className="o-link" onClick={() => void pickFolder()}>{libraryFolder ? t`Change folder` : t`Choose your song folder`}</button>}
            </div>
          </div>

          {error && <div role="alert" className="lib-alert">
            <span className="o-dot o-dot-alert" />
            <span style={{ flex: 1 }}>{error}</span>
            {isServer && <button className="o-link" onClick={() => setConnected(false)}>{t`Change server`}</button>}
          </div>}

          <div className="lib-body orfeo-rise-in orfeo-rise-in-3">
            {view === 'list' && <nav aria-label={t`Filters`} className="lib-nav">
              {sourceSwitch}
              {isServer && <div className="theme-studio lib-server">
                <span className="o-dot o-dot-on" />
                <span className="lib-ellipsis" style={{ flex: 1 }}>{`${t`Home server`} · ${address}`}</span>
              </div>}
              <h3 className="lib-nav-head">{t`Genre`}</h3>
              <FilterButton label={t`All`} active={!genre} onClick={() => pickGenre(null)} />
              {genreOptions.map(g => <FilterButton key={g.name} label={genreLabel(g.name)} count={g.count} active={genre === g.name} onClick={() => pickGenre(genre === g.name ? null : g.name)} />)}
              {shownFacets.artists.length > 0 && <>
                <h3 className="lib-nav-head">{t`Artist`}</h3>
                {shownFacets.artists.length > 8 && <label className="o-field"><input value={artistSearch} onChange={e => setArtistSearch(e.target.value)} placeholder={t`Find an artist`} aria-label={t`Find an artist`} /></label>}
                <FilterButton label={t`All`} active={!artist} onClick={() => setArtist(null)} />
                {artistOptions.map(a => <FilterButton key={a.name} label={a.name} count={a.count} active={artist === a.name} onClick={() => setArtist(artist === a.name ? null : a.name)} />)}
              </>}
            </nav>}

            {view === 'cards' && (keepGoing
              ? <KeepGoing song={keepGoing} mastery={masteryOf(keepGoing.path)} onGo={() => (hasSong ? useStore.getState().setHomeOpen(false) : void open(keepGoing, false))} />
              : !libraryFolder && !isServer && <NoFolder demos={allDevice.length > 0} onChoose={() => void pickFolder()} onDemo={() => void open(allDevice[0], false)} />)}

            <main className="lib-main">
              {view === 'cards' && songs.length > 0 && <div className="lib-grid">
                {songs.map((s, i) => <Card key={s.path} card={songCard(s)} index={i} loaded={false} mastery={masteryOf(s.path)} status={statusOf(s)} onOpen={() => void open(s)} />)}
              </div>}
              {view === 'list' && songs.length > 0 && <div className="lib-list">
                {songs.map((s, i) => {
                  const percent = masteryOf(s.path)
                  const status = statusOf(s)
                  return (
                    <button key={s.path} className="lib-row" onClick={() => void open(s)} disabled={!!opening} style={{ '--fill': CARD_FILLS[i % CARD_FILLS.length] } as React.CSSProperties}>
                      <Art card={songCard(s)} />
                      <span className="lib-row-text">
                        <span className="lib-row-title">{s.title}</span>
                        <span className="lib-row-sub">{[s.artist, s.genre && genreLabel(s.genre)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="lib-row-state">{status && <StatusTag status={status} />}</span>
                      <span className="lib-row-mastery">{percent > 0 && masteryLabel(percent)}</span>
                    </button>
                  )
                })}
              </div>}
              {!songs.length && loading && isServer && <div className="lib-grid" aria-hidden>
                {CARD_FILLS.map(fill => <div key={fill} className="lib-skeleton" style={{ background: fill }}><span /><span /><span /></div>)}
              </div>}
              {!songs.length && !loading && !error && <div className="lib-empty">
                <span className="lib-empty-title">{t`No songs found.`}</span>
                {q && <span className="o-note">{isServer ? t`Nothing on the home server matches “${q}”.` : t`Nothing on this device matches “${q}”.`}</span>}
                <div className="lib-empty-actions">
                  {q && <button className="o-btn" onClick={() => setQ('')}>{t`Clear search`}</button>}
                  {filtered && <button className="o-btn" onClick={clearFilters}>{t`Clear filters`}</button>}
                  {q && !isServer && <button className="o-btn-primary" onClick={() => switchSource('server')}>{t`Search the home server`}</button>}
                </div>
              </div>}
              {songs.length < total && (
                <button className="o-btn lib-more" onClick={() => (isServer ? void load(serverSongs.length) : setDeviceShown(n => n + PAGE))}>{t`Show more`}</button>
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button className="lib-nav-item" aria-pressed={active} onClick={onClick}>
      <span className="lib-ellipsis">{label}</span>
      {count != null && <span style={{ flexShrink: 0, fontSize: 'var(--text-sm)' }}>{count.toLocaleString()}</span>}
    </button>
  )
}

function KeepGoing({ song, mastery, onGo }: { song: SongServerSong; mastery: number; onGo: () => void }) {
  const card = songCard(song)
  const facts = [card.people[0], card.key, mastery > 0 ? masteryLabel(mastery) : null].filter(Boolean).join(' · ')
  return (
    <aside className="theme-studio lib-panel">
      <span className="o-disc" style={{ right: -60, top: -50, width: 220, height: 220 }} aria-hidden />
      <span className="o-triangle" style={{ right: 30, top: 196, width: 70, height: 62, transform: 'rotate(10deg)' }} aria-hidden />
      <span className="lib-panel-cover"><Art card={card} tilt={-3} /></span>
      <div className="lib-panel-text">
        <span style={{ color: 'var(--stone)' }}>{t`Keep going`}</span>
        <span className="o-title lib-clamp">{card.title}</span>
        {facts && <span style={{ color: 'var(--sand)' }}>{facts}</span>}
        <button className="o-btn-primary o-btn-lg" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={onGo}>{t`Continue playing`}</button>
      </div>
    </aside>
  )
}

function NoFolder({ demos, onChoose, onDemo }: { demos: boolean; onChoose: () => void; onDemo: () => void }) {
  return (
    <aside className="theme-studio lib-panel lib-panel-folder">
      <span className="o-triangle" style={{ right: 30, top: 30, width: 90, height: 80, background: 'var(--paint-lime)' }} aria-hidden />
      <span className="lib-panel-label">{t`No song folder yet`}</span>
      <span className="o-title-lg" style={{ marginTop: 'auto' }}>{t`Where are your songs?`}</span>
      <span style={{ color: 'var(--sand)', lineHeight: 1.35 }}>{t`Pick a folder with MIDI, MusicXML, Guitar Pro or karaoke files. Orfeo keeps watching it, so new songs show up by themselves.`}</span>
      <button className="o-btn-primary o-btn-lg" onClick={onChoose}>{t`Choose your song folder`}</button>
      {demos && <button className="o-btn o-btn-lg" onClick={onDemo}>{t`Play the demo songs`}</button>}
    </aside>
  )
}

function ConnectServer({ address, setAddress, searching, error, sourceSwitch, onConnect, onFind }: {
  address: string
  setAddress: (v: string) => void
  searching: boolean
  error: string
  sourceSwitch: React.ReactNode
  onConnect: () => void
  onFind: () => void
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  // execCommand, not navigator.clipboard: the same reason as the TopBar's copy, and it works in the Android WebView
  const copy = () => {
    const box = document.createElement('textarea')
    box.value = SERVER_COMMAND
    document.body.append(box)
    box.select()
    const ok = document.execCommand('copy')
    box.remove()
    if (!ok) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
  }
  return (
    <div className="lib-scroll">
      <div className="lib-connect-top">{sourceSwitch}</div>
      <div className="lib-connect orfeo-rise-in orfeo-rise-in-2">
        <form className="lib-connect-form" onSubmit={e => { e.preventDefault(); onConnect() }}>
          <h1 className="o-display">{t`Connect a home server`}</h1>
          <p className="lib-connect-lead">{t`Browse a big song collection from your computer. Songs download when you open them, and stay on this device.`}</p>
          <div className="lib-step">
            <span className="lib-step-n" style={{ background: 'var(--paint-lime)' }}>1</span>
            <div className="lib-step-body">
              <span className="lib-step-title">{t`On the computer, run:`}</span>
              <div className="theme-studio lib-command">
                <code>{SERVER_COMMAND}</code>
                <button type="button" className="o-btn" onClick={copy}>{copied ? <><Check size={15} aria-hidden />{t`Copied`}</> : t`Copy`}</button>
              </div>
            </div>
          </div>
          <div className="lib-step">
            <span className="lib-step-n" style={{ background: 'var(--paint-rose)' }}>2</span>
            <div className="lib-step-body">
              <label htmlFor="lib-address" className="lib-step-title">{t`Then connect to it from here`}</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input id="lib-address" className="lib-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="192.168.0.35:8765" aria-label={t`Server address`} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                <button className="o-btn-primary o-btn-lg" type="submit">{t`Connect`}</button>
              </div>
              <button className="o-btn" style={{ alignSelf: 'flex-start' }} type="button" disabled={searching} onClick={onFind}><Wifi size={17} aria-hidden />{searching ? t`Looking for a home server…` : t`Find automatically`}</button>
            </div>
          </div>
          {error && <div role="alert" className="lib-connect-alert"><span className="o-dot o-dot-alert" />{error}</div>}
        </form>
        <aside className="theme-studio lib-connect-side">
          <span style={{ color: 'var(--stone)' }}>{t`How songs show up`}</span>
          <div className="lib-sample" style={{ background: 'var(--paint-lime)' }}>
            <StatusTag status="local" />
            <span className="lib-sample-title">{t`Songs you've opened`}</span>
            <span>{t`They open straight away.`}</span>
          </div>
          <div className="lib-sample" style={{ background: 'var(--paint-blue)' }}>
            <StatusTag status="remote" />
            <span className="lib-sample-title">{t`Everything else`}</span>
            <span>{t`Tap one and it downloads first.`}</span>
          </div>
          <span className="o-spacer" />
          <span style={{ color: 'var(--sand)', lineHeight: 1.35 }}>{t`Server songs get Genre and Artist filters in the Library, so big collections stay easy to browse.`}</span>
        </aside>
      </div>
    </div>
  )
}
