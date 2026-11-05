import { useId, type ReactNode } from 'react'
import { SETTING_BY_ID, type SettingId } from './catalog'
import { DEFS } from './defs'
import { BetaBadge, SurfaceContext } from './controls'

const always = () => true

// Catalog text with **bold** words: the stars mark what to emphasise (one weight
// everywhere, so the emphasis is the stronger text colour)
export function richText(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} style={{ fontWeight: 400, color: 'var(--ui-text)' }}>{part}</b> : part))
}

// ── One setting in the Settings window: name and description (switch on the
// right), then its controls, glance lines and follow-up options.
export function SettingCard({ id }: { id: SettingId }) {
  const def = DEFS[id], info = SETTING_BY_ID[id]
  const useVisible = def.useVisible ?? always
  const visible = useVisible()
  const labelId = useId()
  if (!visible) return null
  const { Control, Glance, Extra, Description, NameSuffix, HeadAction } = def
  const onNameLine = def.kind !== 'choice'
  const controlFirst = def.layout === 'controlFirst'
  const description = <div className="set-card-desc">{Description ? <Description /> : richText(info.description)}</div>
  const glance = Glance && !def.glanceQuickOnly ? <Glance /> : null
  const name = (
    <div id={labelId} className="set-card-name">
      <span>{info.name}{NameSuffix && <> <NameSuffix /></>}</span>
      {def.badge === 'beta' && <BetaBadge />}
    </div>
  )
  return (
    <SurfaceContext.Provider value="window">
      <div role="group" aria-labelledby={labelId} className={`o-card set-card${def.dark ? ' theme-studio set-card-dark' : ''}`}
        style={def.wide ? { gridColumn: '1 / -1' } : undefined}>
        <div className="set-card-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {name}
            {!controlFirst && description}
          </div>
          {onNameLine ? <Control /> : HeadAction ? <HeadAction /> : null}
        </div>
        {!onNameLine && <div className="set-card-control"><Control /></div>}
        {glance}
        {controlFirst && description}
        {Extra && <Extra />}
      </div>
    </SurfaceContext.Provider>
  )
}
