import { useEffect } from 'react'
import { useStore } from '../store'
import { liveProgram, useMidiSettings } from '../store/midiSettings'
import { androidPianoBridge, useAndroidPiano } from '../audio/androidPiano'
import { getSamplesSampleRate, initSamplesEngine, liveReset } from './useSamplesEngine'

// Serialize loads/stops across settings changes and StrictMode remounts. A
// superseded load is stopped before the next starts, never after it.
let jobs = Promise.resolve()
let generation = 0
export async function drainAndroidPiano() {
  ++generation
  await jobs.catch(() => {})
  androidPianoBridge()?.stop()
  useAndroidPiano.setState({ phase: 'off', status: null, error: null })
}

export function useAndroidPianoService() {
  useEffect(() => {
    const api = androidPianoBridge()
    if (!api) return
    let key = '', desiredKey = '', active = true, retryAt = 0, retries = 0
    let program = -1, gain = -1
    const reconcile = () => {
      if (!active) return
      const s = useStore.getState(), m = useMidiSettings.getState()
      const wanted = m.prefsLoaded && m.androidNativePiano && s.audioEngine === 'samples'
        && m.devices.some(d => d.connected) && !document.hidden
      const next = wanted ? s.selectedSoundfont : ''
      if (next !== desiredKey) { desiredKey = next; retries = 0 }
      if (next !== key) {
        key = next
        const ticket = ++generation
        useAndroidPiano.setState({ phase: wanted ? 'starting' : 'off', status: null, error: null })
        jobs = jobs.catch(() => {}).then(async () => {
          if (ticket !== generation || !active) return
          api.stop()
          if (!wanted) return
          try {
            const paths = await window.electronAPI.nativeSoundfontPaths(next)
            if (ticket !== generation || !active) return
            const path = next === 'generaluser-gs' ? '' : paths.at(-1)
            if (next !== 'generaluser-gs' && (!path || paths.length < 2)) throw new Error('Download this sound set before using native keyboard audio.')
            if (path && !/\.sf2$/i.test(path)) throw new Error('Native keyboard audio needs an SF2 sound set. Choose an SF2 or use Web Audio for SF3.')
            // Opening both AAudio streams at once can make Android send the
            // second to its slower legacy output. Join the song engine's
            // existing initialization before opening our shared stream.
            await initSamplesEngine(() => {}).catch(() => {})
            if (ticket !== generation || !active) return
            gain = useStore.getState().masterVolume
            await api.start(path ?? '', gain, getSamplesSampleRate())
            if (ticket !== generation || !active) { api.stop(); return }
            // Release any Web Audio notes that were held during loading.
            liveReset()
            program = liveProgram(); api.midi(0xc0, program, 0)
            useAndroidPiano.setState({ phase: 'running', status: api.status(), error: null })
          } catch (error) {
            api.stop()
            if (ticket === generation && active) useAndroidPiano.setState({ phase: 'failed', status: null, error: error instanceof Error ? error.message : String(error) })
          }
        })
      }
      if (useAndroidPiano.getState().phase !== 'running') return
      try {
        if (s.masterVolume !== gain) { gain = s.masterVolume; api.gain(gain) }
        if (liveProgram() !== program) { program = liveProgram(); api.midi(0xc0, program, 0) }
      } catch { /* The status poll reports a disconnected output. */ }
    }
    const poll = () => {
      if (!active) return
      if (useAndroidPiano.getState().phase === 'running') {
        try {
          const status = api.status()
          if (status.running) useAndroidPiano.setState({ status })
          else {
            api.stop()
            useAndroidPiano.setState({ phase: 'off', status: null })
            if (retries++ < 3) { key = ''; retryAt = Date.now() + 500 }
            else useAndroidPiano.setState({ phase: 'failed', error: 'The audio output disconnected repeatedly. Toggle native keyboard audio to retry.' })
          }
        } catch (error) { useAndroidPiano.setState({ phase: 'failed', status: null, error: String(error) }) }
      }
      if (Date.now() >= retryAt) reconcile()
    }
    const unstore = useStore.subscribe(reconcile), unmidi = useMidiSettings.subscribe(reconcile)
    document.addEventListener('visibilitychange', reconcile)
    const timer = setInterval(poll, 500)
    reconcile()
    return () => {
      active = false; ++generation
      unstore(); unmidi(); clearInterval(timer)
      document.removeEventListener('visibilitychange', reconcile)
      useAndroidPiano.setState({ phase: 'off', status: null, error: null })
      jobs = jobs.catch(() => {}).then(() => api.stop())
    }
  }, [])
}
