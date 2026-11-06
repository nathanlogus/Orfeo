import { useEffect } from 'react'

const STEP_MS = 42
const HOP_MS = 300

// ── The scale's notes hop in order across the Explorer display when the key or
// scale changes. Looks only: the notes, the sound and the lit keys are untouched. ─
export function useScaleRipple(scale: string | null) {
  useEffect(() => {
    if (!scale || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const hop = (el: Element, i: number, frames: Keyframe[]) =>
      el.animate(frames, { duration: HOP_MS, delay: i * STEP_MS, easing: 'ease-out' })
    document.querySelectorAll('.xp-scale-line > span > span:not(:empty)').forEach((el, i) =>
      hop(el, i, [{ translate: '0 0' }, { translate: '0 -9px', offset: 0.4 }, { translate: '0 0' }]))
    // The ring draws its notes by pitch, so its order comes from their distance to the home note
    ;[...document.querySelectorAll<SVGElement>('.xp-ring [data-ripple]')]
      .sort((a, b) => Number(a.dataset.ripple) - Number(b.dataset.ripple))
      .forEach((el, i) => hop(el, i, [{ scale: 1 }, { scale: 1.28, offset: 0.4 }, { scale: 1 }]))
  }, [scale])
}
