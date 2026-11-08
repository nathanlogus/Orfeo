import { createNativeStartup } from './nativeStartup'

export async function runNativeStartupTest(): Promise<number> {
  let checks = 0, failed = 0
  const check = (ok: boolean, label: string) => { checks++; if (!ok) { failed++; console.error('FAIL:', label) } }
  let visible = true, active = true, suspended = false, ready = 0, failures = 0
  const pending: ((ok: boolean) => void)[] = []
  const startup = createNativeStartup({ active: () => active, visible: () => visible, suspended: () => suspended, paths: async () => ['piano.sf2'], start: () => new Promise(resolve => pending.push(resolve)), ready: () => ready++, failed: () => failures++ })
  const first = startup.start(); await Promise.resolve()
  const second = startup.start(); await Promise.resolve()
  pending[0](false); await first
  check(failures === 0, 'cancelled first start cannot fall back while a new piano is loading')
  pending[1](true); await second
  check(ready === 1 && failures === 0, 'latest successful start commits')
  const sleeping = startup.start(); await Promise.resolve(); visible = false; suspended = true; pending[2](false); await sleeping
  check(failures === 0, 'sleep during startup does not change selected engine')
  await startup.start(); check(pending.length === 3, 'no audio output is opened while hidden')
  visible = true; suspended = false
  const resumed = startup.start(); await Promise.resolve(); pending[3](true); await resumed
  check(ready === 2, 'waking starts the selected engine again')
  const cancelled = startup.start(); await Promise.resolve(); startup.cancel(); pending[4](false); await cancelled
  check(failures === 0, 'unmount or engine switch invalidates pending failures')
  const inactive = startup.start(); await Promise.resolve(); active = false; pending[5](false); await inactive
  check(failures === 0, 'an engine chosen by the user is not overridden')
  active = true; const unavailable = startup.start(); await Promise.resolve(); pending[6](false); await unavailable
  check(failures === 1, 'a real failure while visible still offers the fallback')
  console.log(`native startup: ${checks - failed} passed, ${failed} failed`); return failed
}
