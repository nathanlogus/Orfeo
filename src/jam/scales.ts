// ── The scales each style leans on, most useful first ────────────────────────
// The first is the style's default. See "Genre references" in the design brief.
import { t } from '../utils/i18n'
import type { JamStyle } from './band'

const LABELS: Record<string, () => string> = {
  'blues': () => t`Blues scale`,
  'minor pentatonic': () => t`Minor pentatonic`,
  'major pentatonic': () => t`Major pentatonic`,
  'major': () => t`Major scale`,
  'minor': () => t`Natural minor`,
  'harmonic minor': () => t`Harmonic minor`,
  'melodic minor': () => t`Melodic minor`,
  'dorian': () => t`Dorian`,
  'mixolydian': () => t`Mixolydian`,
  'lydian': () => t`Lydian`,
  'lydian dominant': () => t`Lydian dominant`,
  'phrygian': () => t`Phrygian`,
  'bebop': () => t`Bebop dominant`,
}

export const STYLE_SCALES: Record<JamStyle, string[]> = {
  blues: ['blues', 'minor pentatonic', 'mixolydian', 'major pentatonic', 'dorian'],
  jazz: ['major', 'dorian', 'mixolydian', 'bebop', 'melodic minor', 'blues'],
  pop: ['major', 'major pentatonic', 'minor pentatonic', 'minor'],
  rock: ['minor pentatonic', 'blues', 'minor', 'mixolydian', 'dorian'],
  rnb: ['major', 'minor pentatonic', 'dorian', 'major pentatonic'],
  soul: ['major pentatonic', 'minor pentatonic', 'blues', 'mixolydian', 'dorian'],
  funk: ['dorian', 'mixolydian', 'minor pentatonic', 'blues', 'lydian dominant'],
  bossa: ['major', 'dorian', 'mixolydian', 'lydian dominant', 'melodic minor'],
  hiphop: ['minor pentatonic', 'minor', 'dorian', 'harmonic minor', 'phrygian'],
  alternative: ['minor', 'minor pentatonic', 'dorian', 'mixolydian'],
  ballad: ['major', 'major pentatonic', 'minor'],
}

export const scaleLabel = (scale: string) => LABELS[scale]?.() ?? scale

/** The style's scales first, then every other one */
export function scaleOptions(style: JamStyle) {
  const own = STYLE_SCALES[style]
  return [...own, ...Object.keys(LABELS).filter(s => !own.includes(s))].map(value => ({ value, label: scaleLabel(value) }))
}
