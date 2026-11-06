// ── The keyboard comes alive: a canvas over the keys, so no note re-renders React ──
// Held keys stay plain DOM marks and never wait for this layer. Here: sparks from what
// the player hits, and a thin line over each key the band is playing, so it can't be
// taken for the chord. The lick's next note is left alone, so its pink stays strongest.
import { onLiveNote } from '../hooks/useMidiInput'

interface Sounding { midi: number; at: number; until: number }
interface Spark { x: number; y: number; rise: number; drift: number; born: number; color: string }

export interface KeyState { scale: Set<number>; target: number | null }

const MAX_SOUNDING = 48
const MAX_SPARKS = 60
const SPARKS_PER_NOTE = 5
const SPARK_MS = 520
const BAND_LINE_PX = 4
const BAND_LINE_GAP_PX = 2
const IN_SCALE = '#b7f000'
const OUTSIDE = '#a9b8ff'    // softer, and never an alarm: nothing here is scored
const BAND = '#35c6ff'

const sounding: Sounding[] = []

/** The band's note, as times on performance.now() */
export function bandPlays(midi: number, at: number, until: number) {
  if (sounding.length === MAX_SOUNDING) sounding.shift()
  sounding.push({ midi, at, until })
}

// Which of the band's notes sound now; those already over leave the list
export function soundingAt(now: number, list: Sounding[] = sounding): Sounding[] {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].until <= now) list.splice(i, 1)
  return list.filter(n => n.at <= now)
}

export function startKeyFx(canvas: HTMLCanvasElement, keys: HTMLElement, read: () => KeyState): () => void {
  const pen = canvas.getContext('2d')!
  const rects = new Map<number, DOMRect>()
  let sparks: Spark[] = []
  let raf = 0
  let keysTop = 0

  const measure = () => {
    const box = canvas.getBoundingClientRect()
    canvas.width = box.width
    canvas.height = box.height
    keysTop = keys.getBoundingClientRect().top - box.top
    rects.clear()
    for (const key of keys.querySelectorAll<HTMLElement>('[data-midi]')) {
      const r = key.getBoundingClientRect()
      rects.set(Number(key.dataset.midi), new DOMRect(r.left - box.left, r.top - box.top, r.width, r.height))
    }
  }
  const resize = new ResizeObserver(measure)
  resize.observe(keys)
  measure()

  const fill = (r: DOMRect, color: string, alpha: number) => {
    pen.globalAlpha = alpha
    pen.fillStyle = color
    pen.fillRect(r.x, r.y, r.width, r.height)
  }

  const stopNotes = onLiveNote(note => {
    const r = rects.get(note)
    if (!r) return
    const { scale } = read()
    const color = scale.has(note % 12) ? IN_SCALE : OUTSIDE
    sparks = sparks.slice(-(MAX_SPARKS - SPARKS_PER_NOTE))
    for (let i = 0; i < SPARKS_PER_NOTE; i++) {
      sparks.push({ x: r.x + r.width * (i + 0.5) / SPARKS_PER_NOTE, y: keysTop, rise: 30 + 14 * ((note + i * 3) % 4), drift: (i - 2) * 3, born: performance.now(), color })
    }
  })

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const state = read()
    pen.clearRect(0, 0, canvas.width, canvas.height)
    for (const n of soundingAt(now)) {
      const r = rects.get(n.midi)
      if (!r || n.midi === state.target) continue
      fill(new DOMRect(r.x, keysTop - BAND_LINE_PX - BAND_LINE_GAP_PX, r.width, BAND_LINE_PX), BAND, Math.min(1, (n.until - now) / 200 + 0.5))
    }
    sparks = sparks.filter(s => now - s.born < SPARK_MS)
    for (const s of sparks) {
      const age = (now - s.born) / SPARK_MS
      pen.globalAlpha = 1 - age
      pen.fillStyle = s.color
      pen.beginPath()
      pen.arc(s.x + s.drift * age, s.y - s.rise * age, 2.5, 0, Math.PI * 2)
      pen.fill()
    }
    pen.globalAlpha = 1
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    resize.disconnect()
    stopNotes()
    pen.clearRect(0, 0, canvas.width, canvas.height)
  }
}
