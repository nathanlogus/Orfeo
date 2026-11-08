import { useEffect } from 'react'
import { create } from 'zustand'
import { loadLibraryWorkspace, useLibraryWorkspace } from '../utils/libraryWorkspace'
import { base64ToBytes, bytesToBase64, convertForeignFileToMidiBuffer, detectForeignFormat } from '../utils/foreignFormatImport'
import { Midi } from '@tonejs/midi'

export interface InboxCandidate { path: string; name: string; hash: string; title: string; artist: string }
export const useImportInbox = create<{ candidates: InboxCandidate[]; scanning: boolean; error: string; duplicates: number }>(() => ({ candidates: [], scanning: false, error: '', duplicates: 0 }))
const fingerprints = new Map<string, string>()
export async function scanImportInbox() {
  if (useImportInbox.getState().scanning) return
  useImportInbox.setState({ scanning: true, error: '' })
  try {
    const files = await window.electronAPI.scanImportInbox(), candidates: InboxCandidate[] = [], seen = new Set<string>(), dismissed = useLibraryWorkspace.getState().inbox.dismissed
    let duplicates = 0
    for (const f of files) {
      const stamp = `${f.path}|${f.size}|${f.mtime}`
      let hash = fingerprints.get(stamp)
      if (!hash) {
        const loaded = await window.electronAPI.loadMidiFromPath(f.path)
        if (!loaded) continue
        const bytes = base64ToBytes(loaded.base64)
        const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
        hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
        fingerprints.set(stamp, hash)
      }
      if (seen.has(hash) || f.known.includes(hash)) { duplicates++; continue }
      seen.add(hash)
      if (dismissed.includes(hash)) continue
      const name = f.name.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/[-_]+/g, ' ')
      const parts = name.split(/\s+—\s+|\s+-\s+/)
      candidates.push({ path: f.path, name: f.name, hash, title: parts.at(-1) ?? name, artist: parts.length > 1 ? parts[0] : '' })
    }
    useImportInbox.setState({ candidates, duplicates })
  } catch (error) { useImportInbox.setState({ error: String((error as Error).message ?? error) }) }
  finally { useImportInbox.setState({ scanning: false }) }
}
export async function previewInboxSong(candidate: InboxCandidate) {
  const source = await window.electronAPI.loadMidiFromPath(candidate.path)
  if (!source) throw new Error('The source file could not be read.')
  const original = base64ToBytes(source.base64), format = detectForeignFormat(candidate.path)
  const bytes = format ? new Uint8Array(await convertForeignFileToMidiBuffer(original, format)) : original
  const midi = new Midi(bytes)
  const notes = midi.tracks.reduce((sum, t) => sum + t.notes.length, 0)
  if (!notes || !Number.isFinite(midi.duration)) throw new Error('No playable notes were found in this file.')
  let title = candidate.title, artist = candidate.artist
  if (format) {
    const at = await import('@coderline/alphatab'), settings = new at.Settings()
    const score = at.importer.ScoreLoader.loadScoreFromBytes(original, settings)
    if (score.title && !/^(title|untitled|partitura sem t[ií]tulo)$/i.test(score.title)) title = score.title
    if (score.artist) artist = score.artist
    else if (score.music && !/^(composer|compositor)/i.test(score.music)) artist = score.music
  }
  return { midi: bytesToBase64(bytes), title, artist, notes, duration: midi.duration }
}
export function useImportInboxService() {
  const source = useLibraryWorkspace(s => s.inbox.source), target = useLibraryWorkspace(s => s.inbox.target), enabled = useLibraryWorkspace(s => s.inbox.enabled)
  useEffect(() => { void loadLibraryWorkspace() }, [])
  useEffect(() => {
    if (!enabled || !source || !target) return
    void scanImportInbox()
    const timer = setInterval(() => { if (!document.hidden) void scanImportInbox() }, 10000)
    return () => clearInterval(timer)
  }, [source, target, enabled])
}
