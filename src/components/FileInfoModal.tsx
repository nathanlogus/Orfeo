// ── File info — metadata table, change log, and version chain for a library
// file, opened via the Library's right-click context menu. Works on any
// file, not just the loaded one: reads it fresh over IPC rather than
// touching the app's loaded state. Artist/Song are the only editable fields
// (inline, staged locally); Save commits one real rename on disk.
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowUpDown, ChevronDown, Save, FolderOpen, Timer, Copy } from 'lucide-react'
import { useStore } from '../store'
import Tooltip from './Tooltip'
import { t } from '../utils/i18n'
import { likelySameSong, matchSongs, SAME_SONG } from '../utils/copyBars'
import { base64ToBytes } from '../utils/foreignFormatImport'
import { parseMidiBuffer } from '../utils/midiParser'
import { MarqueeText } from './MarqueeText'
import { parseMidiMetadata, buildRenamedFileName, formatKeyOrDash, type MidiFileMetadata } from '../utils/midiMetadata'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDraggableDialog } from '../hooks/useDraggableDialog'
import { MODAL_MAX_HEIGHT } from '../utils/modalDrag'
import { tagHistory, versionLabel, type TaggedEvent } from '../utils/fileHistory'
import '../styles/redesign-settings.css'

interface FileLogEvent { type: string; timestamp: number; summary: string }
interface FileVersion { name: string; path: string; version: number; mtime: number }

// ── 'en-GB' pinned deliberately — this is Orfeo-internal bookkeeping, not
// user-facing content, and a system locale abbreviating "Aug" as "avg." (or
// similar) reads as broken here regardless of the user's actual language. ──
function formatLogDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

interface Props {
  filePath: string
  fileName: string
  onClose: () => void
  onRenamed: (oldPath: string, newPath: string, newName: string) => void
  onRebuildTempo: (filePath: string) => void
  onCopyBars: (filePath: string, source: { bytes: Uint8Array; name: string }) => void
}

// A file with the same notes as this one, and what it knows about its bars
interface OtherVersion { name: string; bytes: Uint8Array; share: number; bars: string }

const readSong = (bytes: Uint8Array, name: string) => parseMidiBuffer(bytes.slice().buffer as ArrayBuffer, name, '')

function describeBars(midi: ReturnType<typeof parseMidiBuffer>): string {
  const sigs = ((midi as any)._timeSigMap ?? []) as { num: number; den: number }[]
  const kinds = [...new Set(sigs.map(s => `${s.num}/${s.den}`))]
  return `${Math.round(midi.bpm)} ${t`bpm`} · ${kinds.join(', ') || '4/4'}`
}

export default function FileInfoModal({ filePath, fileName, onClose, onRenamed, onRebuildTempo, onCopyBars }: Props) {
  const noteNaming   = useStore((s) => s.noteNaming)
  const accidentals  = useStore((s) => s.accidentals)
  const noteEditorActive = useStore((s) => s.noteEditorActive)

  // ── Copy bars: other files with this song's notes. null = list closed ──────
  const [otherVersions, setOtherVersions] = useState<OtherVersion[] | 'checking' | null>(null)
  const [copyNote, setCopyNote] = useState<string | null>(null)

  const [currentPath, setCurrentPath] = useState(filePath)
  const [currentName, setCurrentName] = useState(fileName)
  const [meta, setMeta] = useState<MidiFileMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const thisSong = async () => {
    const own = await window.electronAPI.loadMidiFromPath(currentPath)
    return own ? readSong(base64ToBytes(own.base64), currentName) : null
  }

  const compare = (me: ReturnType<typeof parseMidiBuffer>, bytes: Uint8Array, name: string): OtherVersion | null => {
    try {
      const other = readSong(bytes, name)
      const share = matchSongs(other, me)?.share ?? 0
      return share >= SAME_SONG ? { name, bytes, share, bars: describeBars(other) } : null
    } catch { return null }  // not a MIDI file Orfeo can read
  }

  const findVersions = async () => {
    setCopyNote(null)
    setOtherVersions('checking')
    const found: OtherVersion[] = []
    try {
      const me = await thisSong()
      const named = (useStore.getState() as any).libraryFiles as { path: string; name: string }[]
      for (const f of named.filter(x => x.path !== currentPath && likelySameSong(currentName, x.name)).slice(0, 24)) {
        const file = me && await window.electronAPI.loadMidiFromPath(f.path)
        const v = me && file ? compare(me, base64ToBytes(file.base64), f.name) : null
        if (v) found.push(v)
      }
    } catch (e) { console.error('[Orfeo] comparing versions failed:', e) }
    setOtherVersions(found.sort((a, b) => b.share - a.share))
  }

  const chooseVersion = async () => {
    const picked = await window.electronAPI.openMidiFile()
    if (!picked) return
    const me = await thisSong()
    const v = me ? compare(me, base64ToBytes(picked.base64), picked.fileName) : null
    if (v) onCopyBars(currentPath, { bytes: v.bytes, name: v.name })
    else setCopyNote(t`That file doesn't have the same notes as this song, so its bars wouldn't fit.`)
  }

  const [artistDraft, setArtistDraft] = useState('')
  const [songDraft, setSongDraft] = useState('')
  const [log, setLog] = useState<FileLogEvent[] | null>(null)
  const [versions, setVersions] = useState<FileVersion[] | null>(null)
  const [tagged, setTagged] = useState<TaggedEvent[] | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const versionsRef = useRef<HTMLDivElement>(null)

  // ── Draggable — starts centered (backdrop flex-centers it); once dragged,
  // switches to an explicit fixed position that escapes that centering. ────
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const { onDragStart, placed } = useDraggableDialog(panelRef)
  // ── Only rendered while a file-info target is set (see SettingsPanel) —
  // always active while this component exists. ─────────────────────────────
  useFocusTrap(panelRef, true)



  // ── Track the props — the modal is reused (no remount) when the target file
  // changes, e.g. a rename in this same popup, or reopening File info on a
  // different row while one is already open. Without this, currentPath stays
  // frozen at the first-mounted value and the metadata/history below describe
  // the wrong file. ─────────────────────────────────────────────────────────
  useEffect(() => { setCurrentPath(filePath); setCurrentName(fileName) }, [filePath, fileName])

  useEffect(() => {
    setLog(null); setVersions(null)
    window.electronAPI.getFileLog(currentPath).then(setLog).catch(() => setLog([]))
    window.electronAPI.listFileVersions(currentPath).then(setVersions).catch(() => setVersions([]))
  }, [currentPath])

  // Which version made each entry: compare this file's history with its siblings'
  useEffect(() => {
    setTagged(null)
    if (!log || !versions) return
    let live = true
    Promise.all(versions.map(async v => ({ version: v.version, log: v.path === currentPath ? log : await window.electronAPI.getFileLog(v.path).catch(() => []) })))
      .then(chain => { if (live) setTagged(tagHistory(log, chain)) })
    return () => { live = false }
  }, [log, versions, currentPath])

  useEffect(() => {
    let cancelled = false
    setMeta(null); setError(null)
    ;(async () => {
      try {
        const result = await window.electronAPI.loadMidiFromPath(currentPath)
        if (!result) throw new Error('Could not read file')
        const buffer = base64ToBuffer(result.base64)
        const parsed = parseMidiMetadata(buffer, currentName)
        if (!cancelled) {
          setMeta(parsed)
          setArtistDraft(parsed.artist ?? '')
          setSongDraft(parsed.song ?? '')
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Could not read file')
      }
    })()
    return () => { cancelled = true }
  }, [currentPath, currentName])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!versionsOpen) return
    const handler = (e: MouseEvent) => {
      if (versionsRef.current && !versionsRef.current.contains(e.target as Node)) setVersionsOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [versionsOpen])

  const dirty = !!meta && (artistDraft !== (meta.artist ?? '') || songDraft !== (meta.song ?? ''))
  const swapDrafts = () => { setArtistDraft(songDraft); setSongDraft(artistDraft) }

  // ── Save — the only point that actually touches disk. Artist/Song are
  // staged in local state (and the swap icon just swaps those two staged
  // values) so a run of edits produces one real rename, not one per
  // keystroke or swap click. ─────────────────────────────────────────────
  const handleSaveRename = async () => {
    if (!dirty || saving) return
    const newName = buildRenamedFileName(currentName, artistDraft, songDraft)
    if (!newName) { setError('Song is required'); return }
    if (newName === currentName) return
    setSaving(true)
    try {
      const result = await window.electronAPI.renameLibraryFile(currentPath, newName)
      if (result.ok && result.newPath) {
        onRenamed(currentPath, result.newPath, newName)
        setCurrentPath(result.newPath)
        setCurrentName(newName)
      } else {
        setError(result.reason === 'exists' ? 'A file with that name already exists' : 'Rename failed')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Switch the popup to view a different version — navigation only, never
  // loads the file into the app. Read-only per design: no delete here. ──────
  const openVersion = (v: FileVersion) => {
    setVersionsOpen(false)
    if (v.path === currentPath) return
    setCurrentPath(v.path)
    setCurrentName(v.name)
  }
  const currentVersion = versions?.find(v => v.path === currentPath)
  const currentVersionLabel = currentVersion ? (currentVersion.version === 0 ? 'Original' : `v${currentVersion.version}`) : null

  const rows: { label: string; value: string }[] = meta ? [
    { label: 'Key', value: formatKeyOrDash(meta.key, noteNaming, accidentals) },
    { label: 'BPM', value: String(meta.bpm) },
    { label: 'Time', value: meta.timeSignature },
    { label: 'Tracks', value: String(meta.trackCount) },
    { label: 'Copyright', value: meta.copyright ?? '—' },
  ] : []

  const newest = versions?.reduce((n, v) => Math.max(n, v.version), 0) ?? 0
  const tagColor = (version: number) => (version === 0 ? 'var(--sand)' : version === newest ? 'var(--paint-yellow)' : 'var(--paint-lime)')
  const original = versions?.find(v => v.version === 0)
  const history: (FileLogEvent & { version?: number | null })[] = tagged ?? log ?? []

  const tiles = ['var(--paint-lime)', 'var(--paint-yellow)', 'var(--sand)', 'var(--sand)', 'var(--sand)']

  return createPortal(
    <div className="o-scrim" style={{ zIndex: 99999 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="orfeo-modal-glow app-no-drag theme-paper o-window fi-window"
        style={{ width: 'min(1040px, calc(100vw - 32px))', height: `min(704px, ${MODAL_MAX_HEIGHT})`, boxSizing: 'border-box', ...placed }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div onPointerDown={onDragStart} className="o-window-head fi-head">
          <h2 id={titleId} className="o-title-lg">File info</h2>
          <div className="fi-file">
            <MarqueeText name={currentName} spanStyle={{ fontSize: 'var(--text-sm)', color: 'var(--ui-text-soft)', fontFamily: 'var(--font-code)' }} />
            {versions && versions.length > 1 && (
              <div ref={versionsRef} data-no-drag style={{ position: 'relative', flexShrink: 0 }}>
                <button className="o-btn fi-version" aria-haspopup="menu" aria-expanded={versionsOpen} onClick={() => setVersionsOpen(o => !o)}>
                  {currentVersionLabel ?? '—'} <ChevronDown size={14} style={{ transform: versionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                {versionsOpen && (
                  <div role="menu" className="o-select-list" style={{ left: 'auto', minWidth: 110 }}>
                    {versions.map(v => (
                      <button key={v.path} role="menuitem" className="o-menu-item" aria-current={v.path === currentPath || undefined} onClick={() => openVersion(v)}>
                        {v.version === 0 ? 'Original' : `v${v.version}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button data-no-drag onClick={onClose} aria-label={t`Close`} className="o-close"><X size={18} /></button>
        </div>

        <div className="fi-body">
          <section className="fi-left">
            {error && <div role="alert" style={{ fontSize: 'var(--text-base)', color: 'var(--status-error)' }}>{error}</div>}
            {!meta && !error && <div className="o-note">Reading file…</div>}
            {meta && (
              <>
                {/* Artist/Song are staged here; the real file rename only happens on
                    Save changes, never per keystroke or swap. */}
                <div className="fi-names">
                  <div className="fi-name-fields">
                    <label className="fi-field">Artist
                      <input value={artistDraft} onChange={e => setArtistDraft(e.target.value)} onBlur={() => setArtistDraft(v => v.trim())} />
                    </label>
                    <label className="fi-field">Song
                      <input value={songDraft} onChange={e => setSongDraft(e.target.value)} onBlur={() => setSongDraft(v => v.trim())} />
                    </label>
                  </div>
                  <button className="fi-swap" aria-label={t`Swap artist and song`} onClick={swapDrafts}><ArrowUpDown size={18} strokeWidth={1.8} /></button>
                </div>
                <div className="fi-meta">
                  {rows.map((row, i) => (
                    <div key={row.label} className="fi-meta-tile" title={row.value} style={{ background: tiles[i], gridColumn: row.label === 'Copyright' ? '1 / -1' : undefined }}>
                      <span>{row.label}</span>
                      <span>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="fi-left-actions">
                  <Tooltip
                    title={t`Rebuild tempo`}
                    description={noteEditorActive
                      ? t`Close the Note Editor first.`
                      : t`For songs with the wrong tempo or bar lines.\nPlays from the start so you can tap the beat.\nNothing changes until you press Keep.`}
                    placement="top"
                  >
                    <button className="o-btn" onClick={() => onRebuildTempo(currentPath)} disabled={noteEditorActive}><Timer size={16} strokeWidth={1.8} /> {t`Rebuild tempo`}</button>
                  </Tooltip>
                  <button className="o-btn" onClick={() => window.electronAPI.showItemInFolder(currentPath)}><FolderOpen size={16} strokeWidth={1.8} /> Show in folder</button>
                </div>
              </>
            )}
          </section>

          {meta && (
            <section className="fi-right">
              {/* Orfeo History — real edits (Playback Editor, Note Editor, tempo/key,
                  mixer saves) are embedded in the .mid file as ORFEO_HISTORY text
                  meta-events, so they travel with the file across installs/copies.
                  Renames/moves stay in a local sidecar JSON (electron/main.ts) since
                  they don't rewrite the file's bytes; fileinfo:getLog merges both. */}
              <div className="fi-history">
                <div className="x-label">Edit history <span className="o-note">· saved inside the file</span></div>
                {log === null ? (
                  <div className="o-note">Loading…</div>
                ) : log.length === 0 && (versions?.length ?? 0) <= 1 ? (
                  <div className="o-note">No recorded changes yet.</div>
                ) : (
                  <ol>
                    {[...history].reverse().map((ev, i) => (
                      <li key={i}>
                        {ev.version != null && <span className="o-tag" style={{ background: tagColor(ev.version) }}>{versionLabel(ev.version)}</span>}
                        <span style={{ flex: 1, minWidth: 0 }}>{ev.summary}</span>
                        <span className="o-note fi-when">{formatLogDate(ev.timestamp)} · {formatLogTime(ev.timestamp)}</span>
                      </li>
                    ))}
                    {original && (
                      <li>
                        <span className="o-tag" style={{ background: tagColor(0) }}>{versionLabel(0)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{original.name}</span>
                      </li>
                    )}
                  </ol>
                )}
              </div>

              <div className="theme-studio fi-copy">
                <div className="fi-copy-head">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="x-label" style={{ margin: 0 }}>Copy bars from another version</div>
                    <div className="o-note">{t`For a song with a better copy in your Library. Uses that file's bars and tempo for this one. Nothing changes until you press Keep.`}</div>
                  </div>
                  <Tooltip title={t`Copy bars`} description={noteEditorActive ? t`Close the Note Editor first.` : undefined} placement="top">
                    <button className="o-btn" aria-expanded={otherVersions !== null} onClick={() => { if (otherVersions === null) findVersions(); else setOtherVersions(null) }} disabled={noteEditorActive}>
                      <Copy size={16} strokeWidth={1.8} /> {t`Copy bars`}
                    </button>
                  </Tooltip>
                </div>
                {otherVersions !== null && (
                  <>
                    {otherVersions === 'checking' ? (
                      <div className="o-note">{t`Comparing notes…`}</div>
                    ) : otherVersions.length === 0 ? (
                      <div className="o-note">{t`No other version of this song found in your Library.`}</div>
                    ) : otherVersions.map(v => (
                      <div key={v.name} className="fi-copy-row">
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="fi-copy-name">{v.name}</span>
                          <span className="o-note" style={{ display: 'block' }}>{v.bars} · {t`${Math.round(v.share * 100)}% same notes`}</span>
                        </span>
                        <button className="o-btn-primary" aria-label={t`Copy bars from ${v.name}`} onClick={() => onCopyBars(currentPath, { bytes: v.bytes, name: v.name })}>{t`Copy bars`}</button>
                      </div>
                    ))}
                    {copyNote && <div className="o-note" style={{ color: 'var(--ui-text)' }}>{copyNote}</div>}
                    {otherVersions !== 'checking' && <button className="o-link" style={{ alignSelf: 'flex-start', fontSize: 'var(--text-base)' }} onClick={chooseVersion}>{t`Choose another file…`}</button>}
                  </>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="o-window-actions" style={{ marginTop: 0 }}>
          <span className="o-spacer" />
          <button className="o-btn o-btn-lg" onClick={onClose}>{t`Cancel`}</button>
          <button className="o-btn-primary o-btn-lg" onClick={handleSaveRename} disabled={!dirty || saving}><Save size={16} /> {saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
