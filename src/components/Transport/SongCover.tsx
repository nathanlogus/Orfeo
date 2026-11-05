import { useEffect, useState } from 'react'
import { useStore, type SongCoverInfo } from '../../store'
import { buildCards } from '../../utils/songCatalog'
import type { LibraryFile } from '../../types'

// What's known of the open song: from the home page for a server song, else the
// library's own catalog.json. Web links stay out: no network while practising.
export function useSongCover(path: string | undefined): SongCoverInfo | null {
  const fromServer = useStore((s) => (path ? s.songCovers[path] : undefined))
  const libraryFolder = useStore((s) => (s as any).libraryFolder as string | null)
  const [local, setLocal] = useState<SongCoverInfo | null>(null)
  useEffect(() => {
    setLocal(null)
    if (!path || !libraryFolder || fromServer) return
    let current = true
    void window.electronAPI.readSongCatalog(libraryFolder).then(catalog => {
      if (!current) return
      const { art, people } = buildCards([{ name: path, path } as LibraryFile], libraryFolder, catalog)[0]
      setLocal({ art: art?.startsWith('https:') ? null : art, people })
    }).catch(() => {})
    return () => { current = false }
  }, [path, libraryFolder, fromServer])
  return fromServer ?? local
}

// The board's small paper collage stands in for a song with no art
export function SongCoverTile({ art, title }: { art: string | null; title: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  return (
    <div className="pr-cover" role="img" aria-label={`Cover: ${title}`}>
      {art && art !== broken
        ? <img src={art} alt="" decoding="async" onError={() => setBroken(art)} />
        : <><i /><b /></>}
    </div>
  )
}
