# Song server

Serves a folder of songs to Pliage on your home network, with the card details the
Home page shows and filters on: titles, composers, genres, key, tempo, difficulty,
hand layout and cover art.

It's for your own songs on your own network. It answers home addresses only and has
no login, so don't expose it to the internet.

## Run it

```bash
npm run android:songs -- "<library folder>" 8765
```

In Pliage, open **Home server**. Apps find it by themselves on the same network.

`server/songServerTest.mjs` is its test. Run it with `node`.

## Two private folders

Nothing below belongs in Git: the songs, lyrics and covers are other people's work.

| Setting | What it holds |
|---|---|
| `PLIAGE_LIBRARY` (the `<library>` argument) | The songs, `catalog.json` and `.art/` covers the server reads |
| `PLIAGE_DATA` | Everything the catalog is built from: cached pages, lookups, `catalog.sqlite` |

Set `PLIAGE_DATA` before running anything in `catalog/` or `hands/`.

## Build the catalog

Python scripts need only the standard library. Run the Node ones from the repo root:

```bash
HOOK="--import ./scripts/ts-esbuild-hooks.mjs"
python -I server/catalog/download_songs.py "<library>"
python -I server/catalog/fetch_sources.py
node $HOOK server/catalog/analyze.mjs "<library>"
node $HOOK server/catalog/analyze_hands.mjs "<library>"
python -I server/catalog/build_catalog.py "<library>"
```

`build_catalog.py` writes `catalog.sqlite` to `PLIAGE_DATA`, and `catalog.json` to the
library. Lyrics stay in the database and never reach `catalog.json`.

Every script is safe to re-run. Each one skips what it already has.

### Authors

```bash
python -I server/catalog/fetch_authors.py
python -I server/catalog/verify_weimar.py
```

MusicBrainz allows one request a second. A title alone can credit the wrong song (a pop
hit can have more recordings than the standard of the same name), so Weimar solos are
checked against the performer's own recording and left blank if that fails. McKenzie's
standards have no recordings to check, so `build_catalog.py` carries a short list of
corrections from reading every match.

### Cover art

```bash
python -I server/catalog/fetch_art.py covers
python -I server/catalog/fetch_art.py spotify
python -I server/catalog/fetch_art.py fast
python -I server/catalog/build_catalog.py "<library>"
```

Run `spotify` and `fast` again after new authors arrive. `itunes` is there for
completeness: it added nothing in testing and is slow, so `itunes-force` runs it.

Spotify needs a key in `~/.pliage-spotify.json` (or `PLIAGE_SPOTIFY_KEYS`):

```json
{ "client_id": "...", "client_secret": "..." }
```

Art needs a title and an artist that both match. Web covers are stored as links, and
the server saves each one to `.art/web/` the first time it's asked for.

## Left and right hands

`hands/fix_hands.mjs` renames tracks that are already separate hands to end in ` RH` or
` LH`, which Pliage treats as final. Add `--apply` to write; without it nothing changes.

`hands/` also runs [piano-hand-assignment](https://github.com/haveyouwantto/piano-hand-assignment)
over songs with one piano part. It got 92% of notes right against 82% for Pliage's own
engine, on the same 328 songs with their hands merged. Clone it and download its models
yourself, into a virtual environment with `torch`, then:

```bash
node server/hands/export_parts.mjs "<library>"
python server/hands/label_parts.py <tool-checkout> <models-folder>
node $HOOK server/hands/apply_hand_map.mjs "<library>" "<backup folder>"          # dry run
node $HOOK server/hands/apply_hand_map.mjs "<library>" "<backup folder>" --apply
```

Each song is written as an `PLIAGE_HAND_MAP` hint, so its notes and sound stay the same.
A file is replaced only if Pliage's own parser keeps every note and restores every hand
from the result. Originals go to the backup folder first, and song ids follow the new
file contents. Songs the model is unsure about stay with Pliage's engine.

A hint is ignored if `HAND_ENGINE_VERSION` in `src/utils/handMetadata.ts` changes.
Re-run `apply_hand_map.mjs` after a bump, or Pliage goes back to its own split.
