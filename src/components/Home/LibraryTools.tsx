import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Plus, ArrowUp, ArrowDown, Play, Trash2 } from 'lucide-react'
import type { SongServerSong } from '../../types'
import { useStore } from '../../store'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { previewInboxSong, scanImportInbox, useImportInbox, type InboxCandidate } from '../../hooks/useImportInbox'
import { cleanSongEdit, defaultPractice, librarySongKey, moveSetEntry, newLibraryId, saveLibraryWorkspace, useLibraryWorkspace, type SavedSet, type SongEdit } from '../../utils/libraryWorkspace'
import { playSet } from '../../utils/setSession'
import { compareTakes, type PerformanceTake } from '../../utils/performanceRecording'
import { playSongPreview } from '../../audio/engine'
import { base64ToBytes } from '../../utils/foreignFormatImport'
import '../../styles/library-tools.css'

type Tab = 'inbox' | 'offline' | 'details' | 'sets' | 'takes'
export default function LibraryTools({ songs, server, onClose, onRefresh, initialSong }: { songs: SongServerSong[]; server: string; onClose: () => void; onRefresh: () => void; initialSong?: SongServerSong }) {
  const ref = useRef<HTMLDivElement>(null); useFocusTrap(ref, true)
  const [tab, setTab] = useState<Tab>(initialSong ? 'details' : 'inbox')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const run = async (work: () => Promise<void>) => { setMessage(''); setBusy(true); try { await work() } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) } }
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose() } }; window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true) }, [busy, onClose])
  return createPortal(<div className="library-tools-shade" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <div className="theme-paper library-tools-dialog" role="dialog" aria-modal="true" aria-labelledby="library-tools-title" ref={ref}>
      <header><h2 id="library-tools-title">Your library & practice</h2><button className="o-icon-btn" disabled={busy} aria-label="Close library tools" onClick={onClose}><X /></button></header>
      <nav aria-label="Library tools">{([['inbox', 'Import inbox'], ['offline', 'Offline songs'], ['details', 'Song details'], ['sets', 'Practice setlists'], ['takes', 'Recordings']] as const).map(([id, label]) => <button className="o-btn" key={id} aria-pressed={tab === id} disabled={busy} onClick={() => { setTab(id); setMessage('') }}>{label}</button>)}</nav>
      {message && <p role="status" className="library-tools-message">{message}</p>}
      {busy && <p role="status">Working…</p>}
      <div className="library-tools-content" aria-busy={busy}>
        {tab === 'inbox' && <Inbox busy={busy} run={run} notify={setMessage} refresh={onRefresh} server={server} />}
        {tab === 'offline' && <Offline songs={songs} server={server} busy={busy} run={run} notify={setMessage} />}
        {tab === 'details' && <Details songs={songs} server={server} initialSong={initialSong} busy={busy} run={run} notify={setMessage} />}
        {tab === 'sets' && <Sets songs={songs} server={server} busy={busy} run={run} notify={setMessage} close={onClose} />}
        {tab === 'takes' && <Takes run={run} busy={busy} />}
      </div>
    </div>
  </div>, document.body)
}
type Actions = { busy: boolean; run: (work: () => Promise<void>) => Promise<void>; notify: (message: string) => void }
function Inbox({ busy, run, notify, refresh, server }: Actions & { refresh: () => void; server: string }) {
  const config = useLibraryWorkspace(s => s.inbox), inbox = useImportInbox()
  const [candidate, setCandidate] = useState<InboxCandidate | null>(null)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewInboxSong>> | null>(null)
  const [title, setTitle] = useState(''), [artist, setArtist] = useState(''), [genre, setGenre] = useState(''), [art, setArt] = useState<string | null>(null)
  const [covers, setCovers] = useState<Awaited<ReturnType<Window['electronAPI']['findLibraryArtwork']>>>([])
  const pick = (kind: 'source' | 'target') => run(async () => { const path = await window.electronAPI.chooseInboxFolder(kind); if (path) await saveLibraryWorkspace({ inbox: { ...useLibraryWorkspace.getState().inbox, [kind]: path } }) })
  return <section>
    <h3>Add songs from a folder</h3><p>While Pliage is open, watch a folder for new MIDI and score files. Review each song before adding it. Originals stay in place.</p>
    <div className="library-tools-actions"><button className="o-btn" disabled={busy} onClick={() => void pick('source')}>Choose watched folder</button><span>{config.source || 'None selected'}</span></div>
    <div className="library-tools-actions"><button className="o-btn" disabled={busy} onClick={() => void pick('target')}>Choose collection folder</button><span>{config.target || 'None selected'}</span></div>
    <label><input type="checkbox" checked={config.enabled} disabled={!config.source || !config.target || busy} onChange={e => void run(async () => { await saveLibraryWorkspace({ inbox: { ...config, enabled: e.target.checked } }); await scanImportInbox() })} /> Watch for new songs</label>
    <p className="o-note">On your tablet, choose a folder on the tablet. To watch your computer’s Downloads, configure this on your computer.</p>
    <button className="o-btn" disabled={!config.source || !config.target || busy || inbox.scanning} onClick={() => void run(scanImportInbox)}>Check now</button>
    {inbox.error && <p role="alert">{inbox.error}</p>}
    <p>{inbox.candidates.length} awaiting review · {inbox.duplicates} duplicates skipped</p>
    {!candidate && inbox.candidates.map(c => <div className="library-tools-row" key={c.hash}><span>{c.name}</span><button className="o-btn" disabled={busy} onClick={() => void run(async () => { const result = await previewInboxSong(c); setCandidate(c); setPreview(result); setTitle(result.title); setArtist(result.artist); setGenre(''); setArt(null); setCovers([]) })}>Review</button><button className="o-btn" disabled={busy} onClick={() => void run(async () => { await saveLibraryWorkspace({ inbox: { ...config, dismissed: [...config.dismissed, c.hash] } }); await scanImportInbox() })}>Dismiss</button></div>)}
    {candidate && preview && <form onSubmit={e => { e.preventDefault(); void run(async () => {
      const details = cleanSongEdit({ title, artist, genre, art })
      const result = await window.electronAPI.commitInboxSong({ source: candidate.path, sourceHash: candidate.hash, midi: preview.midi, ...details, art: details.art ?? null })
      setCandidate(null); setPreview(null); await scanImportInbox(); refresh(); notify(result.duplicate ? 'This song was already imported.' : 'Song added with its original score.');
    }) }}>
      <h4>{candidate.name}</h4><p>{preview.notes} notes · {Math.round(preview.duration)} seconds</p>
      <Fields title={title} artist={artist} genre={genre} art={art} setTitle={setTitle} setArtist={setArtist} setGenre={setGenre} setArt={setArt} />
      <button type="button" className="o-btn" disabled={busy || !artist.trim()} onClick={() => void run(async () => { const found = await window.electronAPI.findLibraryArtwork(title, artist, server || undefined); setCovers(found); notify(found.length ? 'Choose a matching cover below.' : 'No verified cover found. You can add an image URL instead.') })}>Find Spotify cover</button>
      <CoverChoices covers={covers} chosen={art} choose={setArt} />
      <div className="library-tools-actions"><button className="o-btn-primary" disabled={busy}>Add to collection</button><button type="button" className="o-btn" disabled={busy} onClick={() => setCandidate(null)}>Cancel review</button></div>
    </form>}
  </section>
}
function Fields(p: { title: string; artist: string; genre: string; art: string | null; setTitle: (v: string) => void; setArtist: (v: string) => void; setGenre: (v: string) => void; setArt: (v: string | null) => void }) {
  return <div className="library-tools-fields">{([['Title', p.title, p.setTitle], ['Artist / composer', p.artist, p.setArtist], ['Genre', p.genre, p.setGenre], ['Cover image URL', p.art ?? '', (v: string) => p.setArt(v || null)]] as const).map(([label, value, change]) => <label key={label}>{label}<input value={value} required={label === 'Title'} type={label.includes('URL') ? 'url' : 'text'} onChange={e => change(e.target.value)} /></label>)}</div>
}
function CoverChoices({ covers, chosen, choose }: { covers: { album: string; artist: string; url: string }[]; chosen: string | null; choose: (url: string) => void }) { return <div className="library-tools-covers">{covers.map((c, i) => <button type="button" key={`${c.url}-${i}`} aria-pressed={c.url === chosen} onClick={() => choose(c.url)}><img src={c.url} alt={c.album} /><span>{c.album}<br />{c.artist}</span></button>)}</div> }

export function localCover(path: string | null) {
  if (!path) return null
  return (window as any).androidPiano ? new URL('/fs' + encodeURI(path), location.origin).href : encodeURI('file:///' + path.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')
}
export async function keepOffline(song: SongServerSong, server: string) {
  const downloaded = await window.electronAPI.downloadOfflineSong(server, song)
  const key = librarySongKey(song.path, server)
  const cached = { ...song, path: downloaded.path, art: localCover(downloaded.artPath), local: true }
  await saveLibraryWorkspace({ offline: { ...useLibraryWorkspace.getState().offline, [key]: { song: cached, server, remotePath: song.path, downloadedAt: Date.now() } } })
  return cached
}
function Offline({ songs, server, run, busy, notify }: Actions & { songs: SongServerSong[]; server: string }) {
  const offline = useLibraryWorkspace(s => s.offline), [selected, select] = useState<Set<string>>(new Set()), [cancel, setCancel] = useState(false), cancelRef = useRef(false)
  const [done, setDone] = useState(0)
  useEffect(() => () => { cancelRef.current = true }, [])
  const download = () => run(async () => {
    cancelRef.current = false; setCancel(false); setDone(0); let completed = 0; const failures: string[] = []
    for (const song of songs.filter(s => selected.has(s.path))) {
      if (cancelRef.current) break
      try { await keepOffline(song, server); completed++ } catch (error) { failures.push(`${song.title}: ${(error as Error).message ?? 'Download failed'}`) }
      setDone(n => n + 1)
    }
    notify(`${completed} saved for offline practice.${failures.length ? ` Failed: ${failures.join(', ')}. Retry to finish those songs.` : ''}`)
  })
  return <section><h3>Music that travels with you</h3><p>Downloads include the MIDI, original score when available, cover and song details. Saved songs appear under This device, even when the server is off.</p>
    {!server && <p>Switch to Home server to choose songs to download.</p>}
    {server && <><div className="library-tools-actions"><button className="o-btn" disabled={busy} onClick={() => select(new Set(songs.map(s => s.path)))}>Select all {songs.length} matching songs</button><button className="o-btn" disabled={busy} onClick={() => select(new Set())}>Clear selection</button><button className="o-btn-primary" disabled={busy || !selected.size} onClick={() => void download()}><Download size={16} />Download {selected.size}</button>{busy && <button className="o-btn" disabled={cancel} onClick={() => { cancelRef.current = true; setCancel(true) }}>Stop after this song</button>}</div>{busy && <p aria-live="polite">{done} of {selected.size} processed</p>}
    {songs.map(s => <label className="library-tools-row" key={s.path}><input type="checkbox" disabled={busy} checked={selected.has(s.path)} onChange={e => select(old => { const next = new Set(old); e.target.checked ? next.add(s.path) : next.delete(s.path); return next })} /><span>{s.title}</span><span>{offline[librarySongKey(s.path, server)] ? 'On this device' : 'Server only'}</span></label>)}</>}
    <p>{Object.keys(offline).length} songs saved for offline practice.</p>
  </section>
}
function Details({ songs, server, initialSong, busy, run, notify }: Actions & { songs: SongServerSong[]; server: string; initialSong?: SongServerSong }) {
  const edits = useLibraryWorkspace(s => s.edits), [path, choose] = useState(initialSong?.path ?? songs[0]?.path ?? '')
  const song = songs.find(s => s.path === path), [title, setTitle] = useState(''), [artist, setArtist] = useState(''), [genre, setGenre] = useState(''), [art, setArt] = useState<string | null>(null)
  const [covers, setCovers] = useState<Awaited<ReturnType<Window['electronAPI']['findLibraryArtwork']>>>([])
  const [coverTouched, setCoverTouched] = useState(false)
  const changeArt = (url: string | null) => { setCoverTouched(true); setArt(url) }
  useEffect(() => { if (!song) return; setTitle(song.title); setArtist(song.artist); setGenre(song.genre); setArt(song.art?.startsWith('https:') ? song.art : null); setCovers([]); setCoverTouched(false) }, [path])
  return <section><h3>Make the library yours</h3><p>Edits are saved on this device and used by search and genre filters. Files and the read-only home server are unchanged.</p>
    <label>Song<select value={path} onChange={e => choose(e.target.value)}>{songs.map(s => <option key={s.path} value={s.path}>{s.title}</option>)}</select></label>
    {song && <form onSubmit={e => { e.preventDefault(); void run(async () => { const edit = cleanSongEdit({ title, artist, genre, art: coverTouched ? art : undefined }); await saveLibraryWorkspace({ edits: { ...edits, [librarySongKey(path, server)]: edit } }); notify('Song details saved.') }) }}>
      <Fields title={title} artist={artist} genre={genre} art={art} setTitle={setTitle} setArtist={setArtist} setGenre={setGenre} setArt={changeArt} />
      <div className="library-tools-actions"><button className="o-btn-primary" disabled={busy}>Save details</button><button type="button" className="o-btn" disabled={busy || !artist} onClick={() => void run(async () => { const found = await window.electronAPI.findLibraryArtwork(title, artist, server || undefined); setCovers(found); notify(found.length ? 'Choose a cover, then save.' : 'No verified cover found.') })}>Find Spotify cover</button><button type="button" className="o-btn" disabled={busy || !edits[librarySongKey(path, server)]} onClick={() => void run(async () => { const next = { ...edits }; delete next[librarySongKey(path, server)]; await saveLibraryWorkspace({ edits: next }); notify('Original details restored. Re-select the song to edit again.') })}>Restore original</button></div>
      <CoverChoices covers={covers} chosen={art} choose={changeArt} />
    </form>}
  </section>
}
function Sets({ songs, server, busy, run, notify, close }: Actions & { songs: SongServerSong[]; server: string; close: () => void }) {
  const sets = useLibraryWorkspace(s => s.sets), [name, setName] = useState(''), [id, select] = useState(sets[0]?.id ?? ''), [songPath, setSongPath] = useState(songs[0]?.path ?? '')
  const set = sets.find(s => s.id === id)
  const update = (changed: SavedSet) => saveLibraryWorkspace({ sets: sets.map(s => s.id === changed.id ? changed : s) })
  return <section><h3>Your practice setlists</h3><p>Keep a list for a week, an album or a performance. Each song remembers its tempo, hand tracks and practice section.</p>
    <form className="library-tools-actions" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; void run(async () => { const next = { id: newLibraryId(), name: name.trim(), songs: [] }; await saveLibraryWorkspace({ sets: [...sets, next] }); select(next.id); setName('') }) }}><input aria-label="New setlist name" placeholder="New setlist name" value={name} onChange={e => setName(e.target.value)} required /><button className="o-btn" disabled={busy}><Plus size={15} />Create</button></form>
    <label>Setlist<select value={id} onChange={e => select(e.target.value)}><option value="">Choose a setlist</option>{sets.map(s => <option key={s.id} value={s.id}>{s.name} ({s.songs.length})</option>)}</select></label>
    {set && <><label>Setlist name<input value={set.name} onChange={e => void update({ ...set, name: e.target.value })} /></label><div className="library-tools-actions"><select aria-label="Song to add" value={songPath} onChange={e => setSongPath(e.target.value)}>{songs.map(s => <option key={s.path} value={s.path}>{s.title}</option>)}</select><button className="o-btn" disabled={busy || !songs.some(s => s.path === songPath)} onClick={() => { const song = songs.find(s => s.path === songPath)!; void run(async () => { await update({ ...set, songs: [...set.songs, { id: newLibraryId(), song, server, practice: defaultPractice() }] }) }) }}>Add song</button></div>
    {set.songs.map((entry, i) => <div className="library-set-entry" key={entry.id}><div className="library-tools-actions"><strong>{i + 1}. {entry.song.title}</strong><button className="o-icon-btn" disabled={i === 0 || busy} aria-label={`Move ${entry.song.title} up`} onClick={() => void update({ ...set, songs: moveSetEntry(set.songs, i, i - 1) })}><ArrowUp size={16} /></button><button className="o-icon-btn" disabled={i === set.songs.length - 1 || busy} aria-label={`Move ${entry.song.title} down`} onClick={() => void update({ ...set, songs: moveSetEntry(set.songs, i, i + 1) })}><ArrowDown size={16} /></button><button className="o-icon-btn" aria-label={`Remove ${entry.song.title}`} disabled={busy} onClick={() => void update({ ...set, songs: set.songs.filter(e => e.id !== entry.id) })}><Trash2 size={16} /></button></div>
      <div className="library-tools-fields">{(['tempo', 'start', 'end'] as const).map(key => <label key={key}>{key === 'tempo' ? 'Tempo (%)' : key === 'start' ? 'Start (seconds)' : 'End (seconds, blank = end)'}<input type="number" min={key === 'tempo' ? 10 : 0} max={key === 'tempo' ? 300 : undefined} value={entry.practice[key] ?? ''} onChange={e => { const value = e.target.value === '' && key === 'end' ? null : Number(e.target.value); void update({ ...set, songs: set.songs.map(x => x.id === entry.id ? { ...x, practice: { ...x.practice, [key]: value } } : x) }) }} /></label>)}<label>Hand tracks<select value={entry.practice.hand} onChange={e => void update({ ...set, songs: set.songs.map(x => x.id === entry.id ? { ...x, practice: { ...x.practice, hand: e.target.value as 'both' | 'left' | 'right' } } : x) })}><option value="both">Both</option><option value="left">Left</option><option value="right">Right</option></select></label></div>
    </div>)}
    <div className="library-tools-actions"><button className="o-btn-primary" disabled={busy || !set.songs.length} onClick={() => void run(async () => {
      const entries = set.songs.map(e => {
        const cached = useLibraryWorkspace.getState().offline[librarySongKey(e.song.path, e.server)]
        return { path: cached?.song.path ?? e.song.path, title: e.song.title, size: e.song.size, server: cached ? undefined : e.server || undefined, sheet: e.song.sheet, practice: e.practice, cover: { art: cached?.song.art ?? e.song.art ?? null, people: e.song.people ?? [], title: e.song.title } }
      })
      await playSet(entries); close()
    })}><Play size={16} />Play setlist</button><button className="o-btn" disabled={busy} onClick={() => void run(async () => { await saveLibraryWorkspace({ sets: sets.filter(s => s.id !== set.id) }); select(''); notify('Setlist removed. Songs are still in your library.') })}>Delete setlist</button></div></>}
  </section>
}
function Takes({ run, busy }: Pick<Actions, 'run' | 'busy'>) {
  const [takes, setTakes] = useState<PerformanceTake[]>([]), [selected, select] = useState<string[]>([]), stop = useRef<(() => void) | null>(null)
  useEffect(() => { void window.electronAPI.listPerformanceTakes().then(setTakes); return () => stop.current?.() }, [])
  const a = takes.find(t => t.id === selected[0]), b = takes.find(t => t.id === selected[1]), comparison = a && b ? compareTakes(a, b) : null
  return <section><h3>Listen to your progress</h3><p>Open a song and use Record take above the piano roll. Play your MIDI keyboard, then stop to save. These are MIDI performances, including pedal movements.</p>
    {!takes.length && <p>No recordings yet.</p>}
    {comparison && <div className="library-take-comparison" role="status"><strong>{a!.name} → {b!.name}</strong><p>Duration change: {comparison.durationChange}s · Notes: {comparison.noteChange > 0 ? '+' : ''}{comparison.noteChange} · Notes/second: {comparison.densityChange > 0 ? '+' : ''}{comparison.densityChange}</p><p>These compare the performances you played; they are not accuracy scores.</p></div>}
    {takes.map(t => <div className="library-tools-row" key={t.id}><input type="checkbox" aria-label={`Compare ${t.name}`} checked={selected.includes(t.id)} onChange={e => select(old => e.target.checked ? [...old.slice(-1), t.id] : old.filter(id => id !== t.id))} /><span><strong>{t.name}</strong><br />{t.notes} notes · {Math.round(t.duration)}s</span><button className="o-btn" disabled={busy} onClick={() => void run(async () => { stop.current?.(); if (useStore.getState().playbackState === 'playing') useStore.getState().setPlaybackState('paused'); stop.current = await playSongPreview(base64ToBytes(t.midi), () => { stop.current = null }, t.duration + .25) })}>Listen</button><button className="o-btn" onClick={() => { stop.current?.(); stop.current = null }}>Stop</button><button className="o-btn" disabled={busy} onClick={() => void run(async () => { await window.electronAPI.exportPerformanceTake(t.id) })}>Export MIDI</button><button className="o-icon-btn" aria-label={`Delete ${t.name}`} disabled={busy} onClick={() => void run(async () => { stop.current?.(); await window.electronAPI.deletePerformanceTake(t.id); setTakes(await window.electronAPI.listPerformanceTakes()); select(old => old.filter(id => id !== t.id)) })}><Trash2 size={16} /></button></div>)}
  </section>
}
