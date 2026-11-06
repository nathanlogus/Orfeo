// ── The keyboard comes alive: a canvas over the keys, so no note re-renders React ──
// Held keys stay plain DOM marks and never wait for this layer. Here: sparks from what
// the player hits, the scale breathing on the beat, a sweep of chord tones when the
// chord changes, and the band's own notes. The lick's next note is left alone, so its
// pink stays the strongest thing on the keyboard.
import { onLiveNote } from '../hooks/useMidiInput'

interface Sounding { midi: number; at: number; until: number }
interface Spark { x: number; y: number; rise: number; drift: number; born: number; color: string }

export interface KeyState { beat: number; scale: Set<number>; rootPc: number; tones: Set<number>; target: number | null }

const MAX_SOUNDING = 48
const MAX_SPARKS = 60
const SPARKS_PER_NOTE = 5
const SPARK_MS = 520
const BREATH_MS = 260
const SWEEP_MS = 420
const SWEEP_SPREAD_MS = 200  // left to right across the keyboard
const BLACK_KEY_DEPTH = 0.6
const IN_SCALE = '#b7f000'
const OUTSIDE = '#a9b8ff'    // softer, and never an alarm: nothing here is scored
const BAND = '#35c6ff'
const SWEEP = '#ffffff'
const BREATH = '#ffffff'

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
  let beat = -1
  let beatAt = 0
  let chord = ''
  let chordAt = -Infinity
  let keysTop = 0

  const measure = () => {
    const box = canvas.getBoundingClientRect()
    canvas.width = box.width
    canvas.height = box.height
    keysTop = keys.getBoundingClientRect().top - box.top
    rects.clear()
    for (const key of keys.querySelectorAll<HTMLElement>('[data-midi]')) {
      const r = key.getBoundingClientRect()
      // A white key lights only below the black keys, which it would otherwise paint over
      const under = key.tagName === 'I' ? r.height * BLACK_KEY_DEPTH : 0
      rects.set(Number(key.dataset.midi), new DOMRect(r.left - box.left, r.top - box.top + under, r.width, r.height - under))
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
    if (state.beat !== beat) { beat = state.beat; beatAt = now }
    const tones = [...state.tones].sort().join()
    if (tones !== chord) { chord = tones; chordAt = now }

    pen.clearRect(0, 0, canvas.width, canvas.height)
    const breath = Math.exp(-(now - beatAt) / BREATH_MS)
    for (const [midi, r] of rects) {
      if (midi === state.target) continue
      const pc = midi % 12
      if (state.scale.has(pc)) fill(r, BREATH, breath * (pc === state.rootPc ? 0.42 : 0.2))
      if (state.tones.has(pc)) {
        const age = now - chordAt - SWEEP_SPREAD_MS * r.x / canvas.width
        if (age > 0 && age < SWEEP_MS * 3) fill(r, SWEEP, 0.75 * Math.exp(-age / SWEEP_MS))
      }
    }
    for (const n of soundingAt(now)) {
      const r = rects.get(n.midi)
      if (r && n.midi !== state.target) fill(r, BAND, 0.5 * Math.min(1, (n.until - now) / 200 + 0.4))
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
