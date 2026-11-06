import { useEffect } from 'react'

// The splash itself lives in index.html, so it paints before this bundle has
// parsed. Mounted after App: the prefs are the last thing the first screen waits
// for (they decide first-run), and two frames later that screen is on the glass.
export default function Splash() {
  useEffect(() => {
    const open = () => requestAnimationFrame(() => requestAnimationFrame(() => (window as any).__splashOpen?.()))
    void window.electronAPI.getPrefs().then(open, open)
  }, [])
  return null
}
