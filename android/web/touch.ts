// ── A finger, as the mouse the app was built for ─────────────────────────────
// Knobs, faders and tooltips all listen for mouse events, but a browser only
// sends those after a tap has ended, and it never ends the hover it starts. So
// a drag does nothing and tooltips stay open. Here a press is a mouse press as
// it happens, and holding still is what hovering was, so a tooltip shows while
// the finger rests and leaves with it.
// shortcut: one finger at a time, so the on-screen keys can't play chords yet,
// real multi-touch comes if players ask for it.

const HOLD_MS = 450
const MOVE_PX = 8
// The browser already handles a finger on these
const NATIVE = 'input, textarea, select, [contenteditable="true"]'
// Window headers drag by pointer events themselves (modalDrag.ts). What sits on one is still a control.
const OWN_DRAG = '[style*="touch-action: none"]'
const CONTROL = 'button, a, label, [role="button"]'

let finger: number | null = null
let pressed: Element | null = null
let hovered: Element | null = null
let startX = 0, startY = 0
let holdTimer: ReturnType<typeof setTimeout> | undefined

function send(type: string, target: Element, e: { clientX: number; clientY: number }, related: Element | null = null) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, view: window,
    clientX: e.clientX, clientY: e.clientY, screenX: e.clientX, screenY: e.clientY,
    button: 0, buttons: type === 'mouseup' ? 0 : 1, relatedTarget: related,
  }))
}

function hover(next: Element | null, e: { clientX: number; clientY: number }) {
  if (next === hovered) return
  if (hovered) send('mouseout', hovered, e, next)
  if (next) send('mouseover', next, e, hovered)
  hovered = next
}

function release(e: PointerEvent) {
  if (e.pointerId !== finger) return
  clearTimeout(holdTimer)
  // A slider rests where the finger left it, however coalesced the last moves were
  if (pressed && e.type === 'pointerup' && Math.hypot(e.clientX - startX, e.clientY - startY) >= MOVE_PX) send('mousemove', hovered ?? pressed, e)
  if (pressed) send('mouseup', pressed, e)
  hover(null, e)
  finger = null
  pressed = null
}

// A cancelled press still lets the browser's own hover through after a tap, and
// nothing ever ends that hover. A real mouse on the tablet keeps its hover.
let touching = false
for (const type of ['pointerdown', 'pointermove']) {
  window.addEventListener(type, (e) => { touching = (e as PointerEvent).pointerType === 'touch' }, true)
}
for (const type of ['mouseover', 'mouseout', 'mousemove']) {
  window.addEventListener(type, (e) => { if (touching && e.isTrusted) e.stopImmediatePropagation() }, true)
}

window.addEventListener('pointerdown', (e) => {
  const target = e.target as Element
  if (e.pointerType !== 'touch' || finger !== null || target.closest?.(NATIVE)) return
  if (target.closest?.(OWN_DRAG) && !target.closest(CONTROL)) return
  finger = e.pointerId
  pressed = target
  startX = e.clientX
  startY = e.clientY
  e.preventDefault()          // the browser's own late mouse events would repeat this one
  send('mousedown', target, e)
  const { clientX, clientY } = e
  holdTimer = setTimeout(() => hover(target, { clientX, clientY }), HOLD_MS)
}, true)

window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== finger || !pressed) return
  if (Math.hypot(e.clientX - startX, e.clientY - startY) < MOVE_PX) return
  clearTimeout(holdTimer)
  const under = document.elementFromPoint(e.clientX, e.clientY) ?? pressed
  hover(under, e)
  send('mousemove', under, e)
}, true)

window.addEventListener('pointerup', release, true)
window.addEventListener('pointercancel', release, true)

// ── A drag stays a drag unless something can scroll that way ─────────────────
export function canScroll(from: Element | null, vertical: boolean): boolean {
  for (let el = from; el; el = el.parentElement) {
    const style = getComputedStyle(el)
    const overflow = vertical ? style.overflowY : style.overflowX
    const room = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
    if (room > 1 && (overflow === 'auto' || overflow === 'scroll')) return true
  }
  return false
}

let touchAt = { x: 0, y: 0 }
let holdScroll: boolean | null = null
window.addEventListener('touchstart', (e) => {
  touchAt = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  holdScroll = null
}, { capture: true, passive: true })

window.addEventListener('touchmove', (e) => {
  // The first move decides, and it has to hold: let go once and the browser takes the gesture
  if (holdScroll === null) {
    const vertical = Math.abs(e.touches[0].clientY - touchAt.y) >= Math.abs(e.touches[0].clientX - touchAt.x)
    holdScroll = !canScroll(e.target as Element, vertical)
  }
  if (holdScroll && e.cancelable) e.preventDefault()
}, { capture: true, passive: false })
