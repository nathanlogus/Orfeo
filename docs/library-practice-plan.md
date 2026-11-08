# Library and practice improvements

The six requested features are delivered together around the existing Home
library, song server, MIDI importer and practice set player.

1. Recently added: store import dates, offer newest-first sorting and a New
   badge, refresh server results periodically, expose active filters.
2. Import inbox: choose a watched folder and a collection folder, review new
   files and metadata, detect duplicates, convert notation to MIDI, retain
   original scores and look up artwork without embedding credentials.
3. Offline library: select songs or download a whole filtered collection,
   cache MIDI, score, artwork and metadata, retain an offline browsing index.
4. Song details: edit titles, artists, genres and cover images on the device;
   apply edits to search and filters; group Brazilian genres consistently.
5. Practice setlists: persist named lists, reorder entries, remember tempo,
   hand selection and section per song, reuse the existing set player.
6. Performance recordings: capture incoming MIDI while armed, save takes per
   song, replay/export them, and compare note counts, duration and timing.

Data remains in the user's library or application data directory. Source
files and existing progress are retained. Desktop inbox watching runs while
the app is open; Android can import picked files and uses offline downloads.
User preferences and personal edits do not write to the read-only song server.

Validation: focused tests for duplicate detection, persistence/validation,
offline metadata, set ordering and MIDI recording; TypeScript checks; desktop
and Android builds; tablet runtime and home-server checks.

Immediate repair: guard Native startup against superseded requests, restore
the soundfont before starting the engine, and restart the stopped Home server.

## Implementation and verification

All six feature areas are implemented. User-facing instructions and the
scope of hand-track focus and MIDI recordings are in
[Library tools and recordings](library-practice.md).

- 97 headless test files pass; one existing native-addon-only check is skipped
  by the repository's runner.
- Native startup has eight dedicated regression checks, covering superseded
  starts, sleep, resume, cancellation, explicit engine changes and real failure.
- The song server passes its integration tests; artwork matching has six checks.
- Android offline artwork proxy handling has six regression checks.
- An isolated built desktop app passes twelve real storage and UI flows,
  including import review storage, exact duplicates, changed-source rejection,
  recording persistence, Spotify lookup, complete offline bundles, named
  setlist creation and entries, metadata edits and offline selection.
- Desktop and Android builds are checked. Personal library and practice data
  are retained; the active home server continues to serve 851 songs.
- On the tablet, Native stays running after reinstall/relaunch, Spotify lookup
  works through the home server, and Golden Hour downloads with its score and
  cover. Its saved entry is searchable under This device and its cover loads
  from the tablet's local file bridge.
