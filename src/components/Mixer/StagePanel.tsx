import { useState } from 'react'
import { useStore } from '../../store'
import { useMidiSettings } from '../../store/midiSettings'
import { GM_NAMES } from '../../utils/gmInstruments'
import { COMPRESSOR_PRESETS, setMasterChorus, setMasterReverb, setMasterTone, setMasterCompressor, useMasterFx } from '../../audio/engine'
import MixerKnob from './MixerKnob'

export default function StagePanel() {
  const [open, setOpen] = useState(true)
  const engine = useStore(s => s.audioEngine)
  const volume = useStore(s => s.masterVolume)
  const comp = useStore(s => s.masterCompEnabled)
  const preset = useStore(s => s.masterCompPreset)
  const program = useMidiSettings(s => s.liveProgram)
  const soundSet = useStore(s => s.selectedSoundfont)
  const chorus = useMasterFx(s => s.chorus ?? 0)
  const reverb = useMasterFx(s => s.reverb ?? 0)
  const tone = useMasterFx(s => s.tone)
  const disabled = engine === 'gm'
  const setCompression = (on: boolean, p: number) => {
    useStore.getState().setMasterCompEnabled(on)
    useStore.getState().setMasterCompPreset(p)
    setMasterCompressor(on, p)
  }
  return <section className="pr-stage" aria-label="Instrument and effects">
    <div className="pr-stage-heading">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="stage-controls">{open ? '−' : '+'} Instrument & FX</button>
      <span>{disabled ? 'Choose Studio or Native to use FX' : 'Master effects · shape the overall sound'}</span>
    </div>
    {open && <div id="stage-controls" className="pr-stage-controls">
      <div className="pr-stage-module pr-stage-instrument">
        <h3>Keyboard</h3>
        <label>Instrument<select aria-label="Keyboard instrument" value={program} onChange={e => useMidiSettings.setState({ liveProgram: Number(e.target.value) })}>
          {GM_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select></label>
        <small>{soundSet === 'generaluser-gs' ? 'GeneralUser GS' : soundSet.replace(/^custom:/, '').replace(/\.sf[23]$/i, '')}</small>
      </div>
      <div className="pr-stage-module">
        <h3>Master level</h3>
        <MixerKnob value={volume} onChange={v => useStore.getState().setMasterVolume(v)} size={48} accentColor="#e6b75a" title="Master volume" />
        <output>{Math.round(volume * 100)}%</output>
      </div>
      <div className="pr-stage-module">
        <h3>Chorus</h3>
        <MixerKnob value={chorus} onChange={setMasterChorus} size={48} accentColor="#98c5a1" title="Master chorus" disabled={disabled} disabledHint="Choose Studio or Native to use FX." />
        <output>{Math.round(chorus * 100)}%</output>
      </div>
      <div className="pr-stage-module">
        <h3>Reverb</h3>
        <MixerKnob value={reverb} onChange={setMasterReverb} size={48} accentColor="#8fb6df" title="Master reverb" disabled={disabled} disabledHint="Choose Studio or Native to use FX." />
        <output>{Math.round(reverb * 100)}%</output>
      </div>
      <div className="pr-stage-module">
        <h3>Tone</h3>
        <MixerKnob value={tone} bipolar onChange={setMasterTone} size={48} accentColor="#d5be8e" title="Master tone" disabled={disabled} disabledHint="Choose Studio or Native to use FX." />
        <output>{tone < -.05 ? 'Darker' : tone > .05 ? 'Brighter' : 'Flat'}</output>
      </div>
      <div className="pr-stage-module pr-stage-compression">
        <h3>Compressor</h3>
        <button className="pr-stage-switch" aria-label="Master compressor" aria-pressed={comp} disabled={disabled} onClick={() => setCompression(!comp, preset)}><i />{comp ? 'On' : 'Off'}</button>
        <select aria-label="Compressor strength" value={preset} disabled={disabled || !comp} onChange={e => setCompression(comp, Number(e.target.value))}>
          {COMPRESSOR_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
      </div>
    </div>}
  </section>
}
