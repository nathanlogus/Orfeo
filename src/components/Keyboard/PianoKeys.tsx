// ── The one drawn piano ──────────────────────────────────────────────────────
// Only keys: positions from buildKeyLayoutRatios, the look from piano-keys.css.
// What a key means stays with the caller: keyProps gives it handlers, data
// attributes, a --lit colour, tabindex and children (strips, badges, labels).
// Children here sit over the keys, such as a split line.
import { useMemo, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { buildKeyLayoutRatios, isBlackKey } from '../../utils/keyLayout'
import './piano-keys.css'

export type KeyProps = Omit<HTMLAttributes<HTMLElement>, 'style'> & {
  style?: CSSProperties & { '--lit'?: string }
  [data: `data-${string}`]: unknown
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  min: number
  max: number
  keyProps?: (midi: number, black: boolean) => KeyProps
  children?: ReactNode
  ref?: Ref<HTMLDivElement>
}

export default function PianoKeys({ min, max, className, keyProps, children, ...box }: Props) {
  const layout = useMemo(() => buildKeyLayoutRatios(min, max), [min, max])
  return (
    <div {...box} className={className ? `piano-keys ${className}` : 'piano-keys'}>
      {layout.map(({ x, width }, i) => {
        const midi = min + i
        const black = isBlackKey(midi)
        const Key = black ? 'b' : 'i'
        const { style, ...attrs } = keyProps?.(midi, black) ?? {}
        return <Key key={midi} data-midi={midi} {...attrs} style={{ left: `${x * 100}%`, width: `${width * 100}%`, ...style }} />
      })}
      {children}
    </div>
  )
}
