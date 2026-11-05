// ── The Folders page and the song menu belong to LibraryPanel, which stays
// mounted so it can open songs. Home reaches them through here. ──────────────
import { create } from 'zustand'

interface FoldersPage {
  open: boolean
  menu: { path: string; x: number; y: number } | null
  // The song that last failed to load from disk or to parse
  failed: string | null
}

export const useFoldersPage = create<FoldersPage>(() => ({ open: false, menu: null, failed: null }))

export const openFolders = (open = true) => useFoldersPage.setState({ open })
export const openSongMenu = (path: string, x: number, y: number) => useFoldersPage.setState({ menu: { path, x, y } })
