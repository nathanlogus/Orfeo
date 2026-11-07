import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, FolderOpen, LayoutGrid, List, Loader2, MoreHorizontal, Play, Search, Settings, Wifi, X } from 'lucide-react'
import '../../styles/redesign-home.css'
import { useStore } from '../../store'
import { useMidiFile } from '../../hooks/useMidiFile'
import { t } from '../../utils/i18n'
import { deviceSongs, filterSongs, lastPlayedAt, matchesSearch, songCard, songFacets, sortSongs, type FilterOption, type LastPlayed } from '../../utils/homeSongs'
import { genreFill, genreLabel, type SongSort } from '../../utils/songCatalog'
import { base64ToBytes } from '../../utils/foreignFormatImport'
import { playSongPreview } from '../../audio/engine'
import { ARRANGEMENT_LABEL, Art, CARD_FILLS, Downloading, HANDS_LABEL, Card, FilterSelect, PreviewCover, PreviewDeck, StatusTag, Toggle, masteryLabel, songSortOptions, type SongStatus } from '../SongBrowser/SongBrowser'
import { SettingsDropdown } from '../Settings/controls'
import { NewVersionDot } from '../Settings/NewVersionDot'
import { ContextMenu, ContextMenuItem } from '../ContextMenu'
import { openFolders, openSongMenu, useFoldersPage } from '../SettingsPanel/foldersPage'
import { resumePhrase, resumeSong, songKey } from '../../utils/practiceSession'
import { playSet } from '../../utils/setSession'
import { phraseStarts, type PhraseProgress } from '../../utils/practiceScore'
import { usePlayback } from '../../hooks/usePlayback'
import PliageMark from '../PliageMark'
import PliageLogo from '../PliageLogo'
import LearnHome from '../Lessons/LearnHome'
import FirstRun from './FirstRun'
import HomeMenu, { GAME_MODES, pageOnTop } from './HomeMenu'
import type { SongServerList, SongServerSong } from '../../types'

const PAGE = 100
const SEARCH_DELAY_MS = 200
const GENRE_CHIPS = 5
const COPIED_MS = 1500
const SERVER_COMMAND = 'npm run android:songs -- "your song folder"'

type Source = 'device' | 'server'

// ── Where every session starts: find a song, on this device or the home server ──
// The page closes while a song is open: going back finds it as you left it
let remembered: Partial<{
  source: Source; q: string; genre: string | null; artist: string | null; arrangement: string; difficulty: string
  songKeyFilter: string; handsFilter: string; classicOnly: boolean; sort: SongSort
}> = {}

export default function HomePage() {
  const { openFile } = useMidiFile()
  const { seek, pause } = usePlayback()
  const hasSong = useStore(s => !!s.midi)
  const barTimes = useStore(s => s.midi?._barTimes)
  const loadedPath = useStore(s => (s.midi as any)?._filePath as string | undefined)
  const loadedName = useStore(s => s.midi?.fileName ?? '')
  const libraryFolder = useStore(s => s.libraryFolder)
  const libraryFiles = useStore(s => s.libraryFiles)
  const demoFiles = useStore(s => s.demoFiles)
  const hideDemoFolder = useStore(s => s.hideDemoFolder)
  const hiddenFiles = useStore(s => s.hiddenLibraryFiles)
  const showHiddenFiles = useStore(s => s.showHiddenLibraryFiles)
  const openFailed = useFoldersPage(s => s.failed)
  const inLesson = useStore(s => !!s.lessonRun)
  const midiConnected = useStore(s => s.midiDeviceConnected)
  const midiName = useStore(s => s.midiDeviceName)
  const lessonActive = useStore(s => !!s.lessonRun)

  const section = useStore(s => s.homeSection)
  const setSection = useStore(s => s.setHomeSection)
  const [source, setSource] = useState<Source>(remembered.source ?? 'device')
  const [view, setView] = useState<'cards' | 'list'>('cards')
  const [progress, setProgress] = useState<Record<string, { mastery?: number; phrases?: PhraseProgress[] }>>({})
  const [q, setQ] = useState(remembered.q ?? '')
  const [genre, setGenre] = useState<string | null>(remembered.genre ?? null)
  const [artist, setArtist] = useState<string | null>(remembered.artist ?? null)
  const [artistSearch, setArtistSearch] = useState('')
  const [arrangement, setArrangement] = useState(remembered.arrangement ?? '')
  const [difficulty, setDifficulty] = useState(remembered.difficulty ?? '')
  const [songKeyFilter, setSongKeyFilter] = useState(remembered.songKeyFilter ?? '')
  const [handsFilter, setHandsFilter] = useState(remembered.handsFilter ?? '')
  const [classicOnly, setClassicOnly] = useState(remembered.classicOnly ?? false)
  const [sort, setSort] = useState<SongSort>(remembered.sort ?? 'title')
  useEffect(() => {
    remembered = { ...remembered, q, genre, artist, arrangement, difficulty, songKeyFilter, handsFilter, classicOnly, sort }
  }, [q, genre, artist, arrangement, difficulty, songKeyFilter, handsFilter, classicOnly, sort])
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
  const [percent, setPercent] = useState<number | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [last, setLast] = useState<LastPlayed | null>(null)
  const [serverMenu, setServerMenu] = useState<{ song: SongServerSong; x: number; y: number } | null>(null)
  const serverMenuRef = useRef<HTMLDivElement>(null)
  const [deviceShown, setDeviceShown] = useState(PAGE)
  const [searching, setSearching] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  // The menu's first highlight depends on the saved song: nothing shows until that's known
  const [ready, setReady] = useState(false)
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
      // A song that has since gone from the disk has nothing to go back to
      void (p.lastPlayed ? window.electronAPI.statFiles([p.lastPlayed.path]) : Promise.resolve([])).then(found => { if (found.length) setLast(p.lastPlayed) }).finally(() => setReady(true))
      // Only a truly new install: anyone with a folder, a server or progress already knows the app
      if (!p.firstRunDone && !p.libraryFolder && !p.songServerUrl && !p.practiceProgress && !p.homeView) setFirstRun(true)
      if (!p.songServerUrl) return
      setAddress(p.songServerUrl)
      setConnected(true)
      if (!remembered.source) setSource('server')
    })
  }, [])

  // A lesson with no music opens over this page, and leaving it comes back to the menu
  useEffect(() => { if (inLesson) setSection('menu') }, [inLesson])

  useEffect(() => {
    window.electronAPI.onSongServerProgress(d => setPercent(d.percent))
    return () => window.electronAPI.offSongServerProgress()
  }, [])

  // A song on this device that wouldn't load or parse (the Library opens them, not this page)
  useEffect(() => {
    if (!openFailed) return
    setFailed(openFailed)
    setError(t`Couldn't open that song.`)
  }, [openFailed])

  useEffect(() => {
    if (!serverMenu) return
    const close = (e: Event) => {
      if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !serverMenuRef.current?.contains(e.target as Node)) setServerMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [serverMenu])

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
    const hidden = new Set(showHiddenFiles ? [] : hiddenFiles)
    return deviceSongs((library.length || hideDemoFolder ? library : demoFiles).filter(f => !hidden.has(f.path)), libraryFolder, catalog)
  }, [libraryFiles, demoFiles, hideDemoFolder, hiddenFiles, showHiddenFiles, libraryFolder, catalog])
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

  // The song to go back to: the loaded one where it is now, or the last one played where it was left
  const keepGoing = useMemo<LastPlayed | null>(() => {
    if (!hasSong) return last
    return lastPlayedAt(loadedPath ?? loadedName, loadedName, barTimes, useStore.getState().currentTime, last?.path === loadedPath ? last?.level : undefined)
  }, [hasSong, last, loadedPath, loadedName, barTimes])
  const keepGoingSong = keepGoing && (allDevice.find(s => s.path === keepGoing.path) ?? { path: keepGoing.path, title: keepGoing.name.replace(/\.[^.]+$/, ''), artist: '', genre: '', size: 0, local: true })

  const changeView = (next: 'cards' | 'list') => {
    setView(next)
    void window.electronAPI.setPrefs({ homeView: next })
  }

  const clearFilters = () => {
    setGenre(null); setArtist(null); setArrangement(''); setDifficulty(''); setSongKeyFilter(''); setHandsFilter(''); setClassicOnly(false); setSort('title')
  }
  const switchSource = (next: Source) => {
    remembered.source = next; setSource(next); clearFilters(); setError(''); setDeviceShown(PAGE)
  }
  const pickGenre = (name: string | null) => { setGenre(name); setArtist(null); setDeviceShown(PAGE) }
  const filtered = !!(genre || artist || arrangement || difficulty || songKeyFilter || handsFilter || classicOnly || sort !== 'title')
  const asFacet = (list: { name: string; count: number }[]) => list.map(o => ({ value: o.name, count: o.count }))

  // The song on this device, downloading it first if it isn't. Null if that failed.
  const fetchSong = async (song: SongServerSong) => {
    setOpening(song.path)
    setPercent(null)
    setFailed(null)
    setError('')
    useFoldersPage.setState({ failed: null })
    try {
      const path = await window.electronAPI.songServerDownload(address, song.path, song.size, song.sheet)
      const store = useStore.getState()
      if (store.libraryFolder) store.setLibraryFiles(await window.electronAPI.scanMidiFolder(store.libraryFolder))
      setServerSongs(list => list.map(s => (s.path === song.path ? { ...s, local: true } : s)))
      return path
    } catch (e) {
      setFailed(song.path)
      // The server said no to this one song: the rest of the list is still good
      if (!/server answered/.test(String(e))) setError(t`Can't reach the server. Check the address and that it's running.`)
      return null
    } finally {
      setOpening(null)
    }
  }

  const [preview, setPreview] = useState<{ song: SongServerSong; state: 'loading' | 'playing' } | null>(null)
  const previewRun = useRef(0)
  const stopPreviewSound = useRef<(() => void) | null>(null)
  const stopPreview = () => {
    previewRun.current++
    stopPreviewSound.current?.()
    stopPreviewSound.current = null
    setPreview(null)
  }
  useEffect(() => () => { previewRun.current++; stopPreviewSound.current?.() }, [])

  // A game mode has the sound to itself: the song behind it waits
  useEffect(() => { if (GAME_MODES.some(m => m.id === section) && useStore.getState().playbackState === 'playing') pause() }, [section, pause])

  const backToMenu = () => { stopPreview(); setSection('menu') }
  const leave = useRef(backToMenu)
  leave.current = backToMenu
  // Capture, so an overlay about to close on Esc is still there to see. A game mode keeps Esc for itself.
  useEffect(() => {
    if (section !== 'library' && section !== 'learn') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target instanceof HTMLInputElement || !pageOnTop()) return
      e.stopPropagation()
      leave.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [section])

  const togglePreview = async (song: SongServerSong) => {
    const same = preview?.song.path === song.path
    stopPreview()
    if (same) return
    const run = previewRun.current
    setPreview({ song, state: 'loading' })
    try {
      const store = useStore.getState()
      if (store.playbackState === 'playing') store.setPlaybackState('paused')
      const path = isServer ? await window.electronAPI.songServerDownload(address, song.path, song.size, song.sheet) : song.path
      const file = await window.electronAPI.loadMidiFromPath(path)
      if (!file) throw new Error('unreadable')
      if (run !== previewRun.current) return
      const stop = await playSongPreview(base64ToBytes(file.base64), () => { if (run === previewRun.current) stopPreview() })
      if (run !== previewRun.current) { stop(); return }
      stopPreviewSound.current = stop
      setPreview({ song, state: 'playing' })
    } catch {
      if (run === previewRun.current) { setPreview(null); setError(t`Couldn't play a preview of ${song.title}.`) }
    }
  }
  const previewOf = (s: SongServerSong) => (preview?.song.path === s.path ? preview.state : undefined)

  // shortcut: a server set is the songs loaded so far, not the whole list; page the rest in here if sets outgrow that
  const playAll = () => {
    stopPreview()
    void playSet(isServer
      ? serverSongs.map(s => ({ path: s.path, title: s.title, size: s.size, server: address, cover: { art: s.art ?? null, people: s.people ?? [] } }))
      : filteredDevice.map(s => ({ path: s.path, title: s.title, size: s.size })))
  }

  const open = async (song: SongServerSong, fromServer = isServer) => {
    if (opening) return
    stopPreview()
    setFailed(null)
    setError('')
    useFoldersPage.setState({ failed: null })
    const path = fromServer ? await fetchSong(song) : song.path
    if (path) useStore.getState().openSong(path, fromServer ? { art: song.art ?? null, people: song.people ?? [], title: song.title } : undefined)
  }

  const resume = () => {
    if (hasSong) { useStore.getState().setHomeOpen(false); return }
    if (!keepGoing || !keepGoingSong) return
    resumeSong(keepGoing.path, keepGoing.time)
    void open(keepGoingSong, false)
  }

  const fixPhrase = (phrase: number) => {
    if (hasSong) {
      seek(phraseStarts(barTimes ?? [])[phrase] ?? 0)
      useStore.getState().setHomeOpen(false)
    } else if (keepGoing && keepGoingSong) {
      resumePhrase(keepGoing.path, phrase)
      void open(keepGoingSong, false)
    }
  }

  // Songs on this device get the Library's menu; one that's only on the server has less to offer
  const rowMenu = async (song: SongServerSong, button: HTMLElement) => {
    const { left: x, bottom: y } = button.getBoundingClientRect()
    if (!isServer) openSongMenu(song.path, x, y)
    else if (song.local) openSongMenu(await window.electronAPI.songServerDownload(address, song.path, song.size), x, y)
    else setServerMenu({ song, x, y })
  }

  const pickFolder = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) useStore.getState().setLibraryFolderAndFiles(folder, await window.electronAPI.scanMidiFolder(folder))
    return !!folder
  }

  const statusOf = (s: SongServerSong): SongStatus | undefined =>
    opening === s.path ? 'opening' : failed === s.path ? 'failed' : !isServer ? undefined : s.local ? 'local' : 'remote'

  if (!ready) return <div className="theme-paper lib-page" />

  if (firstRun) {
    return <FirstRun pickFolder={pickFolder} onDone={server => {
      setFirstRun(false)
      void window.electronAPI.setPrefs({ firstRunDone: true })
      if (server) switchSource('server')
    }} />
  }

  if (section === 'menu') {
    const saved = keepGoing && progress[songKey(keepGoing.name)]
    return (
      <HomeMenu
        last={keepGoing && keepGoingSong ? { played: keepGoing, song: keepGoingSong } : null}
        songs={allDevice} phrases={saved?.phrases} mastery={saved?.mastery ?? 0} masteryOf={masteryOf}
        homeServer={connected} failed={!!openFailed}
        onResume={resume} onFixPhrase={fixPhrase} onOpenSong={song => void open(song, false)} onOpenSection={setSection} onChooseFolder={() => void pickFolder()}
      />
    )
  }

  const mode = GAME_MODES.find(m => m.id === section)
  const GameMode = mode?.home
  if (GameMode && mode?.ownPage) return <div className="theme-paper lib-page"><Suspense fallback={null}><GameMode onBack={backToMenu} /></Suspense></div>
  const showConnect = isServer && !connected
  const failure = isServer ? t`Couldn't download that song.` : t`Couldn't open that song.`
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
      <header className="lib-header pliage-rise-in">
        <button className="o-btn" onClick={backToMenu}><ArrowLeft size={16} aria-hidden />{t`Back to menu`}</button>
        <span className="lib-logo"><span className="lib-logo-disc"><PliageMark height={20} tone="sun" /></span><PliageLogo height={26} tone="night" /></span>
        {!GameMode && <div role="tablist" aria-label={t`Sections`} className="lib-seg">
          <button role="tab" aria-selected={section === 'library'} onClick={() => setSection('library')}>{t`Library`}</button>
          <button role="tab" aria-selected={section === 'learn'} onClick={() => setSection('learn')}>{t`Learn`}</button>
        </div>}
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
        {!GameMode && <button className="o-btn lib-open" onClick={openFile}><FolderOpen size={16} aria-hidden />{t`Open file`}</button>}
        <button className="o-icon-btn" style={{ position: 'relative' }} onClick={() => useStore.getState().openSettingsWindow()} aria-label={t`Settings`}><Settings size={18} /><NewVersionDot /></button>
      </header>

      {GameMode ? <Suspense fallback={null}><GameMode onBack={backToMenu} /></Suspense> : section === 'learn' ? <LearnHome /> : showConnect ? (
        <ConnectServer
          address={address} setAddress={setAddress} searching={searching} error={error} sourceSwitch={sourceSwitch}
          onConnect={() => { if (address.trim()) { setConnected(true); setError('') } }}
          onFind={() => void findServer()}
        />
      ) : (
        <div className="lib-scroll">
          {view === 'cards' && <section className="lib-hero pliage-rise-in pliage-rise-in-2">
            <h1 className="o-display lib-headline">{t`What are we playing?`}</h1>
            <div className="lib-hero-side">
              {sourceSwitch}
              {genreOptions.length > 0 && <div className="lib-chips">
                <button aria-pressed={!genre} onClick={() => pickGenre(null)}>{t`All`}{!genre && ` ${total.toLocaleString()}`}</button>
                {chips.map(g => <button key={g.name} aria-pressed={genre === g.name} style={{ '--fill': genreFill(g.name) } as React.CSSProperties} onClick={() => pickGenre(genre === g.name ? null : g.name)}>{`${genreLabel(g.name)} ${g.count.toLocaleString()}`}</button>)}
              </div>}
            </div>
          </section>}

          <div className="lib-tools pliage-rise-in pliage-rise-in-2">
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
              {(songs.length > 0 || !loading) && <span aria-live="polite">{total === 1 ? t`1 song` : `${total.toLocaleString()} ${isServer ? t`songs on the home server` : t`songs`}`}</span>}
              {loading && isServer && !songs.length && <span>{t`Loading from the home server`}</span>}
              {loading && isServer && <Loader2 size={15} className="home-spin" aria-label={t`Loading`} />}
              <span className="o-spacer" />
              {filtered && <button className="o-link" onClick={clearFilters}>{t`Clear filters`}</button>}
              {songs.length > 1 && !lessonActive && <button className="o-btn" onClick={playAll}><Play size={14} fill="currentColor" aria-hidden />{t`Play all`}</button>}
              {isServer
                ? <button className="o-link" onClick={() => setConnected(false)}>{t`Change server`}</button>
                : <>
                  <button className="o-link" onClick={() => openFolders()}>{t`Folders`}</button>
                  {!libraryFolder && <button className="o-link" onClick={() => void pickFolder()}>{t`Choose your song folder`}</button>}
                </>}
            </div>
          </div>

          {error && <div role="alert" className="lib-alert">
            <span className="o-dot o-dot-alert" />
            <span style={{ flex: 1 }}>{error}</span>
            {isServer && <button className="o-link" onClick={() => setConnected(false)}>{t`Change server`}</button>}
          </div>}

          <div className="lib-body pliage-rise-in pliage-rise-in-3">
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

            {view === 'cards' && (keepGoing && keepGoingSong
              ? <KeepGoing song={keepGoingSong} last={keepGoing} onGo={resume} />
              : !libraryFolder && !isServer && <NoFolder demos={allDevice.length > 0} onChoose={() => void pickFolder()} onDemo={() => void open(allDevice[0], false)} />)}

            <main className="lib-main">
              {view === 'cards' && songs.length > 0 && <div className="lib-grid">
                {songs.map((s, i) => <Card key={s.path} card={songCard(s)} index={i} loaded={false} mastery={masteryOf(s.path)} status={statusOf(s)} percent={percent} failure={failure} preview={previewOf(s)} onPreview={() => void togglePreview(s)} onOpen={() => void open(s)} />)}
              </div>}
              {view === 'list' && songs.length > 0 && <div className="lib-list">
                {songs.map((s, i) => {
                  const learned = masteryOf(s.path)
                  const status = statusOf(s)
                  return (
                    <div key={s.path} className="lib-row" data-preview={previewOf(s)} style={{ '--fill': s.genre ? genreFill(s.genre) : CARD_FILLS[i % CARD_FILLS.length] } as React.CSSProperties}>
                      <PreviewCover card={songCard(s)} preview={previewOf(s)} onToggle={() => void togglePreview(s)} />
                      <button className="lib-row-open" onClick={() => void open(s)} disabled={!!opening}>
                        <span className="lib-row-text">
                          <span className="lib-row-title">{s.title}</span>
                          <span className="lib-row-sub">{status === 'failed' ? failure : [s.artist, s.genre && genreLabel(s.genre)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="lib-row-state">
                          {status && <StatusTag status={status} />}
                          {status === 'opening' && <Downloading percent={percent} />}
                        </span>
                        <span className="lib-row-mastery">{learned > 0 && masteryLabel(learned)}</span>
                      </button>
                      {status === 'failed' && <button className="o-btn" onClick={() => void open(s)}>{t`Try again`}</button>}
                      <button className="o-icon-quiet lib-file-btn" aria-label={t`More for ${s.title}`} onClick={e => void rowMenu(s, e.currentTarget)}><MoreHorizontal size={18} /></button>
                    </div>
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
      {preview && <PreviewDeck card={songCard(preview.song)} playing={preview.state === 'playing'} onStop={stopPreview} />}
      {serverMenu && (
        <ContextMenu ref={serverMenuRef} x={serverMenu.x} y={serverMenu.y} ariaLabel={t`Song actions`}>
          <ContextMenuItem onClick={() => { setServerMenu(null); void open(serverMenu.song) }}>{t`Open`}</ContextMenuItem>
          <ContextMenuItem onClick={() => { setServerMenu(null); void fetchSong(serverMenu.song) }}>{t`Download to this device`}</ContextMenuItem>
        </ContextMenu>
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

function KeepGoing({ song, last, onGo }: { song: SongServerSong; last: LastPlayed; onGo: () => void }) {
  const card = songCard(song)
  const facts = [card.people[0], last.bar && t`bar ${last.bar} of ${last.bars}`, last.level && t`level ${last.level}`].filter(Boolean).join(' · ')
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
      <span style={{ color: 'var(--sand)', lineHeight: 1.35 }}>{t`Pick a folder with MIDI, MusicXML, Guitar Pro or karaoke files. Pliage keeps watching it, so new songs show up by themselves.`}</span>
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
      <div className="lib-connect pliage-rise-in pliage-rise-in-2">
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
