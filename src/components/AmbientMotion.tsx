import { useEffect } from 'react'
import { useStore } from '../store'

// Everything that loops in styles/motion-expressive.css
const AMBIENT = '.o-disc, .o-triangle, .lesson-passed-star, .lib-logo-disc, .pr-rail-home, .pr-cover, .pr-chord, .xp-disc, .xp-cof-centre, .xp-ring, .pr-result-disc'
const SCAN_MS = 1500
const PLAYING_RATE = 0.3
const LEAVE_MS = 190
const DIALOG = '.o-scrim, .pr-result-floor, [role="dialog"]:not(.xp-full)'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const setAmbientRate = (rate: number) => {
  for (const a of document.getAnimations()) {
    if ((a as CSSAnimation).animationName?.startsWith('amb-') && a.playbackRate !== rate) a.updatePlaybackRate(rate)
  }
}

// A closed dialog is gone at once, so nothing waits on it: what animates out is
// an inert copy, and only when no song is playing.
function leaveCopy(node: HTMLElement, parent: Node) {
  const copy = node.cloneNode(true) as HTMLElement
  copy.classList.add('motion-leaving')
  copy.inert = true
  copy.removeAttribute('role')
  copy.querySelectorAll('[role="dialog"]').forEach(d => d.removeAttribute('role'))
  ;(parent.isConnected ? parent : document.body).appendChild(copy)
  window.setTimeout(() => copy.remove(), LEAVE_MS)
}

// ── The ambient loops' context: calm while a song plays, stopped when hidden or
// scrolled away, and the one shared exit for dialogs. Renders nothing. ───────
export default function AmbientMotion() {
  useEffect(() => {
    const root = document.documentElement
    let playing = false

    const unsubscribe = useStore.subscribe(s => {
      const now = s.playbackState === 'playing' || !!s.countIn
      if (now === playing) return
      playing = now
      root.toggleAttribute('data-playing', now)
      setAmbientRate(now ? PLAYING_RATE : 1)
    })

    const onVisibility = () => root.toggleAttribute('data-app-hidden', document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    const seen = new WeakSet<Element>()
    const offscreen = new IntersectionObserver(entries => {
      for (const e of entries) e.target.toggleAttribute('data-offscreen', !e.isIntersecting)
    })
    const scan = () => {
      for (const el of document.querySelectorAll(AMBIENT)) if (!seen.has(el)) { seen.add(el); offscreen.observe(el) }
      if (playing) setAmbientRate(PLAYING_RATE) // shapes that mounted mid-song
    }
    scan()
    const scanTimer = window.setInterval(scan, SCAN_MS)

    const leaving = new MutationObserver(records => {
      if (playing || reducedMotion()) return
      for (const r of records) for (const node of r.removedNodes) {
        if (node instanceof HTMLElement && node.matches(DIALOG) && !node.classList.contains('motion-leaving')) leaveCopy(node, r.target)
      }
    })
    leaving.observe(document.body, { childList: true, subtree: true })

    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(scanTimer)
      offscreen.disconnect()
      leaving.disconnect()
    }
  }, [])
  return null
}
