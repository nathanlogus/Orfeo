import { useState } from 'react'
import { Circle, Square } from 'lucide-react'
import { useStore } from '../../store'
import { finishPerformanceRecording, startPerformanceRecording, usePerformanceRecorder } from '../../utils/performanceRecording'

export default function RecordTake() {
  const active = usePerformanceRecorder(s => s.active), notes = usePerformanceRecorder(s => s.notes)
  const midi = useStore(s => s.midi), [message, setMessage] = useState(''), [saving, setSaving] = useState(false)
  return <div className="library-record-control app-no-drag" data-recording={active || undefined}>
    <button className="o-btn" disabled={!midi || saving} aria-pressed={active} onClick={async () => {
      setMessage('')
      if (!active) { startPerformanceRecording((midi as any)?._filePath ?? midi!.fileName, midi!.fileName.replace(/\.[^.]+$/, '')); return }
      setSaving(true)
      try { const take = await finishPerformanceRecording(); setMessage(`Saved ${take.notes} notes. Find it in Library tools → Recordings.`) } catch (e) { setMessage((e as Error).message) } finally { setSaving(false) }
    }}>{active ? <Square size={13} fill="currentColor" /> : <Circle size={13} fill="currentColor" />}{active ? `Stop take · ${notes} notes` : 'Record take'}</button>
    {message && <span role="status" className="o-note">{message}</span>}
  </div>
}
