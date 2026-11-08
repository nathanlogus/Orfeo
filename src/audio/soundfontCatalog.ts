// Optional downloads, never bundled in the installer. Keep upstream filenames
// so already imported copies are recognised when they become catalog entries.
export interface SoundfontCatalogEntry {
  name: string
  filename: string
  sizeMB: number
  url: string
  description?: string
  sourceUrl?: string
  attribution?: string
}

const archive = 'https://huggingface.co/datasets/projectlosangeles/soundfonts4u'
const revision = 'b8a0526c20bd73e7d009f7e2d94ca6abbccd9a2d'
function archivedPiano(name: string, filename: string, bytes: number, description: string, attribution: string): SoundfontCatalogEntry {
  return {
    name, filename, sizeMB: Math.round(bytes / (1024 * 1024)), description, attribution,
    url: `${archive}/resolve/${revision}/${encodeURIComponent(filename)}`,
    sourceUrl: `${archive}/blob/${revision}/README.md`,
  }
}

export const SOUNDFONT_CATALOG: Record<string, SoundfontCatalogEntry> = {
  'fluidr3-gm': {
    name: 'FluidR3 GM', filename: 'FluidR3_GM.sf2', sizeMB: 142,
    url: 'https://github.com/fhunleth/midi_synth/releases/download/v0.1.0/FluidR3_GM.sf2',
  },
  'musescore-general': {
    name: 'MuseScore General', filename: 'MuseScore_General.sf3', sizeMB: 38,
    url: 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3',
  },
  'steinway-model-b': archivedPiano(
    'Steinway Model B', "Dore Mark's NY S&S Model B-v5.2.sf2", 248940510,
    'New York grand · 7 sampled velocity layers · dynamic, mellow and dark presets',
    'Dore Mark · SF2 conversion by John Nebauer',
  ),
  'steinway-lite': archivedPiano(
    'Nice Steinway Lite', 'Nice-Steinway-Lite-v3.0.sf2', 74398266,
    'Compact Steinway grand · 12 filtered velocity layers',
    'Anthony Deaton / University of Iowa · John Nebauer adaptation · CC BY-ND 3.0',
  ),
  'fazioli-f308': archivedPiano(
    'Fazioli F308', "Dore Mark's Fazioli F308-v2.6.sf2", 313732108,
    'Italian concert grand · 5 sampled velocity layers · audience perspective',
    'Dore Mark · SF2 conversion by John Nebauer',
  ),
  'mason-hamlin-a': archivedPiano(
    'Mason & Hamlin Model A', 'MasonHamlin-A-v7.sf2', 340109018,
    'American acoustic grand piano',
    'Dore Mark · SF2 adaptation by John Nebauer · no commercial resale or packaging',
  ),
  'salamander-c5': archivedPiano(
    'Salamander Yamaha C5', 'Yamaha-C5-Salamander-JNv5.1.sf2', 620658258,
    'Yamaha C5 grand · 15 velocity layers · Soundfonts4U SF2 edition',
    'Alexander Holm · SF2 adaptation by John Nebauer · original samples: CC BY 3.0',
  ),
}

// These are source links, not selectable instruments or automatic downloads.
export const BOSENDORFER_LIBRARY_URL = 'https://www.realisticpiano.com/'
export const ROLAND_FP90X_URL = 'https://www.roland.com/global/products/fp-90x/'
