// ── The room behind the Jam page, and the paper panel that keeps the page legible ──
import { useEffect, useRef, type ReactNode } from 'react'
import { loadRoom, roomGone, useJam } from '../jamSession'
import { roomFor, type Room } from './roomChoice'

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
type Opened = NonNullable<Awaited<ReturnType<typeof import('./room').openRoom>>>

export default function RoomStage({ children }: { children: ReactNode }) {
  const choice = useJam(s => (s.scenes && s.savedRoom !== undefined ? roomFor(s.savedRoom, s.style) : 'plain'))
  const live = useJam(s => s.live)
  const room: Room | null = choice === 'plain' ? null : choice
  const host = useRef<HTMLDivElement>(null)
  const opened = useRef<Opened | null>(null)

  useEffect(() => { void loadRoom() }, [])

  useEffect(() => {
    if (!room) return
    const closing = new AbortController()
    let mine: Opened | null = null
    import('./room')
      .then(({ openRoom }) => openRoom(host.current!, room, reducedMotion(), closing.signal, () => useJam.getState(), roomGone))
      .then(r => {
        if (!r) return
        mine = opened.current = r
        r.run(useJam.getState().live)
      })
      .catch(e => { console.error('[Pliage Jam] room failed to load:', e); roomGone() })
    return () => {
      closing.abort()
      mine?.dispose()
      opened.current = null
    }
  }, [room])

  // Jam stops when the window hides, so this pauses for both
  useEffect(() => opened.current?.run(live), [live])

  return (
    <div className="jam-stage" data-room={room ?? undefined}>
      {room && <div ref={host} className="jam-room" aria-hidden />}
      <div className="jam-scroll">{children}</div>
    </div>
  )
}
