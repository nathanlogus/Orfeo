// ── The room behind the Jam page, and what you can touch in it ────────────────
// Only the bare room takes pointers: anything on the page answers for itself, and
// nothing here reaches the band.
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { onLiveNote } from '../../hooks/useMidiInput'
import { loadRoom, roomGone, useJam } from '../jamSession'
import { roomFor, type Room } from './roomChoice'
import type { RoomView } from './room'

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const HUD = '.jam-page > *, button, [role="listbox"]'

export default function RoomStage({ children }: { children: ReactNode }) {
  const choice = useJam(s => (s.scenes && s.savedRoom !== undefined ? roomFor(s.savedRoom, s.style) : 'plain'))
  const live = useJam(s => s.live)
  const room: Room | null = choice === 'plain' ? null : choice
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<RoomView | null>(null)
  const left = useRef(false)
  const wanted = useRef(room)
  wanted.current = room
  const [pointing, setPointing] = useState(false)

  useEffect(() => { void loadRoom() }, [])

  useEffect(() => {
    if (!room) { view.current?.clear(); return }
    import('./room')
      .then(({ createRoomView }) => {
        if (left.current || wanted.current !== room) return
        if (!view.current) {
          view.current = createRoomView(host.current!, reducedMotion(), () => useJam.getState(), roomGone)
          view.current.run(useJam.getState().live)
        }
        return view.current.show(room)
      })
      .catch(e => { console.error('[Pliage Jam] room failed to load:', e); roomGone() })
  }, [room])

  useEffect(() => { view.current?.run(live) }, [live])   // Jam stops when the window hides, so this pauses for both
  useEffect(() => onLiveNote((_note, vel) => view.current?.nudge(vel / 127)), [])
  useEffect(() => {
    left.current = false
    return () => { left.current = true; view.current?.dispose(); view.current = null }
  }, [])

  const inRoom = (e: MouseEvent | PointerEvent) => {
    const box = host.current?.getBoundingClientRect()
    if (!room || !box || (e.target as HTMLElement).closest(HUD)) return null
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const onMove = (e: PointerEvent) => {
    const at = e.pointerType === 'mouse' ? inRoom(e) : null
    setPointing(!!at && !!view.current?.hover(at.x, at.y))
  }
  const onClick = (e: MouseEvent) => {
    const at = inRoom(e)
    if (at) view.current?.press(at.x, at.y)
  }

  return (
    <div className="jam-stage" data-room={room ?? undefined} data-pointing={pointing || undefined} onPointerMove={onMove} onClick={onClick}>
      <div ref={host} className="jam-room" aria-hidden />
      <div className="jam-scroll">{children}</div>
    </div>
  )
}
