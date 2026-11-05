import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Fuse from 'fuse.js'
import { confirmDiscardDirtyNoteEdits } from '../../utils/noteEditorState'
import { confirmDialog } from '../../utils/confirmController'
import { ArrowLeft, Eye, FolderOpen, FolderPlus, FileMusic, FileCode2, Guitar, LayoutGrid, MoreHorizontal, RefreshCw, Search, Star, Undo2, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { libraryDisplayName, sortBySong } from '../../utils/libraryNames'
import { SongBrowser } from '../SongBrowser/SongBrowser'
import { TempoWarningDot } from '../Transport/TempoWarning'
import { useTempoTrustScan } from '../../hooks/useTempoTrustScan'
import type { NoteNaming, Accidentals, TranscriptEntry, LibraryFile } from '../../types'
import { moveLastPlayed } from '../../utils/practiceSession'
import { detectForeignFormat, resolveAndTrackImport, base64ToBytes, confirmPendingImportBeforeSwitch } from '../../utils/foreignFormatImport'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import FileInfoModal from '../FileInfoModal'
import { rebuildSongTempo, copyBarsFrom } from '../../utils/tapTempoSession'
import ExportAudioDialog from '../ExportAudioDialog'
import Tooltip from '../Tooltip'
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuLabel } from '../ContextMenu'
import { Switch, UpdateButton, RateButton, DevModeBadge } from '../Settings/controls'
import QuickSettings from '../Settings/QuickSettings'
import { pressUpdateButton, useUpdateState } from '../../hooks/useUpdateCheck'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { openFolders, useFoldersPage } from './foldersPage'

// ── Spin keyframe for transcript loading animation ────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('orfeo-transcript-anim')) {
  const s = document.createElement('style')
  s.id = 'orfeo-transcript-anim'
  s.textContent = '@keyframes orfeo-transcript-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}

// ─── Shared sub-components ──────────────────────────────────────────────────


// ── Section header — icon + uppercase group label row ──────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: 'var(--bg-row)',
      borderTop: '1px solid var(--bg-tile)',
      borderBottom: '1px solid var(--bg-tile)',
    }}>
      <span style={{ color: 'var(--text-inactive)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmest)',
      }}>
        {label}
      </span>
    </div>
  )
}







// ─── Transcript icon — sits in the FileMusic slot; manages its own state ───────
function TranscriptIcon({ filePath, noteNaming, accidentals, addTranscriptEntry, isLoaded, onHoverChange }: {
  filePath: string
  noteNaming: NoteNaming
  accidentals: Accidentals
  addTranscriptEntry: (entry: TranscriptEntry) => void
  isLoaded?: boolean
  // Lets a wrapping RowTooltip suppress its own "Right-click for options" tip
  // while the pointer is over this icon — same pattern as FavouriteStar. ──
  onHoverChange?: (hovering: boolean) => void
}) {
  const IDLE_TOOLTIP = 'Click to create a chord transcript PDF in Orfeo folder.'
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [tooltip, setTooltip] = useState(IDLE_TOOLTIP)
  const revertRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (revertRef.current) clearTimeout(revertRef.current) }, [])

  // ── Trigger generation — stops row click propagation ─────────────────────
  const handleClick = async () => {
    if (state === 'loading') return
    setState('loading')
    setTooltip('Generating…')
    if (revertRef.current) clearTimeout(revertRef.current)
    try {
      const result = await window.electronAPI.transcriptGenerate(filePath, noteNaming, accidentals)
      if (result.success && result.path) {
        setState('success')
        const fname = result.path.split(/[\\/]/).pop() ?? result.path
        setTooltip(`✓ Saved — ${fname}`)
        const today = new Date()
        addTranscriptEntry({
          midiPath: filePath,
          transcriptPath: result.path,
          date: `${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`,
        })
      } else {
        setState('error')
        setTooltip(result.error ?? 'PDF generation failed')
      }
    } catch (err: any) {
      setState('error')
      setTooltip(err?.message ?? 'PDF generation failed')
    }
    revertRef.current = setTimeout(() => {
      setState('idle')
      setTooltip(IDLE_TOOLTIP)
    }, 3000)
  }

  const iconColor = state === 'success' ? 'var(--text-amber)' : state === 'error' ? 'var(--status-error)' : 'var(--text-dimmest)'

  return (
    <Tooltip title={tooltip} oneLine placement="right" wrapperStyle={{ flexShrink: 0 }}>
    <div
      onClick={(e) => { e.stopPropagation(); void handleClick() }}
      className={isLoaded && state === 'idle' ? 'loop-nudge-blink' : undefined}
      style={{
        cursor: state === 'loading' ? 'wait' : 'pointer',
        color: iconColor,
        display: 'flex', alignItems: 'center', flexShrink: 0,
        transition: 'color 0.2s',
        animation: state === 'loading' ? 'orfeo-transcript-spin 1s linear infinite' : 'none',
      }}
      onMouseEnter={e => { onHoverChange?.(true); if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { onHoverChange?.(false); if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmest)' }}
    >
      <FileMusic size={11} strokeWidth={1.5} />
    </div>
    </Tooltip>
  )
}

// ── A song or folder's star: yellow when it's a favourite ──────────────────
function FavouriteStar({ starred, title, onClick }: { starred: boolean; title: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <Tooltip title={title} oneLine wrapperStyle={{ flexShrink: 0 }}>
      <button className="lib-star" aria-pressed={starred} aria-label={title} onClick={onClick}>
        <Star size={20} strokeWidth={1.6} fill={starred ? 'var(--paint-yellow)' : 'none'} aria-hidden />
      </button>
    </Tooltip>
  )
}


// ─── Library Panel ───────────────────────────────────────────────────────────

// Where the file list was scrolled to: survives the page closing
let _libraryScrollTop = 0

const ROOT = '\0root'
const ROW_PAGE = 200 // rows added each time; a whole library at once would stall the page

function LibraryPanel() {
  useTempoTrustScan()
  const pageOpen = useFoldersPage(s => s.open)
  const songMenu = useFoldersPage(s => s.menu)
  const libraryFolder = useStore((s) => s.libraryFolder)
  const libraryFiles = useStore((s) => s.libraryFiles)
  const libraryFavourites = useStore((s) => s.libraryFavourites)
  const setLibraryFiles = useStore((s) => s.setLibraryFiles)
  const setLibraryFolderAndFiles = useStore((s) => s.setLibraryFolderAndFiles)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const hideDemoFolder  = useStore((s) => s.hideDemoFolder)
  const demoFiles       = useStore((s) => s.demoFiles)
  const libraryNeedsRefresh    = useStore((s) => s.libraryNeedsRefresh)
  const setLibraryNeedsRefresh = useStore((s) => s.setLibraryNeedsRefresh)
  const libraryHighlightPath   = useStore((s) => s.libraryHighlightPath)
  // ── Chord Transcription — needed to show per-file transcript icon ─────────
  const chordTranscriptionEnabled = useStore((s) => s.chordTranscriptionEnabled)
  const noteNaming                = useStore((s) => s.noteNaming)
  const accidentals               = useStore((s) => s.accidentals)
  const addTranscriptEntry        = useStore((s) => s.addTranscriptEntry)
  // ── Active-file highlight — reads _filePath private field on parsed midi ──
  const midi              = useStore((s) => s.midi)
  const loadedFilePath    = (midi as any)?._filePath as string | undefined
  // ── Hidden files — client-side exclusion list, no disk change ────────────
  const hiddenLibraryFiles = useStore((s) => s.hiddenLibraryFiles)
  const hideLibraryFile    = useStore((s) => s.hideLibraryFile)
  const unhideLibraryFile  = useStore((s) => s.unhideLibraryFile)
  const showHiddenLibraryFiles    = useStore((s) => s.showHiddenLibraryFiles)
  const setShowHiddenLibraryFiles = useStore((s) => s.setShowHiddenLibraryFiles)
  const librarySongFirst          = useStore((s) => s.librarySongFirst)
  const setLibrarySongFirst       = useStore((s) => s.setLibrarySongFirst)
  const remapLibraryPaths  = useStore((s) => s.remapLibraryPaths)
  const setFavourites      = useStore((s) => s.setFavourites)
  const lastFolderOf       = useStore((s) => s.lastFolderOf)
  const setLastFolderOf    = useStore((s) => s.setLastFolderOf)
  const foldersWithUndo    = useStore((s) => s.foldersWithUndo)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  const [librarySearch, setLibrarySearch] = useState('')
  const [songBrowserOpen, setSongBrowserOpen] = useState(false)
  // The folder on the right: 'all', ROOT, or a folder's name
  const [chosen, setChosen] = useState('all')
  const [rowsShown, setRowsShown] = useState(ROW_PAGE)
  // ── Context menu state — file/multi-select menu (path+x+y) or folder menu (folder+x+y) ──
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const [fileInfoTarget, setFileInfoTarget] = useState<{ path: string; name: string } | null>(null)
  const [exportTarget, setExportTarget] = useState<{ path: string; name: string } | null>(null)
  const exportAudioEnabled = useStore((s) => s.exportAudioEnabled)
  const [folderContextMenu, setFolderContextMenu] = useState<{ folder: string; x: number; y: number } | null>(null)
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)
  const moveRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  useFocusTrap(pageRef, pageOpen)
  // Focus sits on the page, not on Back with a ring around it
  useEffect(() => { if (pageOpen) pageRef.current?.focus() }, [pageOpen])

  // ── Multi-select + folder organization state ──────────────────────────────
  const PROTECTED_FOLDERS = ['demo', 'orfeo']
  const isProtectedFolder = (name: string | null | undefined) => !!name && PROTECTED_FOLDERS.includes(name.toLowerCase())
  // ── Narrower than isProtectedFolder — for FILES, not the folder itself.
  // "Orfeo" isn't one well-known folder: every saved version lands in an
  // "Orfeo" folder next to its source (see electron/main.ts getOrfeoOutputDir),
  // so using the folder-level check here blocked organizing any saved version
  // ever created. Demo is genuinely read-only bundled content and stays
  // blocked; Orfeo is the user's own output and shouldn't be. ────────────────
  const isReadOnlyFolder = (name: string | null | undefined) => !!name && name.toLowerCase() === 'demo'
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [draggingPaths, setDraggingPaths] = useState<string[] | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  // Real subfolder names from disk — includes empty folders, which the file-derived
  // `grouped` list below can't see on its own (it only knows about folders that hold midi files).
  const [libraryFolderNames, setLibraryFolderNames] = useState<string[]>([])
  useEffect(() => {
    if (!libraryFolder) { setLibraryFolderNames([]); return }
    window.electronAPI.listLibraryFolders(libraryFolder).then(setLibraryFolderNames).catch(() => {})
  }, [libraryFolder, libraryFiles])

  // ── Library sidebar drag-and-drop state ───────────────────────────────────
  const [isDragOver, setIsDragOver]   = useState(false)
  const [dropError, setDropError]     = useState<string | null>(null)
  const dropErrorTimer                = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Show a timed error inside the panel, clearing any previous timer ──────
  const showDropError = (msg: string) => {
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
    setDropError(msg)
    dropErrorTimer.current = setTimeout(() => setDropError(null), 2500)
  }

  // ── dragover: prevent browser default + light up the drop zone ────────────
  // Only for real OS file drags (dataTransfer carries a "Files" type) — our own
  // internal row-to-folder drags use "text/plain" and must not trigger this
  // panel-wide overlay, or the whole library flashes an amber border on every
  // internal drag instead of just the target folder.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  // ── dragleave: clear highlight only when pointer leaves the container ──────
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  // ── drop: add file to library — never touches playback state ─────────────
  // Reuses copyMidiToLibrary IPC (collision-safe copy) and getPathForFile
  // from the main-area drop zone implementation. No confirmation modal needed.
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!/\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i.test(file.name)) {
      showDropError('Unsupported file type. Orfeo accepts .mid, .musicxml, .mxl, .gp/.gp5, .cap, and .kar files.')
      return
    }

    const currentLibraryFolder = (useStore.getState() as any).libraryFolder as string | null
    if (!currentLibraryFolder) {
      showDropError('Set a library folder first.')
      return
    }

    const filePath = window.electronAPI.getPathForFile(file)
    const normLib  = currentLibraryFolder.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const normFile = filePath.replace(/\\/g, '/').toLowerCase()
    const isInside = normFile.startsWith(normLib + '/')

    try {
      if (!isInside) {
        await window.electronAPI.copyMidiToLibrary(filePath, currentLibraryFolder)
      }
      const files = await window.electronAPI.scanMidiFolder(currentLibraryFolder)
      setLibraryFiles(files)
    } catch (err) {
      console.error('[Orfeo] library sidebar drop failed:', err)
      showDropError('Could not copy file into library.')
    }
  }

  // ── Close context menu on outside click or Escape ────────────────────────
  useEffect(() => {
    if (!contextMenu && !folderContextMenu && !moveTarget) return
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) setFolderContextMenu(null)
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveTarget(null)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setContextMenu(null); setFolderContextMenu(null); setMoveTarget(null) }
    }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, folderContextMenu, moveTarget])

  // Home's list asks for the same menu
  useEffect(() => {
    if (!songMenu) return
    useFoldersPage.setState({ menu: null })
    setSelectedPaths(new Set([songMenu.path]))
    setContextMenu(songMenu)
  }, [songMenu])

  // Capture phase, like the Song browser: Escape leaves this page and goes no further into the app
  useEffect(() => {
    if (!pageOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || contextMenu || folderContextMenu || moveTarget || renamingFolder || fileInfoTarget || exportTarget || songBrowserOpen) return
      e.stopPropagation()
      openFolders(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pageOpen, contextMenu, folderContextMenu, moveTarget, renamingFolder, fileInfoTarget, exportTarget, songBrowserOpen])

  // ── Open context menu at cursor position for a library file row ───────────
  // Right-clicking a file that isn't part of the current selection replaces the
  // selection with just that file (standard Explorer behavior).
  // The ⋯ buttons pass themselves: a menu under the button, not at the cursor, which a key press doesn't have.
  const menuSpot = (e: React.MouseEvent, anchor?: HTMLElement) => {
    const box = anchor?.getBoundingClientRect()
    return box ? { x: box.left, y: box.bottom } : { x: e.clientX, y: e.clientY }
  }

  const handleContextMenu = (e: React.MouseEvent, filePath: string, anchor?: HTMLElement) => {
    e.preventDefault()
    setSelectedPaths(prev => prev.has(filePath) ? prev : new Set([filePath]))
    setContextMenu({ path: filePath, ...menuSpot(e, anchor) })
  }

  const handleFolderContextMenu = (e: React.MouseEvent, folder: string, anchor?: HTMLElement) => {
    e.preventDefault()
    // Protected folders (Orfeo) still get the menu — just Show in explorer,
    // not Rename/Move/Delete (guarded inside the menu render below).
    setFolderContextMenu({ folder, ...menuSpot(e, anchor) })
  }

  // ── Refresh + remap favourites/hidden after any create/rename/delete/move ──
  const refreshAfterFolderOp = async (pairs?: { oldPath: string; newPath: string }[]) => {
    if (pairs && pairs.length > 0) { remapLibraryPaths(pairs); moveLastPlayed(pairs) }
    if (!libraryFolder) return
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch { /* keep stale list rather than clearing it on a transient scan error */ }
  }

  const handleCreateFolder = async (namePrefill?: string) => {
    if (!libraryFolder) return
    const name = await window.electronAPI.createLibraryFolder(libraryFolder, namePrefill ?? 'New Folder')
    await refreshAfterFolderOp()
    setChosen(name)
    setRenamingFolder(name)
    setRenameDraft(name)
    return name
  }

  const commitFolderRename = async () => {
    const folder = renamingFolder
    const draft = renameDraft.trim()
    setRenamingFolder(null)
    if (!libraryFolder || !folder || !draft || draft === folder) return
    const result = await window.electronAPI.renameLibraryFolder(libraryFolder, folder, draft)
    if (!result.ok) return
    // Renaming a folder changes every contained file's path — remap lastFolderOf's
    // keys (files that live in it) and values (files elsewhere whose recorded undo
    // destination was this folder) to the new name, same for foldersWithUndo, or a
    // rename silently wipes undo state that should last the whole session.
    const pairs = result.pairs ?? []
    const pathRemap = new Map(pairs.map(p => [p.oldPath, p.newPath]))
    const nextLastFolderOf = new Map<string, string | null>()
    for (const [path, prevFolder] of useStore.getState().lastFolderOf) {
      const newPath = pathRemap.get(path) ?? path
      const newPrevFolder = prevFolder === folder ? result.name ?? draft : prevFolder
      nextLastFolderOf.set(newPath, newPrevFolder)
    }
    useStore.getState().setLastFolderOf(nextLastFolderOf)
    const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
    if (nextFoldersWithUndo.has(folder)) { nextFoldersWithUndo.delete(folder); nextFoldersWithUndo.add(result.name ?? draft) }
    useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
    if (chosen === folder) setChosen(result.name ?? draft)
    await refreshAfterFolderOp(pairs)
  }

  const handleDeleteFolder = async (folder: string) => {
    if (!libraryFolder) return
    const result = await window.electronAPI.deleteLibraryFolder(libraryFolder, folder)
    if (!result.ok) return
    // Drop any "undo would send this file back to <folder>" entries — that
    // destination no longer exists, so the undo icon would otherwise keep
    // showing on those (now-root) files for a move that can never succeed.
    const purged = new Map(useStore.getState().lastFolderOf)
    for (const [path, prevFolder] of purged) if (prevFolder === folder) purged.delete(path)
    useStore.getState().setLastFolderOf(purged)
    const purgedFolders = new Set(useStore.getState().foldersWithUndo)
    purgedFolders.delete(folder)
    useStore.getState().setFoldersWithUndo(purgedFolders)
    await refreshAfterFolderOp()
  }

  // ── Move a set of file paths into destFolder (null = library root) ────────
  const moveFilesToFolder = async (paths: string[], destFolder: string | null) => {
    if (!libraryFolder || paths.length === 0) return
    const movable = paths.filter(p => !isReadOnlyFolder(currentFolderOf(p)) && currentFolderOf(p) !== destFolder)
    if (movable.length === 0) return
    const prevFolders = new Map(movable.map(p => [p, currentFolderOf(p)]))
    const pairs = await window.electronAPI.moveLibraryFiles(movable, libraryFolder, destFolder)
    // Read/write via getState() rather than the reactive `lastFolderOf` closure — this
    // function can run several times back-to-back within one handler (folder-level undo),
    // and a stale closure would make each call clobber the previous one's update.
    const nextLastFolderOf = new Map(useStore.getState().lastFolderOf)
    for (const { oldPath, newPath } of pairs) nextLastFolderOf.set(newPath, prevFolders.get(oldPath) ?? null)
    useStore.getState().setLastFolderOf(nextLastFolderOf)
    // ── Folder-level undo flag — tracked directly by name rather than derived by
    // matching file paths against lastFolderOf on every render (which requires the
    // moved file's *new* path to exactly match what the next rescan reports back;
    // this is simpler and can't silently drift out of sync with that). ───────────
    if (destFolder && pairs.length > 0) {
      const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
      nextFoldersWithUndo.add(destFolder)
      useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
    }
    await refreshAfterFolderOp(pairs)
    setSelectedPaths(new Set())
  }

  // ── Undo (or redo, if run twice) the most recent move of a single file ────
  const handleUndoMove = (filePath: string) => {
    const prevFolder = lastFolderOf.get(filePath)
    if (prevFolder === undefined) return
    moveFilesToFolder([filePath], prevFolder)
  }

  // ── Undo every file currently sitting in `folder`, each back to its own
  // recorded previous location (not necessarily all the same place). Falls back
  // to library root for any file missing a specific record — this button only
  // shows when the folder is flagged undo-eligible at all (moved into this
  // session), so every file here got here somehow and root is always a safe,
  // reversible destination even if the exact origin wasn't captured. Grouped by
  // destination and awaited sequentially — moveFilesToFolder reads fresh state
  // via getState() so back-to-back calls don't race each other. ────────────────
  const handleUndoFolder = async (folder: string, filesInFolder: LibraryFile[]) => {
    const byDest = new Map<string | null, string[]>()
    for (const file of filesInFolder) {
      const prevFolder = lastFolderOf.get(file.path) ?? null
      const list = byDest.get(prevFolder) ?? []
      list.push(file.path)
      byDest.set(prevFolder, list)
    }
    for (const [dest, paths] of byDest) await moveFilesToFolder(paths, dest)
    const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
    nextFoldersWithUndo.delete(folder)
    useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
  }

  // ── Bulk-favourite toggle for a folder's contents — stars everything if any
  // file isn't starred yet, otherwise unstars everything (checkbox-style). ───
  const handleToggleFolderFavourites = (filesInFolder: LibraryFile[]) => {
    const paths = filesInFolder.map(f => f.path)
    const allStarred = paths.length > 0 && paths.every(p => libraryFavourites.has(p))
    setFavourites(paths, !allStarred)
  }

  // ── Which library subfolder (name only, null = root) a file path currently lives in ──
  const currentFolderOf = (filePath: string): string | null => {
    if (!libraryFolder) return null
    const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
    const normFile = filePath.replace(/\\/g, '/')
    const rel = normFile.startsWith(normRoot + '/') ? normFile.slice(normRoot.length + 1) : normFile
    const slash = rel.indexOf('/')
    return slash === -1 ? null : rel.slice(0, slash)
  }

  // ── After a save auto-refreshes the library, show the folder holding the new
  // version. It's almost always a just-created Orfeo/ — without this the
  // highlighted file (and its File-info history) is invisible until the user
  // finds and opens that folder by hand. ────────────────────────────────────
  useEffect(() => {
    if (!libraryHighlightPath) return
    const folder = currentFolderOf(libraryHighlightPath)
    if (folder) setChosen(folder)
  }, [libraryHighlightPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row click: plain click loads the file (existing behavior, unchanged) and
  // selects only that row; Ctrl/Cmd toggles it in the selection; Shift selects
  // the range from the last anchor. Modifier clicks never load a file. ────────
  const handleRowClick = (e: React.MouseEvent, filePath: string, orderedPaths: string[]) => {
    e.stopPropagation() // don't let the list-background click-to-clear handler fire right after this
    if (e.shiftKey && selectionAnchor) {
      const ai = orderedPaths.indexOf(selectionAnchor)
      const ci = orderedPaths.indexOf(filePath)
      if (ai !== -1 && ci !== -1) {
        const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai]
        setSelectedPaths(new Set(orderedPaths.slice(lo, hi + 1)))
      }
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths(prev => {
        const next = new Set(prev)
        if (next.has(filePath)) next.delete(filePath); else next.add(filePath)
        return next
      })
      setSelectionAnchor(filePath)
      return
    }
    setSelectedPaths(new Set([filePath]))
    setSelectionAnchor(filePath)
    handleLoadFile(filePath)
  }

  const handleFileDragStart = (e: React.DragEvent, filePath: string) => {
    if (isReadOnlyFolder(currentFolderOf(filePath))) { e.preventDefault(); return }
    const paths = selectedPaths.has(filePath) ? Array.from(selectedPaths) : [filePath]
    if (!selectedPaths.has(filePath)) { setSelectedPaths(new Set([filePath])); setSelectionAnchor(filePath) }
    setDraggingPaths(paths)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', filePath) // OS drag needs a payload even though we read draggingPaths directly
  }

  const handleFolderDrop = async (e: React.DragEvent, folder: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
    const paths = draggingPaths
    setDraggingPaths(null)
    if (!paths || paths.length === 0) return
    await moveFilesToFolder(paths, folder)
  }

  // ── Folder picker — opens Electron folder dialog and scans for MIDI files ─
  const handlePickFolder = async () => {
    try {
      const result = await window.electronAPI.openFolder()
      if (!result) return
      setLoading(true)
      const files = await window.electronAPI.scanMidiFolder(result)
      setLibraryFolderAndFiles(result, files)
      setLoading(false)
    } catch (err) {
      console.error('Failed to scan folder:', err)
      setLoading(false)
    }
  }

  // ── Refresh — re-scans the current folder for new or removed MIDI files ──
  const handleRefresh = async () => {
    if (!libraryFolder) return
    setLoading(true)
    setLibraryNeedsRefresh(false)
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch {}
    setLoading(false)
  }

  // ── File loader — reads MIDI from disk and parses into store state ────────
  // loadRequestIdRef guards against overlapping loads: clicking a second library
  // row before the first file's async chain (confirm dialogs, IPC round-trip,
  // parse) has resolved used to let both run concurrently, with whichever
  // resolved last winning setMidi() regardless of click order — visible as the
  // app appearing to hang with the wrong (or seemingly several) file(s) selected.
  const loadRequestIdRef = useRef(0)
  const handleLoadFile = useCallback(async (filePath: string) => {
    const requestId = ++loadRequestIdRef.current
    const didntOpen = () => {
      useFoldersPage.setState({ failed: filePath })
      showDropError(t`Couldn't open that song.`)
    }
    const canDiscard = await confirmDiscardDirtyNoteEdits('Save changes before opening this file?')
    if (!canDiscard || requestId !== loadRequestIdRef.current) return
    try {
      const proceed = await confirmPendingImportBeforeSwitch(filePath)
      if (!proceed || requestId !== loadRequestIdRef.current) return

      const result = await window.electronAPI.loadMidiFromPath(filePath)
      if (requestId !== loadRequestIdRef.current) return
      if (!result) { didntOpen(); return }

      let base64    = result.base64
      let resolvedFilePath = filePath
      let parseName = result.fileName
      const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null

      try {
        const resolved = await resolveAndTrackImport(filePath, base64, result.fileName, libraryFolder)
        base64 = resolved.base64
        resolvedFilePath = resolved.filePath
        parseName = resolved.fileName
      } catch (e: any) {
        console.error('[Orfeo] Foreign format conversion failed:', e)
        didntOpen()
        return
      }
      if (requestId !== loadRequestIdRef.current) return

      const bytes  = base64ToBytes(base64)
      // _filePath = original source, or the on-disk .mid cache once saved (see resolveAndTrackImport)
      const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, resolvedFilePath)
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
      openFolders(false)
    } catch (err) {
      console.error('Failed to load file:', err)
      didntOpen()
    }
  }, [])

  const songToOpen = useStore(s => s.songToOpen)
  useEffect(() => {
    if (!songToOpen) return
    useStore.setState({ songToOpen: null })
    void handleLoadFile(songToOpen)
  }, [songToOpen, handleLoadFile])

  // File Info's tempo tools work on the open song: close File Info and open
  // that one first. False if a save prompt was declined or it wouldn't open.
  const openForTempo = useCallback(async (path: string): Promise<boolean> => {
    setFileInfoTarget(null)
    const same = (p?: string | null) => !!p && p.replace(/\\/g, '/') === path.replace(/\\/g, '/')
    const loaded = () => same((useStore.getState().midi as any)?._filePath)
    if (loaded()) return true
    await handleLoadFile(path)
    if (!loaded()) return false
    // the engines pick the new song up after this render
    await new Promise(r => setTimeout(r, 200))
    return true
  }, [handleLoadFile])

  // ── Fuzzy search — same Fuse.js convention as ChordExplorer (threshold 0.2,
  // ignoreLocation so a match anywhere in the name counts, not just a prefix).
  // Searches by filename only — that's what "artist/song name" resolves to,
  // since library entries don't carry separate metadata.
  const libraryFuse = useMemo(() => new Fuse([...libraryFiles, ...(libraryFolder ? [] : demoFiles)], {
    keys: ['name'],
    threshold: 0.2,
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
    useExtendedSearch: false,
  }), [libraryFiles, libraryFolder, demoFiles])

  // ── Group files — one entry per subfolder, then the root files ───────────
  // Hidden files are filtered here so the rest of the render sees a clean list.
  type FileGroup = { folder: string | null; files: LibraryFile[] }
  const grouped: FileGroup[] = useMemo(() => {
    const hiddenSet = new Set(hiddenLibraryFiles)
    // When revealed, hidden files stay in the list (dimmed at render time) —
    // otherwise they're excluded here so the rest of the render sees a clean list.
    const isExcluded = (f: LibraryFile) => !showHiddenLibraryFiles && hiddenSet.has(f.path)
    // Search results keep their best-match order; everything else follows the name order
    const inOrder = (files: LibraryFile[]) => (librarySongFirst ? sortBySong(files) : files)

    // No library folder yet: the bundled demos are all there is
    if (!libraryFolder) return hideDemoFolder ? [] : [{ folder: 'Demo', files: inOrder(demoFiles.filter(f => !isExcluded(f))) }]

    const allFiles = libraryFiles.filter((f: LibraryFile) => !isExcluded(f))

    const rootFiles: LibraryFile[] = []
    const folderMap = new Map<string, LibraryFile[]>()

    for (const file of allFiles) {
      if (!libraryFolder) { rootFiles.push(file); continue }
      const normFile = file.path.replace(/\\/g, '/')
      const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
      const rel = normFile.startsWith(normRoot)
        ? normFile.slice(normRoot.length).replace(/^\//, '')
        : file.name
      const parts = rel.split('/')
      if (parts.length <= 1) {
        rootFiles.push(file)
      } else {
        const folder = parts[0]
        if (!folderMap.has(folder)) folderMap.set(folder, [])
        folderMap.get(folder)!.push(file)
      }
    }

    // ── Include empty folders too (no midi files yet), so a freshly-created or
    // pre-existing-on-disk empty folder still gets a row to drop files into ──
    for (const name of libraryFolderNames) if (!folderMap.has(name)) folderMap.set(name, [])

    // Folders first, then root files — root stays in natural (alphabetical, since
    // scanMidiFolder already sorts that way) order regardless of favourite status.
    // Starred-first grouping only applies inside the dedicated "starred" filter tab.
    const result: FileGroup[] = []

    // ── Sort folders: Orfeo always topmost, Demo pinned next, rest alphabetical ──
    Array.from(folderMap.entries())
      .sort((a, b) => {
        if (a[0].toLowerCase() === 'orfeo') return -1
        if (b[0].toLowerCase() === 'orfeo') return 1
        if (a[0].toLowerCase() === 'demo') return -1
        if (b[0].toLowerCase() === 'demo') return 1
        return a[0].localeCompare(b[0])
      })
      .forEach(([folder, files]) => result.push({ folder, files: inOrder(files) }))

    // Root files at the bottom
    result.push({ folder: null, files: inOrder(rootFiles) })

    return result
  }, [libraryFiles, demoFiles, libraryFolder, hiddenLibraryFiles, showHiddenLibraryFiles, hideDemoFolder, libraryFolderNames, librarySongFirst])

  // ── What the page shows: one folder or all of them, then the favourites
  // and search on top. Search always reaches the whole library. ─────────────
  const shownGroups = useMemo(() => grouped.filter(g => !(hideDemoFolder && g.folder?.toLowerCase() === 'demo')), [grouped, hideDemoFolder])
  const allFiles = useMemo(() => {
    const files = shownGroups.flatMap(g => g.files)
    return librarySongFirst ? sortBySong(files) : files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  }, [shownGroups, librarySongFirst])
  const query = librarySearch.trim()
  const chosenGroup = shownGroups.find(g => (g.folder ?? ROOT) === chosen)
  const shownFiles = useMemo(() => {
    const inView = query || !chosenGroup ? allFiles : chosenGroup.files
    const starred = filter === 'starred' ? inView.filter(f => libraryFavourites.has(f.path)) : inView
    if (!query) return starred
    const keep = new Set(starred.map(f => f.path))
    return libraryFuse.search(query).map(r => r.item).filter(f => keep.has(f.path))
  }, [query, chosenGroup, allFiles, filter, libraryFavourites, libraryFuse])
  useEffect(() => setRowsShown(ROW_PAGE), [chosen, filter, query])
  const visibleFilePaths = useMemo(() => shownFiles.slice(0, rowsShown).map(f => f.path), [shownFiles, rowsShown])

  const realFolders = libraryFolderNames.filter(f => !isProtectedFolder(f)).sort((a, b) => a.localeCompare(b))
  const folderIsEmpty = (folder: string) => (grouped.find(g => g.folder === folder)?.files.length ?? 0) === 0

  // ── The loaded file, pinned above the list when it's outside what's shown ──
  const loadedFile = loadedFilePath
    ? libraryFiles.find(f => f.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/'))
    : undefined

  // ── Back to where the list was when the page opens again ──────────────────
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (pageOpen && listRef.current) listRef.current.scrollTop = _libraryScrollTop
  }, [pageOpen])

  const chosenName = !chosenGroup ? t`All songs` : chosenGroup.folder ?? t`Library root`
  const chosenFolder = chosenGroup?.folder ?? null
  const songCount = shownFiles.length === 1 ? t`1 song` : `${shownFiles.length.toLocaleString()} ${t`songs`}`
  const nameSample = libraryFiles.find(f => f.name.includes(' - '))
  const moveName = moveTarget?.length === 1 ? (libraryFiles.find(f => f.path === moveTarget[0])?.name ?? moveTarget[0].split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '') : ''

  const fileRow = (file: LibraryFile) => {
    const starred = libraryFavourites.has(file.path)
    const isLoaded = !!loadedFilePath && file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
    const isHidden = hiddenLibraryFiles.includes(file.path)
    // Briefly highlighted right after an auto-refreshed save (see notifyLibrarySaved in store/index.ts)
    const isJustSaved = !!libraryHighlightPath && file.path.replace(/\\/g, '/') === libraryHighlightPath.replace(/\\/g, '/')
    const fmt = detectForeignFormat(file.path)
    const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
    const name = libraryDisplayName(file.name, librarySongFirst)
    const undoTo = lastFolderOf.get(file.path)
    return (
      <div
        key={file.path}
        className={`lib-file${isJustSaved ? ' loop-nudge-blink' : ''}`}
        data-loaded={isLoaded || undefined}
        data-selected={(selectedPaths.has(file.path) && selectedPaths.size >= 2) || undefined}
        data-hidden={isHidden || undefined}
        draggable={!!libraryFolder && !isReadOnlyFolder(currentFolderOf(file.path))}
        onDragStart={e => handleFileDragStart(e, file.path)}
        onDragEnd={() => setDraggingPaths(null)}
        onClick={e => handleRowClick(e, file.path, visibleFilePaths)}
        onContextMenu={e => handleContextMenu(e, file.path)}
      >
        <FavouriteStar starred={starred} title={starred ? 'Remove from favourites' : 'Add to favourites'} onClick={e => { e.stopPropagation(); toggleFavourite(file.path) }} />
        {/* The icon doubles as the transcript trigger when transcription is on */}
        {chordTranscriptionEnabled
          ? <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} isLoaded={isLoaded || isJustSaved} />
          : <RowIcon size={15} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden />}
        <button className="lib-file-name">{name}{isHidden ? ` (${t`hidden`})` : ''}</button>
        {undoTo !== undefined && <Tooltip title={`Move back to ${undoTo ?? 'library root'}`} oneLine wrapperStyle={{ flexShrink: 0 }}>
          <button className="o-icon-quiet lib-file-btn" aria-label={`Move back to ${undoTo ?? 'library root'}`} onClick={e => { e.stopPropagation(); handleUndoMove(file.path) }}><Undo2 size={16} /></button>
        </Tooltip>}
        <TempoWarningDot path={file.path} />
        <span className="lib-file-path">{file.name}</span>
        <button className="o-icon-quiet lib-file-btn" aria-label={t`More for ${name}`} onClick={e => { e.stopPropagation(); handleContextMenu(e, file.path, e.currentTarget) }}><MoreHorizontal size={18} /></button>
      </div>
    )
  }

  const folderRow = (group: FileGroup) => {
    const folder = group.folder
    const key = folder ?? ROOT
    const name = folder ?? t`Library root`
    const protectedFolder = isProtectedFolder(folder)
    const hover = dragOverFolder === key
    if (renamingFolder === folder && folder) return (
      <input
        key={key}
        className="lib-folder-rename"
        autoFocus
        aria-label={t`Folder name`}
        value={renameDraft}
        onChange={e => setRenameDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={commitFolderRename}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setRenamingFolder(null)
        }}
      />
    )
    return (
      <button
        key={key}
        className="lib-folder"
        aria-current={chosen === key || undefined}
        data-drop={hover ? (protectedFolder ? 'no' : 'yes') : undefined}
        onClick={() => setChosen(key)}
        onContextMenu={e => folder && handleFolderContextMenu(e, folder)}
        onDragOver={e => {
          setDragOverFolder(key)
          if (!protectedFolder) e.preventDefault() // protected: no preventDefault, so the OS shows its own "no drop" cursor
        }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolder(null) }}
        onDrop={e => !protectedFolder && handleFolderDrop(e, folder)}
      >
        <FolderOpen size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
        <span className="lib-ellipsis" style={{ flex: 1 }}>{name}</span>
        {/* Live drag feedback: tooltips don't reliably show mid-drag */}
        <span className="lib-folder-count">{hover && draggingPaths ? (protectedFolder ? t`Can't move to system folder` : t`Move to ${name}`) : group.files.length}</span>
      </button>
    )
  }

  return createPortal(
    <>
      {pageOpen && <div ref={pageRef} role="dialog" aria-modal="true" aria-label={t`Folders`} className="theme-paper lib-folders">
        <aside className="lib-folders-aside touch-hit">
          <div className="lib-folders-top">
            <button className="o-icon-btn" aria-label={t`Back`} onClick={() => openFolders(false)}><ArrowLeft size={16} /></button>
            <h1 className="o-title">{t`Folders`}</h1>
            {libraryFolder && <div className="lib-folders-tools">
              <Tooltip title={t`New folder`} oneLine><button aria-label={t`New folder`} onClick={() => void handleCreateFolder()}><FolderPlus size={18} /></button></Tooltip>
              <Tooltip title={libraryNeedsRefresh ? t`A file was saved: refresh the library` : t`Refresh library`} oneLine>
                <button aria-label={t`Refresh library`} className={libraryNeedsRefresh ? 'loop-nudge-blink' : undefined} onClick={handleRefresh}>
                  <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </Tooltip>
              <Tooltip title={showHiddenLibraryFiles ? t`Hide hidden files` : t`Show hidden files`} oneLine>
                <button aria-label={showHiddenLibraryFiles ? t`Hide hidden files` : t`Show hidden files`} aria-pressed={showHiddenLibraryFiles} onClick={() => setShowHiddenLibraryFiles(!showHiddenLibraryFiles)}><Eye size={18} /></button>
              </Tooltip>
            </div>}
          </div>

          {/* Click opens the folder itself: the picker below never shows its files */}
          {libraryFolder && <Tooltip title={libraryFolder} oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
            <button className="library-path" onClick={() => window.electronAPI.openFolderInExplorer(libraryFolder)}>
              {libraryFolder.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join(' › ')}
            </button>
          </Tooltip>}

          <nav aria-label={t`Folders`} className="lib-folders-nav">
            <button className="lib-folder" aria-current={!chosenGroup || undefined} onClick={() => setChosen('all')}>
              <FolderOpen size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
              <span className="lib-ellipsis" style={{ flex: 1 }}>{t`All songs`}</span>
              <span className="lib-folder-count">{allFiles.length}</span>
            </button>
            {shownGroups.filter(g => g.folder || g.files.length > 0 || draggingPaths).map(folderRow)}
          </nav>

          {chosenFolder && !isProtectedFolder(chosenFolder) && chosenGroup!.files.length > 0 && (() => {
            const allStarred = chosenGroup!.files.every(f => libraryFavourites.has(f.path))
            return <button className="o-btn lib-folders-action" onClick={() => handleToggleFolderFavourites(chosenGroup!.files)}>
              <Star size={16} strokeWidth={1.8} fill={allStarred ? 'currentColor' : 'none'} aria-hidden />
              <span className="lib-ellipsis">{allStarred ? t`Unstar every song in ${chosenFolder}` : t`Star every song in ${chosenFolder}`}</span>
            </button>
          })()}
          {chosenFolder && !isProtectedFolder(chosenFolder) && foldersWithUndo.has(chosenFolder) && (
            <button className="o-btn lib-folders-action" onClick={() => void handleUndoFolder(chosenFolder, chosenGroup!.files)}><Undo2 size={16} aria-hidden />{t`Undo the moves into this folder`}</button>
          )}

          <span className="o-spacer" />
          <div className="lib-folders-names">
            <span className="lib-folders-names-text">
              <span>{t`Show artist first`}</span>
              {nameSample && <span className="o-note lib-ellipsis">{`“${libraryDisplayName(nameSample.name, librarySongFirst)}”`}</span>}
            </span>
            <Switch value={!librarySongFirst} onChange={on => setLibrarySongFirst(!on)} label={t`Show artist first`} />
          </div>
          <button className={libraryFolder ? 'o-btn o-btn-lg' : 'o-btn-primary o-btn-lg'} onClick={handlePickFolder}>{libraryFolder ? t`Change song folder` : t`Choose your song folder`}</button>
        </aside>

        <main className="lib-folders-main" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => setSelectedPaths(new Set())}>
          <div className="lib-folders-head">
            <h2 className="lib-folders-title">{query ? t`Search` : chosenName}</h2>
            {chosenFolder && libraryFolder && <button className="o-icon-btn" aria-label={t`More for ${chosenFolder}`} onClick={e => handleFolderContextMenu(e, chosenFolder, e.currentTarget)}><MoreHorizontal size={18} /></button>}
            <div role="group" aria-label={t`Show`} className="o-seg">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t`All`}</button>
              <button aria-pressed={filter === 'starred'} onClick={() => setFilter('starred')}>{`★ ${t`Favourites`}`}</button>
            </div>
          </div>
          <div className="lib-folders-bar">
            <label className="o-field lib-search">
              <Search size={15} aria-hidden style={{ flexShrink: 0 }} />
              <input type="text" value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} placeholder={t`Search your library`} aria-label={t`Search your library`} />
              {librarySearch && <button onClick={() => setLibrarySearch('')} aria-label={t`Clear search`}><X size={14} /></button>}
            </label>
            <span aria-live="polite" className="lib-folders-count">{songCount}</span>
            <span className="o-spacer" />
            {libraryFolder && <button className="o-btn" onClick={() => setSongBrowserOpen(true)}><LayoutGrid size={15} strokeWidth={1.5} aria-hidden />{t`Browse songs`}</button>}
          </div>

          <div ref={listRef} className="lib-folders-scroll" onScroll={e => { _libraryScrollTop = e.currentTarget.scrollTop; setContextMenu(null) }}>
            {loadedFile && !visibleFilePaths.includes(loadedFile.path) && <div className="lib-list lib-folders-pinned">{fileRow(loadedFile)}</div>}
            {shownFiles.length > 0 && <div className="lib-list">{shownFiles.slice(0, rowsShown).map(fileRow)}</div>}
            {shownFiles.length === 0 && <div className="lib-empty">
              <span className="lib-empty-title">{query ? t`No songs found.` : filter === 'starred' ? t`No starred songs yet.` : t`No songs here yet.`}</span>
              <span className="o-note">{query ? t`Nothing in your library matches “${query}”.` : filter === 'starred' ? t`Tap the star on any song to keep it here.` : libraryFolder ? t`Drag songs into this folder, or use a song's menu to move it.` : t`Choose your song folder to see your songs.`}</span>
            </div>}
            {shownFiles.length > rowsShown && <button className="o-btn lib-more" onClick={() => setRowsShown(n => n + ROW_PAGE)}>{t`Show more`}</button>}
          </div>

          {/* OS file drag: a drop anywhere here adds the song */}
          {isDragOver && <div className="lib-folders-drop" />}
          {dropError && <div role="alert" className="o-toast"><span className="o-dot o-dot-alert" />{dropError}</div>}
        </main>
      </div>}

      {songBrowserOpen && (
        <SongBrowser
          onClose={() => setSongBrowserOpen(false)}
          onOpen={path => { setSongBrowserOpen(false); void handleLoadFile(path) }}
        />
      )}

      {/* ── The song menu, for a right-click or the ⋯ button, here or on Home's list ── */}
      {contextMenu && (() => {
        // Organize actions show unless EVERY selected file is read-only (Demo)
        const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path])
        const canOrganize = !!libraryFolder && !moveSet.every(p => isReadOnlyFolder(currentFolderOf(p)))
        const starred = libraryFavourites.has(contextMenu.path)
        return (
        <ContextMenu ref={menuRef} x={contextMenu.x} y={contextMenu.y} ariaLabel="File actions">
          <ContextMenuItem onClick={() => { toggleFavourite(contextMenu.path); setContextMenu(null) }}>
            {starred ? 'Remove from favourites' : 'Add to favourites'}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const path = contextMenu.path
              const name = libraryFiles.find(f => f.path === path)?.name ?? path.split(/[\\/]/).pop() ?? path
              setFileInfoTarget({ path, name })
              setContextMenu(null)
            }}
          >
            File info
          </ContextMenuItem>
          <ContextMenuItem onClick={() => { window.electronAPI.showItemInFolder(contextMenu.path); setContextMenu(null) }}>
            Show in folder
          </ContextMenuItem>

          {hiddenLibraryFiles.includes(contextMenu.path) ? (
            <ContextMenuItem onClick={() => { unhideLibraryFile(contextMenu.path); setContextMenu(null) }}>
              Unhide
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => { hideLibraryFile(contextMenu.path); setContextMenu(null) }}>
              Hide from library
            </ContextMenuItem>
          )}

          {lastFolderOf.has(contextMenu.path) && (
            <ContextMenuItem onClick={() => { const path = contextMenu.path; setContextMenu(null); handleUndoMove(path) }}>
              Undo move
            </ContextMenuItem>
          )}

          {exportAudioEnabled && (
            <ContextMenuItem
              onClick={() => {
                const path = contextMenu.path
                // either separator: a Windows path in one piece would otherwise
                // become part of the export's file name
                const name = libraryFiles.find(f => f.path === path)?.name ?? path.split(/[\\/]/).pop() ?? path
                // the song's name without its file extension (.mid, .gp5, .musicxml…)
                setExportTarget({ path, name: name.replace(/\.[^.\\/]+$/, '') })
                setContextMenu(null)
              }}
            >
              {t`Export to audio`}
            </ContextMenuItem>
          )}

          {/* A mixed selection still shows this: the move backend skips protected-folder
              files one by one (fs:moveLibraryFiles in main.ts) */}
          {canOrganize && <>
            <ContextMenuDivider />
            <ContextMenuItem onClick={() => { setContextMenu(null); setMoveTarget(moveSet) }}>{t`Move to folder…`}</ContextMenuItem>
          </>}
        </ContextMenu>
        )
      })()}

      {/* ── Folder menu — Rename / Move selection here / Delete ── */}
      {folderContextMenu && (
        <ContextMenu ref={folderMenuRef} x={folderContextMenu.x} y={folderContextMenu.y} minWidth={180} ariaLabel="Folder actions">
          <ContextMenuItem
            onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); if (libraryFolder) window.electronAPI.openFolderInExplorer(`${libraryFolder}/${folder}`) }}
          >
            Show in folder
          </ContextMenuItem>
          {!isProtectedFolder(folderContextMenu.folder) && (<>
            <ContextMenuItem
              onClick={() => { setRenamingFolder(folderContextMenu.folder); setRenameDraft(folderContextMenu.folder); setFolderContextMenu(null) }}
            >
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); moveFilesToFolder(Array.from(selectedPaths), folder) }}
              disabled={selectedPaths.size === 0}
            >
              Move {selectedPaths.size || ''} selected files here
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); handleDeleteFolder(folder) }}
              disabled={!folderIsEmpty(folderContextMenu.folder)}
              danger
            >
              Delete
            </ContextMenuItem>
          </>)}
        </ContextMenu>
      )}

      {moveTarget && <div ref={moveRef} role="dialog" aria-labelledby="lib-move-title" className="orfeo-modal-glow theme-studio lib-move">
        <div className="lib-move-head">
          <span id="lib-move-title" className="lib-ellipsis">{moveName ? t`Move “${moveName}” to` : t`Move ${moveTarget.length} songs to`}</span>
          <button className="o-close" aria-label={t`Close`} onClick={() => setMoveTarget(null)}><X size={18} /></button>
        </div>
        <div className="lib-move-list">
          {realFolders.map(folder => (
            <button key={folder} className="lib-move-item" onClick={() => { const paths = moveTarget; setMoveTarget(null); void moveFilesToFolder(paths, folder) }}>
              <FolderOpen size={16} strokeWidth={1.8} aria-hidden /><span className="lib-ellipsis">{folder}</span>
            </button>
          ))}
          <button className="lib-move-item" onClick={() => { const paths = moveTarget; setMoveTarget(null); void moveFilesToFolder(paths, null) }}>
            <FolderOpen size={16} strokeWidth={1.8} aria-hidden />Library root
          </button>
        </div>
        <button
          className="lib-move-item lib-move-new"
          onClick={async () => {
            const paths = moveTarget
            setMoveTarget(null)
            openFolders()
            const name = await handleCreateFolder()
            if (name) await moveFilesToFolder(paths, name)
          }}
        >{`+ ${t`New folder…`}`}</button>
      </div>}

      {exportTarget && <ExportAudioDialog path={exportTarget.path} name={exportTarget.name} onClose={() => setExportTarget(null)} />}
      {fileInfoTarget && (
        <FileInfoModal
          filePath={fileInfoTarget.path}
          fileName={fileInfoTarget.name}
          onClose={() => setFileInfoTarget(null)}
          onRebuildTempo={async (path) => { if (await openForTempo(path)) rebuildSongTempo() }}
          onCopyBars={async (path, source) => {
            if (await openForTempo(path)) copyBarsFrom(source.bytes.slice().buffer as ArrayBuffer, source.name)
          }}
          onRenamed={(oldPath, newPath, newName) => {
            setLibraryFiles(libraryFiles.map(f => f.path === oldPath ? { path: newPath, name: newName } : f))
            remapLibraryPaths([{ oldPath, newPath }])
            moveLastPlayed([{ oldPath, newPath }])
            // Currently-loaded file got renamed underneath it — patch the store's
            // in-memory path/name so a subsequent Playback Editor save resolves
            // against the new location instead of a path that no longer exists.
            if (loadedFilePath && loadedFilePath.replace(/\\/g, '/') === oldPath.replace(/\\/g, '/')) {
              useStore.setState(s => s.midi ? { midi: { ...(s.midi as any), _filePath: newPath, fileName: newName } } : {})
            }
            setFileInfoTarget({ path: newPath, name: newName })
          }}
        />
      )}
    </>,
    document.body,
  )
}


// ─── Settings Panel ──────────────────────────────────────────────────────────

export default function SettingsPanel() {
  // ── Update check, app zoom, sound sets: shared with the Settings window ──
  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const close = () => setSettingsPanelOpen(false)
  const newVersion = useUpdateState((s) => (s.status.state === 'available' || s.status.state === 'ready' ? s.status.version : undefined))

  // Closed, it only hides: the Library stays mounted from startup, with its
  // search and folder state.
  return (
    <>
      {settingsPanelOpen && <div className="pr-setup-scrim" onClick={close} />}
      <aside className="pr-setup theme-paper touch-hit" aria-label={t`Setup`} hidden={!settingsPanelOpen}>
        <div className="pr-setup-head">
          <div>
            <h2>{t`Setup`}</h2>
            <span className="o-note" style={{ fontSize: 15 }}>{t`The everyday switches, without leaving the song.`}</span>
          </div>
          <button className="o-close" aria-label={t`Close`} onClick={close}><X size={18} strokeWidth={2} /></button>
        </div>

        <button className="o-btn o-btn-lg" style={{ flexShrink: 0 }} onClick={() => { close(); openFolders() }}><FolderOpen size={16} aria-hidden />{t`Library folders`}</button>

        <div className="pr-setup-body">
          <LibraryPanel />
          <div className="pr-setup-card touch-settings"><QuickSettings /></div>
        </div>

        {newVersion && (
          <div role="status" className="pr-update-card">
            <span><span className="pr-update-title">{t`Orfeo ${newVersion} is out`}</span>{t`Your songs and settings stay as they are.`}</span>
            <button className="pr-setup-black" onClick={pressUpdateButton}>{t`Get it`}</button>
          </div>
        )}

        <div className="pr-setup-foot">
          <button className="pr-setup-black" onClick={() => useStore.getState().openSettingsWindow()}>{t`All settings`}</button>
          <button className="o-btn o-btn-lg" style={{ height: 'var(--control-h-lg)' }} onClick={() => window.electronAPI.openExternal('https://orfeo.cc/docs')}>{t`User manual`}</button>
        </div>
        <div className="pr-setup-meta touch-big">
          <DevModeBadge />
          <RateButton />
          <UpdateButton />
          <span className="o-spacer" />
          <button className="o-link" onClick={() => setActiveTab(activeTab === 'settings' ? 'library' : 'settings')}>{activeTab === 'settings' ? t`Library` : t`Setup`}</button>
        </div>
      </aside>
    </>
  )
}
