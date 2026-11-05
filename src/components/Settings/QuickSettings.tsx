import { ArrowUpRight } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import OrfeoMark from '../OrfeoMark'
import { GROUPS, QUICK_LAYOUT } from './catalog'
import { GROUP_ICONS } from './groupIcons'
import { CollapsibleSection } from './controls'
import { QuickRow } from './QuickRow'

// Metronome volume: the same value as the metronome's right-click menu
function MetronomeVolumeRow() {
  const volume = useStore(s => s.metronomeVolume)
  const pct = Math.round(volume * 100)
  return (
    <div className="pr-setup-row">
      <div className="pr-setup-line">
        <span className="pr-setup-name">{t`Metronome volume`}</span>
        <span className="pr-setup-sub">{pct}%</span>
      </div>
      <input type="range" min={0} max={150} step={5} value={pct} aria-label={t`Metronome volume`} className="orfeo-slider-amber"
        onChange={e => useStore.getState().setMetronomeVolume(Number(e.target.value) / 100)}
        style={{ height: 32, '--fill': `${pct / 1.5}%` } as React.CSSProperties} />
    </div>
  )
}

// Dock or float: floating is blocked while a modal anchored to the keyboard is open
function KeyboardDockRow() {
  const mode = useStore(s => s.keyboardMode)
  const blocked = useStore(s => s.chordExplorerOpen || s.scaleExplorerOpen || s.mixerOpen || s.midiEditorOpen)
  const set = useStore(s => s.setKeyboardMode)
  return (
    <div className="pr-setup-row">
      <div className="pr-setup-line">
        <span>
          <div className="pr-setup-name">{t`Keyboard`}</div>
          <div className="pr-setup-sub">{mode === 'docked' && blocked ? t`Close the open window to float it` : t`Docked under the roll, or floating`}</div>
        </span>
        <div className="o-seg" role="group" aria-label={t`Keyboard`}>
          <button aria-pressed={mode === 'docked'} onClick={() => set('docked')}>{t`Docked`}</button>
          <button aria-pressed={mode === 'floating'} disabled={mode === 'docked' && blocked} onClick={() => set('floating')}>{t`Floating`}</button>
        </div>
      </div>
    </div>
  )
}

// ── Quick Settings — the drawer's Settings tab: the everyday switches only,
// grouped as in the Settings window; the gear on each group opens that
// group in the full window. ───────────────────────────────────────────────
export default function QuickSettings() {
  const collapsed = useStore(s => s.settingsGroupsCollapsed)
  const setCollapsed = useStore(s => s.setSettingsGroupCollapsed)
  return (
    <>
      {GROUPS.filter(g => QUICK_LAYOUT[g.id].length > 0).map(g => {
        const Icon = GROUP_ICONS[g.id]
        return (
          <CollapsibleSection key={g.id} icon={<Icon size={11} />} label={g.name}
            collapsed={collapsed[g.id]} onToggle={() => setCollapsed(g.id, !collapsed[g.id])}
            action={
              <Tooltip title={t`Open in Settings`} oneLine placement="left">
                <button onClick={() => useStore.getState().openSettingsWindow(g.id)} aria-label={t`Open ${g.name} in Settings`}
                  className="o-icon-quiet">
                  <ArrowUpRight size={16} strokeWidth={1.75} />
                </button>
              </Tooltip>
            }>
            {g.id === 'playback-editing' && <><MetronomeVolumeRow /><QuickRow id="countIn" /></>}
            {QUICK_LAYOUT[g.id].map((item, i) => typeof item === 'string'
              ? <QuickRow key={item} id={item} />
              : <div key={`h${i}`} className="pr-setup-group">{item.heading}</div>)}
            {g.id === 'keyboard' && <KeyboardDockRow />}
          </CollapsibleSection>
        )
      })}
      {/* ── About ── */}
      <div className="pr-setup-meta" style={{ padding: '12px 14px' }}>
        <Tooltip title="Open Orfeo on GitHub" oneLine>
          <button onClick={() => window.electronAPI.openExternal('https://github.com/Squarebow/Orfeo')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', font: 'inherit' }}>
            <OrfeoMark height={16} />
            <span>Orfeo · v{__APP_VERSION__}</span>
          </button>
        </Tooltip>
        <span>· © SquareBow</span>
      </div>
    </>
  )
}
