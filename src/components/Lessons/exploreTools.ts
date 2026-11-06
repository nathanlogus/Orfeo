import { useStore } from '../../store'
import { t } from '../../utils/i18n'

// ── The Explorers, from Learn: they open over Home, with or without a song ───
export const EXPLORE_TOOLS = [
  { id: 'chords', name: () => t`Chord Explorer`, open: () => useStore.getState().setChordExplorerOpen(true) },
  {
    id: 'scales', name: () => t`Scale Explorer`,
    open: () => {
      const s = useStore.getState()
      s.setScaleStarmapView(false)
      s.setScaleExplorerOpen(true)
    },
  },
  {
    id: 'starmap', name: () => t`Starmap`,
    open: () => {
      const s = useStore.getState()
      s.setStarmapEnabled(true)
      s.setScaleStarmapView(true)
      s.setScaleExplorerOpen(true)
    },
  },
]
