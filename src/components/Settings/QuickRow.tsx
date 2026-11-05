import { SETTING_BY_ID, type SettingId } from './catalog'
import { DEFS } from './defs'
import { SurfaceContext } from './controls'
import { richText } from './SettingCard'

const always = () => true

// ── One Setup row (the drawer): name + its one-line summary underneath, then
// its control and at-a-glance line. The full description and follow-up
// options live only in the Settings window.
export function QuickRow({ id }: { id: SettingId }) {
  const def = DEFS[id], info = SETTING_BY_ID[id]
  const useVisible = def.useVisible ?? always
  if (!useVisible()) return null
  const { Control, Glance, NameSuffix, NameRight, QuickExtra, SummaryEnd } = def
  const name = <span className="pr-setup-name">{info.name}{NameSuffix && <> <NameSuffix /></>}</span>
  const summary = <div className="pr-setup-sub">{richText(info.summary)}{SummaryEnd && <> <SummaryEnd /></>}</div>
  return (
    <SurfaceContext.Provider value="setup">
      <div className="pr-setup-row">
        {def.layout === 'controlFirst' ? (
          <>{name}<Control /></>
        ) : def.kind !== 'choice' ? (
          <div className="pr-setup-line"><span>{name}{summary}</span><Control /></div>
        ) : (
          <>
            <div className="pr-setup-line">{name}{NameRight ? <NameRight /> : <span />}</div>
            {summary}
            <Control />
          </>
        )}
        {Glance && <Glance />}
        {QuickExtra && <QuickExtra />}
      </div>
    </SurfaceContext.Provider>
  )
}
