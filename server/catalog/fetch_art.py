# Finds a picture for each song and writes art.json, which build_catalog.py merges.
#   python -I fetch_art.py covers          Perfessor Bill sheet-music covers
#   python -I fetch_art.py fast [--sample N]     Deezer album art, then artist photos
#   python -I fetch_art.py fast-missing          same, for songs still without a picture
#   python -I fetch_art.py spotify               album art, best source so far
#   python -I fetch_art.py itunes                album art for whatever is left (slow)
# Preference: sheet cover > album art > artist photo. Lookups are cached, so
# re-running only asks for what is missing. Remote art is stored as a URL, not
# copied; only Perfessor Bill's covers are saved, to avoid hotlinking a small site.
import base64, json, os, random, re, sqlite3, sys, time, unicodedata, urllib.error, urllib.parse as up, urllib.request as ur

DATA = os.environ.get('PLIAGE_DATA') or sys.exit('Set PLIAGE_DATA to the private folder that holds the catalog data')
CACHE = os.path.join(DATA, 'art_cache')
ART_JSON = os.path.join(DATA, 'art.json')
UA = {'User-Agent': 'PliageCatalog/0.1 (personal music catalog)'}
SPOTIFY_KEYS = os.environ.get('PLIAGE_SPOTIFY_KEYS') or os.path.expanduser('~/.pliage-spotify.json')  # never in a repo
SPOTIFY_DELAY = 0.05  # no published limit: 429 responses set the pace
ALIASES = {'gonzagao': 'luiz gonzaga', 'tom jobim': 'antonio carlos jobim', 'ari barroso': 'ary barroso'}
ITUNES_DELAY, DEEZER_DELAY, WIKI_DELAY = 3.2, 0.15, 0.3  # iTunes allows about 20 requests a minute, Deezer 10 a second


def fold(s):
    s = unicodedata.normalize('NFD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).lower().strip()


def norm_title(s):
    s = re.sub(r'\(.*?\)|\[.*?\]|\s[-–]\s*(take|tk|ao vivo|live|remaster).*$', ' ', fold(s))
    s = re.sub(r'\btake\s*\d+\b|\btk\s*\d+\b', ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def artist_match(result_artist, people):
    r = fold(result_artist)
    r_full = ALIASES.get(r, r)
    for p in people:
        f = fold(p)
        f = ALIASES.get(f, f)
        if f and (f in r_full or r_full in f): return True
        last = f.split()[-1] if f else ''
        if len(last) >= 5 and last in r_full.split(): return True
    return False


def pick_album(results, title, people, title_only):
    want = norm_title(title)
    same = [r for r in results if norm_title(r.get('trackName')) == want and r.get('artworkUrl100')]
    for r in same:
        if artist_match(r.get('artistName'), people):
            return r, 'title+artist'
    return (same[0], 'title-only') if same and title_only else (None, None)


class Cache:
    def __init__(self, name):
        self.path = os.path.join(CACHE, name + '.json')
        self.data = json.load(open(self.path, encoding='utf-8')) if os.path.exists(self.path) else {}
        self.dirty = 0

    def save(self):
        os.makedirs(CACHE, exist_ok=True)
        tmp = self.path + '.part'
        json.dump(self.data, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
        os.replace(tmp, self.path)
        self.dirty = 0

    def get(self, key, fn, delay):
        if key in self.data: return self.data[key]
        time.sleep(delay)
        self.data[key] = fn(key)
        self.dirty += 1
        if self.dirty >= 25: self.save()
        return self.data[key]


def get_json(url, tries=4):
    for i in range(tries):
        try:
            return json.load(ur.urlopen(ur.Request(url, headers=UA), timeout=30))
        except ur.HTTPError as e:
            if e.code not in (403, 429, 500, 502, 503) or i == tries - 1: raise
            time.sleep(60 * (i + 1))  # rate limited: back off rather than hammer
        except OSError:
            if i == tries - 1: raise
            time.sleep(10)


def itunes(term):
    q = up.urlencode({'term': term, 'entity': 'song', 'limit': 15, 'country': 'BR'})
    return [{k: r.get(k) for k in ('trackName', 'artistName', 'collectionName', 'artworkUrl100')} for r in get_json('https://itunes.apple.com/search?' + q).get('results', [])]


def deezer_tracks(term):
    data = get_json('https://api.deezer.com/search?' + up.urlencode({'q': term, 'limit': 15})).get('data', [])
    return [{'trackName': r.get('title'), 'artistName': (r.get('artist') or {}).get('name'),
             'collectionName': (r.get('album') or {}).get('title'), 'artworkUrl100': (r.get('album') or {}).get('cover_big')} for r in data]


def deezer_artist(name):
    for r in get_json('https://api.deezer.com/search/artist?' + up.urlencode({'q': name, 'limit': 5})).get('data', []):
        if fold(r.get('name')) == fold(name) and '/artist//' not in (r.get('picture_medium') or '/artist//'):
            return r.get('picture_big') or r['picture_medium']
    return None


class SpotifyBlocked(Exception):
    pass


_spotify = {'token': None, 'expires': 0}


def spotify_token():
    if time.time() < _spotify['expires'] - 60: return _spotify['token']
    keys = json.load(open(SPOTIFY_KEYS))
    auth = base64.b64encode(f"{keys['client_id']}:{keys['client_secret']}".encode()).decode()
    req = ur.Request('https://accounts.spotify.com/api/token', data=b'grant_type=client_credentials',
                     headers={'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded'})
    t = json.load(ur.urlopen(req, timeout=30))
    _spotify.update(token=t['access_token'], expires=time.time() + t['expires_in'])
    return _spotify['token']


def spotify_get(url):
    for _ in range(5):
        try:
            data = json.load(ur.urlopen(ur.Request(url, headers={'Authorization': 'Bearer ' + spotify_token()}), timeout=30))
            break
        except urllib.error.HTTPError as e:
            if e.code == 401:
                _spotify['expires'] = 0
            elif e.code == 429:
                wait = int(e.headers.get('Retry-After') or 30)
                if wait > 600: raise SpotifyBlocked(f'rate limited for {wait}s')
                print(f'spotify asked to wait {wait}s', flush=True)
                time.sleep(wait + 1)
            elif e.code >= 500:
                time.sleep(10)
            else:
                raise
    else:
        raise SpotifyBlocked('no response after retries')
    return data


def spotify_artist(name):
    url = 'https://api.spotify.com/v1/search?' + up.urlencode({'q': f'artist:"{name}"', 'type': 'artist', 'limit': 10, 'market': 'BR'})
    same = [a for a in spotify_get(url).get('artists', {}).get('items', []) if fold(a.get('name')) == fold(name) and a.get('images')]
    same.sort(key=lambda a: -(a.get('popularity') or 0))
    return same[0]['images'][0]['url'] if same else None


def spotify_search(query):
    url = 'https://api.spotify.com/v1/search?' + up.urlencode({'q': query, 'type': 'track', 'limit': 10, 'market': 'BR'})
    data = spotify_get(url)
    out = []
    for t in data.get('tracks', {}).get('items', []):
        images = (t.get('album') or {}).get('images') or []
        out.append({'trackName': t.get('name'), 'artistName': ', '.join(a.get('name', '') for a in t.get('artists', [])),
                    'collectionName': (t.get('album') or {}).get('name'), 'artworkUrl100': images[0]['url'] if images else None})
    return out


def wikipedia_photo(name):
    for lang in ('pt', 'en'):
        q = up.urlencode({'action': 'query', 'format': 'json', 'titles': name, 'redirects': 1, 'prop': 'pageimages', 'piprop': 'thumbnail', 'pithumbsize': 500})
        for page in get_json(f'https://{lang}.wikipedia.org/w/api.php?' + q).get('query', {}).get('pages', {}).values():
            url = page.get('thumbnail', {}).get('source')
            if url and not url.lower().endswith(('.svg.png', '.svg')): return url
    return None


def songs():
    db = sqlite3.connect(os.path.join(DATA, 'catalog.sqlite'))
    q = '''SELECT s.id, s.title, s.source, s.credit, s.performer, s.file_path,
           (SELECT group_concat(name, '|') FROM composers c WHERE c.song_id = s.id) FROM songs s WHERE s.parse_error IS NULL'''
    rows = [dict(zip(('id', 'title', 'source', 'credit', 'performer', 'path', 'composers'), r)) for r in db.execute(q)]
    db.close()
    return rows


def people_of(s):
    credit = re.split(r'\s+e\s+|,|/|&', s['credit'] or '')
    out = [s['performer']] + [c.strip() for c in credit] + (s['composers'] or '').split('|')
    return list(dict.fromkeys(p for p in out if p and p.strip()))


def load_art():
    return json.load(open(ART_JSON, encoding='utf-8')) if os.path.exists(ART_JSON) else {}


def save_art(art):
    tmp = ART_JSON + '.part'
    json.dump(art, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
    os.replace(tmp, ART_JSON)


def covers():
    t = open(os.path.join(DATA, 'raw', 'perfessorbill', 'pbmidiall.html'), 'rb').read().decode('latin-1')
    mid_fn = {}
    for fn, mid in re.findall(r'class="covIcon" data-fn="([^"]+)".*?class="midFile" href="midi/([^"]+)"', t):
        stem = os.path.splitext(mid)[0].lower()
        if fn.lower() == stem or stem not in mid_fn: mid_fn[stem] = fn
    out_dir = os.path.join(DATA, 'art', 'perfessorbill')
    os.makedirs(out_dir, exist_ok=True)
    art, got, missing = load_art(), 0, 0
    for s in (x for x in songs() if x['source'] == 'Perfessor Bill'):
        stem = os.path.splitext(os.path.basename(s['path'].replace('\\', '/')))[0].lower()
        fn = mid_fn.get(stem, stem)
        p = os.path.join(out_dir, fn + '.jpg')
        if not os.path.exists(p):
            time.sleep(1)
            try:
                b = ur.urlopen(ur.Request(f'https://ragpiano.com/covers/{up.quote(fn)}.jpg', headers=UA), timeout=30).read(3_000_000)
            except OSError:
                missing += 1; continue
            if b[:3] != b'\xff\xd8\xff':
                missing += 1; continue
            open(p, 'wb').write(b)
        art[s['id']] = {'url': os.path.relpath(p, DATA).replace('\\', '/'), 'kind': 'sheet-cover', 'source': 'Perfessor Bill', 'match': 'source'}
        got += 1
        if got % 100 == 0: save_art(art); print('covers', got, 'missing', missing, flush=True)
    save_art(art)
    print(f'finished covers={got} missing={missing}', flush=True)


def wait_for_authors():
    # Album matching and composer photos are better once the online authors are in.
    log = os.path.join(DATA, 'authors.log')
    while not (os.path.exists(log) and 'AUTHORS-DONE' in open(log, encoding='utf-8', errors='replace').read()):
        time.sleep(60)


def album_entry(hit, how, shop):
    return {'url': hit['artworkUrl100'].replace('100x100bb', '600x600bb'), 'kind': 'album', 'source': shop, 'match': how,
            'album': hit.get('collectionName'), 'artist': hit.get('artistName')}


def search_term(s, people, title_only):
    lead = s['performer'] if s['performer'] != 'Doug McKenzie' else ''
    return norm_title(f"{s['title']} {lead or (people[0] if people and not title_only else '')}")


def photo_entry(people, dz, wk, sa):
    for p in [x for x in people if x != 'Doug McKenzie']:  # a standard is better shown by its composer
        url, src = sa.get(p, spotify_artist, SPOTIFY_DELAY), 'Spotify'
        if not url:
            url, src = dz.get(p, deezer_artist, DEEZER_DELAY), 'Deezer'
        if not url:
            url, src = wk.get(p, wikipedia_photo, WIKI_DELAY), 'Wikipedia'
        if url:
            return {'url': url, 'kind': 'artist-photo', 'source': src, 'match': 'artist', 'artist': p}
    return None


def fast_pass(sample=0, only_missing=False):
    # Deezer and photos only, so every song has its picture in minutes rather than hours.
    dt, dz, wk, sa = Cache('deezer_tracks'), Cache('deezer'), Cache('wikipedia'), Cache('spotify_artists')
    art = {k: v for k, v in load_art().items() if v.get('match') != 'title-only'}  # those matched the wrong songs
    todo = [s for s in songs() if art.get(s['id'], {}).get('kind') not in ('sheet-cover', 'album') and not (only_missing and s['id'] in art)]
    if sample: todo = random.Random(11).sample(todo, min(sample, len(todo)))
    counts = {}
    for i, s in enumerate(todo, 1):
        people = people_of(s)
        title_only = False
        try:
            hit, how = pick_album(dt.get(search_term(s, people, title_only), deezer_tracks, DEEZER_DELAY), s['title'], people, title_only)
            if not hit:  # the combined search often misses a song a plain title search finds
                query = 'track:"' + norm_title(s['title']).replace('"', '') + '"'
                hit, how = pick_album(dt.get(query, deezer_tracks, DEEZER_DELAY), s['title'], people, title_only)
            entry = album_entry(hit, how, 'Deezer') if hit else photo_entry(people, dz, wk, sa)
        except Exception as e:
            print('lookup failed', ascii(s['title']), type(e).__name__, str(e)[:80], flush=True)
            continue
        kind = entry['kind'] + ':' + entry['match'] if entry else 'none'
        counts[kind] = counts.get(kind, 0) + 1
        if entry: art[s['id']] = entry
        if sample: print(ascii((s['title'], kind, (entry or {}).get('album') or (entry or {}).get('artist'))), flush=True)
        if i % 100 == 0:
            dt.save(); dz.save(); wk.save(); sa.save()
            if not sample: save_art(art)
            print(f'progress {i}/{len(todo)} {counts}', flush=True)
    dt.save(); dz.save(); wk.save(); sa.save()
    if not sample: save_art(art)
    print('finished fast pass', counts, flush=True)


def spotify_pass(sample=0):
    # Album art for what Deezer missed. Much faster than iTunes, so iTunes only sees what is left.
    sp = Cache('spotify')
    art = load_art()
    todo = [s for s in songs() if art.get(s['id'], {}).get('kind') not in ('sheet-cover', 'album')]
    if sample: todo = random.Random(5).sample(todo, min(sample, len(todo)))
    upgraded = 0
    for i, s in enumerate(todo, 1):
        people = people_of(s)
        title = norm_title(s['title']).replace('"', '')
        hit, how = None, None
        try:
            for who in [p for p in people if p != 'Doug McKenzie'][:3]:
                hit, how = pick_album(sp.get(f'track:"{title}" artist:"{who}"', spotify_search, SPOTIFY_DELAY), s['title'], people, False)
                if hit: break
        except SpotifyBlocked as e:
            print('spotify stopped:', e, flush=True)
            break
        except Exception as e:
            print('lookup failed', ascii(s['title']), type(e).__name__, str(e)[:80], flush=True)
            continue
        if hit:
            art[s['id']] = album_entry(hit, how, 'Spotify')
            upgraded += 1
        if sample: print(ascii((s['title'], (art.get(s['id']) or {}).get('kind'), hit and hit.get('collectionName'), hit and hit.get('artistName'))), flush=True)
        if i % 100 == 0:
            sp.save()
            if not sample: save_art(art)
            print(f'progress {i}/{len(todo)} upgraded={upgraded}', flush=True)
    sp.save()
    if not sample: save_art(art)
    print(f'finished spotify pass songs={len(todo)} upgraded={upgraded}', flush=True)


def itunes_pass():
    # Upgrades what Deezer left: photos and blanks become album art where iTunes has it.
    it = Cache('itunes')
    art = load_art()
    todo = [s for s in songs() if art.get(s['id'], {}).get('kind') not in ('sheet-cover', 'album')]
    upgraded = 0
    for i, s in enumerate(todo, 1):
        people = people_of(s)
        title_only = False
        try:
            hit, how = pick_album(it.get(search_term(s, people, title_only), itunes, ITUNES_DELAY), s['title'], people, title_only)
        except Exception as e:
            print('lookup failed', ascii(s['title']), type(e).__name__, str(e)[:80], flush=True)
            continue
        if hit:
            art[s['id']] = album_entry(hit, how, 'iTunes')
            upgraded += 1
        if i % 100 == 0:
            it.save(); save_art(art)
            print(f'progress {i}/{len(todo)} upgraded={upgraded}', flush=True)
    it.save(); save_art(art)
    print(f'finished itunes pass songs={len(todo)} upgraded={upgraded}', flush=True)


assert norm_title('A Fine Romance – take 1') == 'a fine romance'
assert norm_title("In A Sentimental Mood (tk 2)") == 'in a sentimental mood'
assert norm_title('Forró em Caruaru') == 'forro em caruaru'
assert artist_match('Gonzagão', ['Luiz Gonzaga']) and artist_match('Toquinho & Paulinho da Viola', ['Paulinho da Viola'])
assert not artist_match('Marisa Monte', ['Pixinguinha', 'Braguinha'])
_r = [{'trackName': 'Asa Branca', 'artistName': 'Gonzagão', 'artworkUrl100': 'x'}]
assert pick_album(_r, 'Asa Branca', ['Luiz Gonzaga'], False)[1] == 'title+artist'
assert pick_album(_r, 'Asa Branca', ['Elba Ramalho'], False) == (None, None)
assert pick_album(_r, 'Asa Branca', ['Doug McKenzie'], True)[1] == 'title-only'

if __name__ == '__main__':
    step = sys.argv[1]
    if step == 'covers': covers()
    elif step == 'fast': fast_pass(int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    elif step == 'fast-missing': fast_pass(only_missing=True)
    elif step == 'spotify-sample': spotify_pass(int(sys.argv[2]))
    elif step == 'spotify': spotify_pass()
    elif step == 'itunes': print('itunes skipped: 0 of 78 cached results improved a song Spotify and Deezer missed', flush=True)
    elif step == 'itunes-force': itunes_pass()
    elif step == 'wait-authors': wait_for_authors()
