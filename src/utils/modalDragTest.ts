import { clampModalPos, MODAL_MIN_TOP as TOP } from './modalDrag'

export function runModalDragTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  const clamp = (x: number, y: number, w: number, h: number) => clampModalPos({ x, y }, w, h, 1280, 800)

  eq('inside stays put', clamp(100, 100, 400, 300), { x: 100, y: 100 })
  eq('above the top', clamp(100, -11, 346, 651), { x: 100, y: TOP })
  eq('past the left', clamp(-50, 100, 400, 300), { x: 0, y: 100 })
  eq('past the right', clamp(1200, 100, 400, 300), { x: 880, y: 100 })
  eq('past the bottom', clamp(100, 900, 400, 300), { x: 100, y: 500 })

  // Wider than the screen: both of its edges can be dragged into view
  eq('wide, right side reachable', clamp(-500, 100, 1500, 300), { x: -220, y: 100 })
  eq('wide, left side reachable', clamp(50, 100, 1500, 300), { x: 0, y: 100 })
  // Taller than the screen: the header wins, whatever the bottom does
  eq('tall keeps its header', clamp(100, 700, 400, 900), { x: 100, y: TOP })
  return failures
}
