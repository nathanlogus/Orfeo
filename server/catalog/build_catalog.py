# Merges the download manifest, MIDI analysis and cached source pages into
# catalog.sqlite. Re-run any time; the database is rebuilt from scratch.
# Run: python -I build_catalog.py "<library folder>"
import csv, glob, hashlib, html, json, math, os, re, shutil, sqlite3, sys, time, unicodedata

DATA = os.environ.get('ORFEO_DATA') or sys.exit('Set ORFEO_DATA to the private folder that holds the catalog data')
RAW = os.path.join(DATA, 'raw')
KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']  # same as keyDetection.ts

# Genre origins, most to least trustworthy. Filters can hide the guesses.
SOURCE, TITLE, COMPOSER, DEFAULT = 'source', 'title', 'composer', 'default'

TITLE_WORDS = {
    'forro': 'forro', 'forrozinho': 'forro', 'baiao': 'baiao', 'baiaozinho': 'baiao', 'xote': 'xote',
    'xaxado': 'xaxado', 'frevo': 'frevo', 'maracatu': 'maracatu', 'samba': 'samba', 'sambinha': 'samba',
    'choro': 'choro', 'chorinho': 'choro', 'bossa': 'bossa-nova', 'marcha': 'marchinha',
    'marchinha': 'marchinha', 'valsa': 'valsa', 'toada': 'toada', 'modinha': 'modinha',
}
CRY_WORDS = {'e', 'eu', 'nao', 'quando', 'se', 'que', 'ja', 'ainda'}
COMPOSER_GENRES = {
    'forro': 'luiz gonzaga|humberto teixeira|ze dantas|jackson do pandeiro|dominguinhos|sivuca|anastacia|'
             'gordurinha|genival lacerda|nando cordel|accioly neto|antonio barros|ceceu|marinês|marines',
    'nordeste': 'alceu valenca|geraldo azevedo|ze ramalho|fagner|belchior|ednardo|geraldo vandre|'
                'capiba|nelson ferreira|vital farias|elomar',
    'samba': 'noel rosa|cartola|nelson cavaquinho|ary barroso|ari barroso|adoniran barbosa|ataulfo alves|'
             'wilson batista|geraldo pereira|ze keti|paulinho da viola|candeia|martinho da vila|sinho|donga|'
             'ismael silva|monsueto|lupicinio rodrigues|assis valente|zeca pagodinho|arlindo cruz|'
             'almir guineto|dona ivone lara|elton medeiros|herivelto martins|synval silva|haroldo lobo',
    'choro': 'pixinguinha|ernesto nazareth|chiquinha gonzaga|waldir azevedo|jacob do bandolim|'
             'zequinha de abreu|benedito lacerda|anacleto de medeiros|patapio silva|k-ximbinho',
    'bossa-nova': 'tom jobim|antonio carlos jobim|joao donato|carlos lyra|roberto menescal|'
                  'ronaldo boscoli|baden powell|marcos valle|joao gilberto',
    'mpb': 'chico buarque|caetano veloso|gilberto gil|milton nascimento|djavan|ivan lins|'
           'edu lobo|toquinho|joao bosco|aldir blanc|guilherme arantes|gonzaguinha',
    'sertanejo': 'teddy vieira|tonico|tinoco|goia|sorocabinha|ze di camargo|cesar augusto|sergio reis',
    'jovem-guarda': 'roberto carlos|erasmo carlos|wanderley cardoso|renato barros',
    'rock-brasileiro': 'renato russo|cazuza|lulu santos|rita lee|raul seixas|herbert vianna|'
                       'dado villa-lobos|frejat|paulo ricardo',
}
# Composers active before the mid-century; marks the "old samba" filter.
OLD_GUARD = ('noel rosa|cartola|nelson cavaquinho|ary barroso|ari barroso|adoniran barbosa|ataulfo alves|'
             'wilson batista|geraldo pereira|sinho|donga|ismael silva|assis valente|lupicinio rodrigues|'
             'herivelto martins|synval silva|pixinguinha|haroldo lobo|braguinha|lamartine babo|'
             'custodio mesquita|mario lago')
STRIDE = 'james p\\. johnson|fats waller|thomas waller|willie .*smith|luckey roberts|eubie blake'
BUTTERS = {
    'albertthelion': 'Albert the Lion', 'honeydripper': 'Honeydripper',
    'new orleans vamp': 'New Orleans Vamp', 'shuffle boogie with trad changes': 'Shuffle Boogie with Trad Changes',
}
# McKenzie has no recordings to verify against, so these came from reading every
# match: a pop song of the same name won the title lookup. None means leave it blank.
MCKENZIE_AUTHORS = {
    'carnival': ['Luiz Bonfá', 'Antônio Maria'], 'time after time': ['Jule Styne', 'Sammy Cahn'],
    'since we met': ['Bill Evans'], 'desire': None, 'cantabile': None, 'lullaby': None, 'merry christmas': None,
    'new orleans': None, 'prelude': None, 'who can i turn to?': None,
}
PB_GENRE = {
    'rags': 'ragtime', 'joplin': 'ragtime', 'comps': 'ragtime', 'paull': 'ragtime', 'prerag': 'pre-ragtime',
    'morton': 'early-jazz', 'blues': 'blues', 'gospel': 'gospel', 'tango': 'tango', 'patriotic': 'patriotic',
    'xmas': 'christmas', 'songs': 'early-popular', 'jolson': 'early-popular',
}
GROUP_GENRE = {'Blues': 'blues', 'Jazz': 'jazz'}


def fold(s):
    s = unicodedata.normalize('NFD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).lower()


def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def smart_title(s):
    small = {'a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'pro', 'com', 'por', 'um', 'uma'}
    words = s.lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in small else w for i, w in enumerate(words))


def split_people(s):
    parts = re.split(r'\s*(?:,|/|;|\band\b|&)\s*|\s+e\s+', s or '')
    return [p.strip() for p in parts if p.strip()]


def camel_words(s):
    return re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', s).strip()


def weimar_meta(name):
    parts = os.path.splitext(name)[0].split('_')
    if parts[-1].upper() == 'FINAL': parts = parts[:-1]
    performer = camel_words(parts[0])
    title = camel_words(' '.join(parts[1:])) or performer
    take = re.fullmatch(r'(.*?)[ -](?:Alt|Take)?-?(\d)', title)
    return performer, (take.group(1) if take else title)


def composer_genres(text):
    f = fold(text)
    return sorted(g for g, pat in COMPOSER_GENRES.items() if re.search(r'\b(?:' + pat + r')\b', f))


def title_genres(title):
    words = re.findall(r'[a-z]+', fold(title))
    # "choro" is also the verb "I cry": Eu Canto, Bebo e Choro por Voce is not a choro.
    found = {TITLE_WORDS[w] for i, w in enumerate(words) if w in TITLE_WORDS and not (w == 'choro' and i and words[i - 1] in CRY_WORDS)}
    return sorted(found)


def is_old_guard(text):
    return bool(re.search(r'\b(?:' + OLD_GUARD + r')\b', fold(text)))


def difficulty_raw(a):
    # shortcut: judges the busiest track, not a real fingering analysis; replace if a piano-part estimate is added.
    return a['maxTrackNps'] * a['notesPerOnset'] ** 0.5 + 0.02 * (a['high'] - a['low'])


def playing_score(a):
    # shortcut: note statistics only, no fingering model. Compares songs in this
    # catalog, so a level is relative to the collection, not a graded exam level.
    return (2.6 * math.log2(1 + a['peakNps']) + 0.8 * (a['partNotesPerOnset'] - 1) + 6 * a['leapRate']
            + 0.03 * a['partRange'] + 0.03 * a['chordSpan'])


def arrangement(a, source):
    if source == 'Weimar Solos' or a['maxPolyphony'] <= 1: return 'solo-line'
    return 'solo-piano' if a['pianoShare'] >= 0.8 else 'piano-led' if a['pianoShare'] >= 0.5 else 'band'


def bucket(sorted_values, v):
    import bisect
    return min(5, int(5 * bisect.bisect_left(sorted_values, v) / max(1, len(sorted_values))) + 1)


def kauffmann_index():
    rows, tags = {}, {}
    row = re.compile(r'<a href="(mpb_[^"/]+/[^"/]+\.html)"[^>]*><b>(.*?)</b></a>(.*?)</td>', re.S)
    for f in glob.glob(os.path.join(RAW, 'kauffmann', 'index', 'mpb_*.html')):
        t = open(f, 'rb').read().decode('utf-8', 'replace')
        for rel, title, comp in row.findall(t):
            rows[rel] = {'title': smart_title(clean(title)), 'composers': split_people(clean(comp))}
    for name, tag in [('musicas-juninas', 'festa-junina'), ('musicas-folcloricas', 'folclore'), ('musicas-carnavalescas', 'carnaval')]:
        p = os.path.join(RAW, 'kauffmann', 'index', name + '.html')
        if os.path.exists(p):
            for rel in re.findall(r'href="(mpb_[^"/]+/[^"/]+\.html)"', open(p, 'rb').read().decode('utf-8', 'replace')):
                tags.setdefault(rel, set()).add(tag)
    return rows, tags


def kauffmann_pages():
    # Maps each MIDI URL to its song page, for files whose name differs from the page.
    pages, by_url = {}, {}
    for f in glob.glob(os.path.join(RAW, 'kauffmann', 'songs', '*.html')):
        rel = os.path.basename(f).replace('__', '/', 1)
        t = open(f, 'rb').read().decode('utf-8', 'replace')
        title = re.search(r'<title>(.*?)</title>', t, re.S)
        credit = None
        if title:
            bits = clean(title.group(1)).split(' - ')
            credit = bits[1].strip() if len(bits) >= 3 else None
        comp = re.search(r'Composi.{1,20}</b>:?(.*?)</pre>', t, re.S)
        people = []
        if comp:
            for line in clean(comp.group(1).replace('\n', '|')).split('|'):
                name = re.sub(r'\(.*?\)', '', line).strip(' :')
                if name: people.append(name)
        blocks = re.findall(r'<pre class="B2"[^>]*>(.*?)</pre>', t, re.S)
        lyrics = max((re.sub(r'<[^>]+>', '', html.unescape(b)).strip() for b in blocks if 'Composi' not in b), key=len, default='')
        pages[rel] = {'credit': credit, 'composers': people, 'lyrics': lyrics}
        folder = rel.split('/')[0]
        for m in re.findall(r'href="(som/[^"]+\.mid)"', t, re.I):
            by_url[f'https://www.beakauffmann.com/{folder}/{m}'.lower()] = rel
    return pages, by_url


def perfessor_bill():
    # One listing row per song. A few rows link another song's file, so a row only
    # names a file when the two ids agree, and otherwise only if nothing better turns up.
    out, weak = {}, {}
    p = os.path.join(RAW, 'perfessorbill', 'pbmidiall.html')
    if not os.path.exists(p): return {}
    t = open(p, 'rb').read().decode('latin-1')
    row = re.compile(r'data-fn="pbmusic_([a-z]+)\d*\.shtml#([^"]+)".*?class="midFile" href="midi/([^"]+)".*?class="mp3File"[^>]*>(.*?)</div>(.*?)<br', re.S)
    for cat, fn, mid, title, comp in row.findall(t):
        rec = {'category': cat, 'title': clean(title), 'composers': split_people(clean(comp).lstrip('-â –')), 'fn': fn}
        name = mid.lower()
        if os.path.splitext(name)[0] == fn.lower(): out[name] = rec
        else: weak.setdefault(name, rec)
    for k, v in weak.items(): out.setdefault(k, v)
    years = {}
    for f in glob.glob(os.path.join(RAW, 'perfessorbill', 'pbmusic_*.html')):
        s = open(f, 'rb').read().decode('latin-1')
        for fn, comp in re.findall(r'id="([^"]+)">.*?class="songComp">(.*?)</div>', s, re.S):
            y = re.search(r'\b(1[789]\d\d|20\d\d)\b', comp)
            if y: years.setdefault(fn, int(y.group(1)))
    for r in out.values(): r['year'] = years.get(r['fn'])
    return out


def mckenzie():
    p = os.path.join(RAW, 'mckenzie', 'midi.html')
    if not os.path.exists(p): return {}
    t = open(p, 'rb').read().decode('utf-8', 'replace')
    return {os.path.basename(u).replace('%20', ' ').lower(): clean(n) for u, n in re.findall(r'<a[^>]+href="([^"]+\.mid)"[^>]*>(.*?)</a>', t, re.I | re.S)}


def export_for_app(db, lib):
    # catalog.json is what the app's Song Browser reads. Lyrics stay out of it.
    genres, people = {}, {}
    for sid, g, origin in db.execute('SELECT song_id, genre, origin FROM genres'):
        genres.setdefault(sid, []).append({'name': g, 'guessed': origin != SOURCE})
    for sid, name in db.execute('SELECT song_id, name FROM composers'):
        people.setdefault(sid, []).append(name)
    songs = {}
    q = '''SELECT id, file_path, title, performer, key_name, scale, bpm, time_signature, duration, arrangement,
           difficulty, difficulty_part, busyness, era, art_url, art_kind, hands FROM songs WHERE parse_error IS NULL'''
    art_dir = os.path.join(lib, '.art')
    for sid, path, title, performer, key, scale, bpm, meter, dur, arr, diff, part, busy, era, art, kind, hand_layout in db.execute(q).fetchall():
        if art and not art.startswith('https://'):
            target = os.path.join(art_dir, os.path.relpath(art, 'art'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            if not os.path.exists(target): shutil.copy2(os.path.join(DATA, art), target)
            art = '.art/' + os.path.relpath(art, 'art').replace(os.sep, '/')
        songs[path.replace(os.sep, '/')] = {
            'title': title, 'composers': people.get(sid, []), 'performer': performer, 'genres': genres.get(sid, []),
            'key': f'{key} {scale}' if key else None, 'bpm': bpm, 'meter': meter, 'duration': dur, 'arrangement': arr,
            'difficulty': diff, 'difficultyPart': part, 'hands': hand_layout, 'busyness': busy, 'classic': era == 'old-guard',
            'art': {'url': art, 'kind': kind} if art else None,
        }
    tmp = os.path.join(lib, 'catalog.json.part')
    json.dump({'version': 1, 'songs': songs}, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
    os.replace(tmp, os.path.join(lib, 'catalog.json'))


SCHEMA = '''
CREATE TABLE songs(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, source_url TEXT, file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL, size INTEGER, credit TEXT, performer TEXT, year INTEGER, era TEXT,
  key_name TEXT, scale TEXT, bpm INTEGER, time_signature TEXT, duration REAL, tracks INTEGER, notes INTEGER,
  low_note INTEGER, high_note INTEGER, notes_per_second REAL, max_track_nps REAL, notes_per_onset REAL,
  max_polyphony INTEGER, piano_share REAL, has_drums INTEGER, tempo_changes INTEGER, solo_line INTEGER,
  arrangement TEXT, busyness INTEGER, difficulty INTEGER, difficulty_part TEXT, listed INTEGER NOT NULL, parse_error TEXT, midi_copyright TEXT, lyrics TEXT,
  art_url TEXT, art_kind TEXT, art_source TEXT, art_match TEXT, art_album TEXT, art_artist TEXT,
  author_source TEXT, musicbrainz_work TEXT, hands TEXT, hand_engine_agrees REAL);
CREATE TABLE composers(song_id TEXT REFERENCES songs(id), name TEXT NOT NULL, PRIMARY KEY(song_id, name));
CREATE TABLE genres(song_id TEXT REFERENCES songs(id), genre TEXT NOT NULL, origin TEXT NOT NULL, PRIMARY KEY(song_id, genre));
CREATE INDEX genres_genre ON genres(genre);
CREATE INDEX composers_name ON composers(name);
CREATE VIRTUAL TABLE song_search USING fts5(song_id UNINDEXED, title, composers, lyrics, tokenize="unicode61 remove_diacritics 2");
'''


def build(lib):
    analysis = {}
    for line in open(os.path.join(DATA, 'analysis.jsonl'), encoding='utf-8'):
        r = json.loads(line)
        analysis[r['path']] = r  # later lines win after a re-analysis
    manifest = {}
    for r in csv.reader(open(os.path.join(lib, 'manifest.csv'), encoding='utf-8')):
        if len(r) > 3 and r[2] == 'ok': manifest[r[3]] = r
    rows, tags = kauffmann_index()
    pages, by_url = kauffmann_pages()
    pb, mck = perfessor_bill(), mckenzie()
    authors_path = os.path.join(DATA, 'authors.json')
    authors = json.load(open(authors_path, encoding='utf-8')) if os.path.exists(authors_path) else {}
    hands_path = os.path.join(DATA, 'hands.json')
    hands = json.load(open(hands_path, encoding='utf-8')) if os.path.exists(hands_path) else {}
    art_path = os.path.join(DATA, 'art.json')
    art = json.load(open(art_path, encoding='utf-8')) if os.path.exists(art_path) else {}
    for a in analysis.values():
        if 'error' not in a and a.get('maxTrackNps') is None: a['error'] = 'no usable duration or notes'
    raws = sorted(difficulty_raw(a) for a in analysis.values() if 'error' not in a)
    play_scores = sorted(playing_score(a) for a in analysis.values() if 'error' not in a and 'peakNps' in a)

    dbp = os.path.join(DATA, 'catalog.sqlite')
    tmp = dbp + '.tmp'
    if os.path.exists(tmp): os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript(SCHEMA)
    seen_ids = set()
    for path, a in sorted(analysis.items()):
        full = os.path.join(lib, path)
        if not os.path.exists(full): continue
        m = manifest.get(path)
        sha = hashlib.sha256(open(full, 'rb').read()).hexdigest()
        sid = sha[:16]
        if sid in seen_ids: continue
        seen_ids.add(sid)
        group, source = path.split(os.sep)[:2] if os.sep in path else path.replace('/', os.sep).split(os.sep)[:2]
        name = os.path.basename(path)
        stem = os.path.splitext(name)[0]
        url = m[1] if m else None
        title, composers, credit, performer, year, lyrics, era = None, [], None, None, None, None, None
        genres = {}
        listed = 1
        if source == 'Beatriz Kauffmann':
            folder = url.split('/')[3] if url else ''
            rel = by_url.get((url or '').lower())
            if not rel:
                bare = re.sub(r'-\d+$', '', stem.lower())
                rel = next((r for r in (f'{folder}/{stem.lower()}.html', f'{folder}/{bare}.html') if r in rows), None)
            row, page = rows.get(rel, {}), pages.get(rel, {})
            title = row.get('title') or smart_title(stem.replace('-', ' '))
            composers = page.get('composers') or row.get('composers') or []
            credit, lyrics = page.get('credit'), page.get('lyrics')
            for t in sorted(tags.get(rel, ())): genres[t] = SOURCE
            for g in title_genres(title): genres.setdefault(g, TITLE)
            people = ' ; '.join(composers + [credit or ''])
            for g in composer_genres(people): genres.setdefault(g, COMPOSER)
            if is_old_guard(people): era = 'old-guard'
            if not genres: genres['brazilian-popular'] = DEFAULT
        elif source == 'Perfessor Bill':
            r = pb.get(name.lower(), {})
            title = r.get('title') or stem
            composers, year = r.get('composers', []), r.get('year')
            genres[PB_GENRE.get(r.get('category'), 'early-popular')] = SOURCE
            if re.search(STRIDE, fold(' '.join(composers))): genres['stride'] = COMPOSER
        elif source == 'Doug McKenzie':
            title = mck.get(name.lower()) or camel_words(stem)
            performer = 'Doug McKenzie'
            genres['jazz'] = SOURCE
        elif source == 'Weimar Solos':
            performer, title = weimar_meta(name)
            genres['jazz'] = SOURCE
            listed = 0  # single-line solos, no accompaniment
        else:
            title = BUTTERS.get(stem.lower(), smart_title(stem))
            genres[GROUP_GENRE.get(group, 'unknown')] = SOURCE
        found = authors.get(sid, {}) if not composers else {}
        fix = re.sub(r'\s*[\(\[].*$', '', title or '').strip().lower()
        if source == 'Doug McKenzie' and fix in MCKENZIE_AUTHORS:
            found = {'people': MCKENZIE_AUTHORS[fix], 'work': None} if MCKENZIE_AUTHORS[fix] else {}
        composers = composers or found.get('people', [])
        err = a.get('error')
        ok = not err
        k = a.get('keyRaw') or {}
        kind = arrangement(a, source) if ok else None
        pic = art.get(sid, {})
        hand = hands.get(path, {})
        db.execute('INSERT INTO songs VALUES(' + ','.join('?' * 46) + ')', (
            sid, title, source, url, path, sha, a['size'], credit, performer, year, era,
            KEYS[k['semitone']] if 'semitone' in k else None, ('minor' if k.get('isMinor') else 'major') if k else None,
            a.get('bpm'), a.get('timeSignature'), a.get('duration'), a.get('trackCount'), a.get('notes'), a.get('low'),
            a.get('high'), a.get('nps'), a.get('maxTrackNps'), a.get('notesPerOnset'), a.get('maxPolyphony'),
            a.get('pianoShare'), int(a.get('hasDrums', False)), a.get('tempoChanges'),
            int(ok and a['maxPolyphony'] <= 1) or int(source == 'Weimar Solos'),
            kind, bucket(raws, difficulty_raw(a)) if ok else None,
            bucket(play_scores, playing_score(a)) if ok and 'peakNps' in a else None, a.get('partKind'), listed if ok else 0, err, a.get('midiCopyright'), lyrics or None,
            pic.get('url'), pic.get('kind'), pic.get('source'), pic.get('match'), pic.get('album'), pic.get('artist'),
            'musicbrainz' if found else 'source' if composers else None, found.get('work'),
            hand.get('kind'), hand.get('engineAgrees')))
        for c in dict.fromkeys(composers):
            db.execute('INSERT INTO composers VALUES(?,?)', (sid, c))
        for g, o in genres.items():
            db.execute('INSERT INTO genres VALUES(?,?,?)', (sid, g, o))
        db.execute('INSERT INTO song_search VALUES(?,?,?,?)', (sid, title, ' ; '.join(composers + [credit or '', performer or '']), lyrics or ''))
    db.commit()
    export_for_app(db, lib)
    db.close()
    for attempt in range(60):  # Windows refuses while another job has the old file open
        try:
            os.replace(tmp, dbp)
            return dbp
        except PermissionError:
            if attempt == 59: raise
            time.sleep(5)


assert fold('Forró São João') == 'forro sao joao'
assert title_genres('Forró em Caruaru') == ['forro'] and title_genres('Sambadrome') == []
assert split_people('Humberto Teixeira e Luiz Gonzaga') == ['Humberto Teixeira', 'Luiz Gonzaga']
assert composer_genres('Humberto Teixeira ; Luiz Gonzaga') == ['forro']
assert composer_genres('Sinhozinho') == [] and is_old_guard('Noel Rosa') and not is_old_guard('Lulu Santos')
assert weimar_meta('ArtPepper_InAMellowTone_FINAL.mid') == ('Art Pepper', 'In A Mellow Tone')
assert smart_title('FORRÓ EM CARUARU') == 'Forró em Caruaru'
assert title_genres('Eu Canto, Bebo e Choro por Voce') == [] and title_genres('Choro Negro') == ['choro']
assert arrangement({'maxPolyphony': 6, 'pianoShare': 0.0}, 'Beatriz Kauffmann') == 'band'
assert arrangement({'maxPolyphony': 6, 'pianoShare': 1}, 'Doug McKenzie') == 'solo-piano'
assert arrangement({'maxPolyphony': 1, 'pianoShare': 1}, 'Beatriz Kauffmann') == 'solo-line'
_easy = {'peakNps': 2, 'partNotesPerOnset': 1, 'leapRate': 0, 'partRange': 12, 'chordSpan': 0}
_hard = {'peakNps': 8, 'partNotesPerOnset': 2, 'leapRate': 0.3, 'partRange': 60, 'chordSpan': 24}
assert playing_score(_easy) < playing_score(_hard)
assert bucket([1, 2, 3, 4, 5], 1) == 1 and bucket([1, 2, 3, 4, 5], 5) == 5
print(build(sys.argv[1]))
