// ── Pliage mark: one sheet, one fold ──────────────────────────────────────────
// Folding the bottom corner of a sheet forward draws the P; the flap shows the
// back of the paper. Colours and outlines are the brand kit's, not theme tokens:
// the mark never follows a theme. At 32px and under the small cut keeps the stem.
const INK = '#000000', SUN = '#FFDE3B', PAPER = '#FBF8F5'

// Named for the surface the mark sits on. Sun on sun would lose the fold.
export const BRAND_TONES = {
  paper: { sheet: INK, fold: SUN },
  night: { sheet: PAPER, fold: SUN },
  sun: { sheet: INK, fold: PAPER },
}
export type PliageTone = keyof typeof BRAND_TONES

const FULL = { viewBox: '60 24 136 208', w: 136 / 208, sheet: 'M60,24 L196,24 L196,132 L96,232 L60,232 Z', fold: 'M196,132 L96,232 L96,132 Z' }
const SMALL = { viewBox: '56 28 144 200', w: 144 / 200, sheet: 'M56,28 L200,28 L200,130 L102,228 L56,228 Z', fold: 'M200,130 L102,228 L102,130 Z' }

export default function PliageMark({ height, tone = 'paper', style }: { height: number; tone?: PliageTone; style?: React.CSSProperties }) {
  const cut = height <= 32 ? SMALL : FULL
  const { sheet, fold } = BRAND_TONES[tone]
  return (
    <svg width={Math.round(height * cut.w)} height={height} viewBox={cut.viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" style={style} aria-hidden="true">
      <path d={cut.sheet} fill={sheet} />
      <path d={cut.fold} fill={fold} />
    </svg>
  )
}
