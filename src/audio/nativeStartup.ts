// A superseded or backgrounded start is cancellation, not an engine failure.
export function createNativeStartup(deps: {
  active: () => boolean
  visible: () => boolean
  suspended: () => boolean
  paths: () => Promise<string[]>
  start: (paths: string[]) => Promise<boolean>
  ready: () => void
  failed: () => void
}) {
  let generation = 0
  return {
    cancel() { generation++ },
    async start() {
      if (!deps.visible() || !deps.active()) return
      const ticket = ++generation
      const current = () => ticket === generation && deps.active() && deps.visible()
      try {
        const paths = await deps.paths()
        if (!current()) return
        const ok = await deps.start(paths)
        if (!current() || deps.suspended()) return
        if (ok) deps.ready()
        else deps.failed()
      } catch {
        if (current() && !deps.suspended()) deps.failed()
      }
    },
  }
}
