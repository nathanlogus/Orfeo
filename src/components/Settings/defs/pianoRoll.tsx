import type { CSSProperties } from 'react'
import { ZoomIn, Grid3x3, Minus, Sparkles, Undo2 } from 'lucide-react'
import { useStore } from '../../../store'
import type { HitEffectPattern } from '../../../types'
import Tooltip from '../../Tooltip'
import { Switch, OptionBtn, OptionGroup, RollZoomStepper, GlanceLine, SubLabel, HelpText, HitEffectColorSwatch } from '../controls'
import type { SettingDef } from '../types'

export const HIT_EFFECT_DESCRIPTIONS: Record<HitEffectPattern, string> = {
  glowBloom: 'Soft radial glow that blooms outward and fades.',
  rippleRing: 'Expanding concentric rings, like a ripple in water.',
  particleBurst: 'Small particles spray upward and fall back down with gravity.',
  smokePlume: 'Soft blurred smoke wisps drift upward, shifting color as they dissipate.',
  colorAura: 'A soft glowing blob that pulses outward while cycling through colors.',
  starburstNova: 'Sharp radiating rays with a bright flash — explosive and energetic.',
  cometTrail: 'A bright streak shoots upward with a fading trail behind it.',
}

// The design's tile icons, one per pattern
const HIT_EFFECT_ICONS: Record<HitEffectPattern, string> = {
  glowBloom: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  rippleRing: 'M12 12h.01M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  particleBurst: 'M12 12h.01M6 6h.01M18 6h.01M6 18h.01M18 18h.01M12 4h.01M12 20h.01M4 12h.01M20 12h.01',
  smokePlume: 'M8 20c-3 0-4-3-2-5-2-3 1-6 4-5 1-3 6-3 7 0 3 0 4 4 2 6 1 2-1 4-3 4z',
  colorAura: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8',
  starburstNova: 'M12 2l2 7 7 1-6 4 2 7-5-5-5 5 2-7-6-4 7-1z',
  cometTrail: 'M4 20 14 10M14 10a3 3 0 1 0 4-4 3 3 0 0 0-4 4z',
}
const HIT_EFFECT_NAMES: Record<HitEffectPattern, string> = { glowBloom: 'Glow Bloom', rippleRing: 'Ripple Ring', particleBurst: 'Particle Burst', smokePlume: 'Smoke Plume', colorAura: 'Color Aura', starburstNova: 'Starburst Nova', cometTrail: 'Comet Trail' }

function RollZoomSuffix() {
  const zoomLevel = useStore(s => s.zoomLevel)
  return <>— {Math.round(zoomLevel * 100)}%</>
}
function RollZoomGlance() {
  const zoomLevel = useStore(s => s.zoomLevel)
  return <GlanceLine>{`${Math.round(6 / zoomLevel * 10) / 10}s visible · higher = notes appear larger`}</GlanceLine>
}

function Slider({ label, value, min, max, step, onChange, digits }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; digits: number
}) {
  return (
    <>
      <SubLabel>{`${label} — ${value.toFixed(digits)}`}</SubLabel>
      <Tooltip title="Drag to change" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="orfeo-slider-amber"
          style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        />
      </Tooltip>
    </>
  )
}

function VisualEffectsExtra() {
  const on = useStore(s => s.hitEffectsEnabled)
  const scope = useStore(s => s.hitEffectScope)
  const setScope = useStore(s => s.setHitEffectScope)
  const color = useStore(s => s.hitEffectColor)
  const setColor = useStore(s => s.setHitEffectColor)
  const pattern = useStore(s => s.hitEffectPattern)
  const setPattern = useStore(s => s.setHitEffectPattern)
  const intensity = useStore(s => s.hitEffectBloomIntensity)
  const spread = useStore(s => s.hitEffectBloomSpread)
  const threshold = useStore(s => s.hitEffectBloomThreshold)
  if (!on) return null
  const st = useStore.getState()
  return (
    <>
      <SubLabel>Scope & Color</SubLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
        <OptionGroup label="Effect scope">
          <OptionBtn active={scope === 'keyboard'} onClick={() => setScope('keyboard')}>Piano only</OptionBtn>
          <OptionBtn active={scope === 'all'} onClick={() => setScope('all')}>All tracks</OptionBtn>
        </OptionGroup>
        <HitEffectColorSwatch color={color} onChange={setColor} />
        {color && (
          <Tooltip title="Use each track's own color again" wrapperStyle={{ flexShrink: 0 }}>
            <button className="o-icon-quiet" aria-label="Use each track's own color again" onClick={() => setColor(null)}><Undo2 size={14} /></button>
          </Tooltip>
        )}
      </div>
      <SubLabel>Pattern</SubLabel>
      <div className="set-fx" role="group" aria-label="Pattern">
        {(Object.keys(HIT_EFFECT_DESCRIPTIONS) as HitEffectPattern[]).map(p => (
          <button key={p} aria-pressed={p === pattern} onClick={() => setPattern(p)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={HIT_EFFECT_ICONS[p]} /></svg>
            {HIT_EFFECT_NAMES[p]}
          </button>
        ))}
      </div>
      <HelpText>{HIT_EFFECT_DESCRIPTIONS[pattern]}</HelpText>
      <Slider label="Intensity" value={intensity} min={0} max={4} step={0.1} digits={1} onChange={st.setHitEffectBloomIntensity} />
      <Slider label="Spread" value={spread} min={0} max={12} step={0.5} digits={1} onChange={st.setHitEffectBloomSpread} />
      <Slider label="Threshold" value={threshold} min={0} max={1} step={0.05} digits={2} onChange={st.setHitEffectBloomThreshold} />
      <HelpText>Lower values make more of the effect glow; higher values only bloom the brightest parts.</HelpText>
    </>
  )
}

export const PIANO_ROLL_DEFS: SettingDef[] = [
  { id: 'rollZoom', icon: ZoomIn, kind: 'choice', Control: RollZoomStepper, Glance: RollZoomGlance, NameSuffix: RollZoomSuffix },
  {
    id: 'barNumbers', icon: Grid3x3, kind: 'switch',
    Control: () => { const v = useStore(s => s.showBarNumbers); return <Switch value={v} onChange={useStore.getState().setShowBarNumbers} label="Bar numbers & grid lines" /> },
  },
  {
    id: 'visualEffects', icon: Sparkles, kind: 'switch', wide: true, Extra: VisualEffectsExtra,
    Control: () => { const v = useStore(s => s.hitEffectsEnabled); return <Switch value={v} onChange={useStore.getState().setHitEffectsEnabled} label="Visual Effects" /> },
  },
]
