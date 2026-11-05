import { useNewVersionDot } from '../../hooks/useUpdateCheck'
import { t } from '../../utils/i18n'
import '../../styles/redesign-settings.css'

// ── The pink dot on a way into Settings when a new version is out. Goes inside
// the button; Settings › Appearance › Updates switches it off. ──────────────
export function NewVersionDot() {
  const on = useNewVersionDot()
  return on ? <span className="set-new-dot" role="img" aria-label={t`New version available`} /> : null
}
