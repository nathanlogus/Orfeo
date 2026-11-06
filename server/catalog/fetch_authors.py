# Looks up composers on MusicBrainz for songs whose source doesn't name them, and
# writes authors.json, which build_catalog.py merges. Lookups are cached by title.
# Run: python -I fetch_authors.py [--sample N]
import json, os, random, re, sqlite3, sys, time, unicodedata, urllib.error, urllib.parse as up, urllib.request as ur

DATA = os.environ.get('PLIAGE_DATA') or sys.exit('Set PLIAGE_DATA to the private folder that holds the catalog data')
CACHE = os.path.join(DATA, 'art_cache', 'musicbrainz.json')
OUT = os.path.join(DATA, 'authors.json')
UA = {'User-Agent': 'PliageCatalog/0.1 ( personal music catalog )'}
API = 'https://musicbrainz.org/ws/2/work/'
DELAY = 1.2  # MusicBrainz allows one request a second
MIN_RECORDINGS = 5  # below this a same-named obscure song is too likely
ROLES = ('composer', 'lyricist', 'writer')
NOT_MUSIC = {'Prose', 'Audio drama', 'Poem', 'Play', 'Incidental music'}  # audiobooks share song titles


def fold(s):
    s = unicodedata.normalize('NFD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).lower()


def norm(s):
    s = re.sub(r"['’`]", '', fold(s))
    s = re.sub(r'^(the|a|an) ', '', s.strip())
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def query_title(title):
    t = re.sub(r'\(.*?\)|\[.*?\]|\s[-–]\s*(take|tk)\b.*$|\s+take\s*\d+\s*$|\s+\d+\s*$', ' ', title, flags=re.I)
    return re.sub(r'[….]+$', '', re.sub(r'\s+', ' ', t)).strip(' -–')


def get(url, tries=6):
    for i in range(tries):
        time.sleep(DELAY)
        try:
            return json.load(ur.urlopen(ur.Request(url, headers=UA), timeout=40))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or i == tries - 1: raise
            time.sleep(5 * (i + 1))
        except OSError:
            if i == tries - 1: raise
            time.sleep(10)


def choose(candidates, performer):
    # The famous song has by far the most recordings; an obscure namesake only
    # counts if the performer we already know is credited on it.
    best = None
    for c in sorted(candidates, key=lambda c: (-c['recordings'], -len(c['people']))):
        if not c['people']: continue
        if c['recordings'] >= MIN_RECORDINGS:
            best = c; break
        if performer and any(norm(performer) == norm(p) for p in c['people']):
            best = c; break
    return best


def lookup(title):
    q = query_title(title).replace('"', '')
    if not q: return []
    found = get(API + '?' + up.urlencode({'query': f'work:"{q}"', 'fmt': 'json', 'limit': 15})).get('works', [])
    if not any(norm(w['title']) == norm(q) for w in found):
        found = get(API + '?' + up.urlencode({'query': 'work:(' + re.sub(r'[^\w\s]', ' ', q) + ')', 'fmt': 'json', 'limit': 15})).get('works', [])
    out = []
    for w in [w for w in found if norm(w['title']) == norm(q) and w.get('type') not in NOT_MUSIC][:4]:
        rels = get(f"{API}{w['id']}?inc=artist-rels+recording-rels&fmt=json").get('relations', [])
        people = list(dict.fromkeys(r['artist']['name'] for r in rels if r.get('type') in ROLES and r.get('artist')))
        out.append({'id': w['id'], 'title': w['title'], 'people': people, 'recordings': sum(1 for r in rels if r.get('recording'))})
    return out


def main():
    sample = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    db = sqlite3.connect(os.path.join(DATA, 'catalog.sqlite'))
    rows = db.execute('''SELECT id, title, performer FROM songs WHERE parse_error IS NULL
                         AND id NOT IN (SELECT song_id FROM composers)''').fetchall()
    db.close()
    if sample: rows = random.Random(3).sample(rows, min(sample, len(rows)))
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    result, failed = {}, 0
    print('songs without an author', len(rows), flush=True)
    for i, (sid, title, performer) in enumerate(rows, 1):
        key = norm(query_title(title))
        if key not in cache:
            try:
                cache[key] = lookup(title)
            except Exception as e:
                failed += 1
                print('lookup failed', ascii(title), type(e).__name__, str(e)[:80], flush=True)
                continue
        hit = choose(cache[key], None if performer == 'Doug McKenzie' else performer)
        if hit: result[sid] = {'people': hit['people'], 'work': hit['id'], 'recordings': hit['recordings']}
        if sample: print(ascii((title, hit and hit['people'], hit and hit['recordings'])), flush=True)
        if i % 50 == 0:
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'progress {i}/{len(rows)} found={len(result)} failed={failed}', flush=True)
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    if not sample:
        json.dump(result, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'finished songs={len(rows)} found={len(result)} failed={failed}', flush=True)


assert norm("'Round Midnight") == norm('Round Midnight') and norm("Don't Blame Me") == 'dont blame me'
assert query_title('A Fine Romance – take 1') == 'A Fine Romance' and query_title('In A Sentimental Mood (tk 2)') == 'In A Sentimental Mood'
assert query_title('Look For The Silver Lining [M]') == 'Look For The Silver Lining'
_a = {'people': ['Jerome Kern'], 'recordings': 900}
_b = {'people': ['Nobody'], 'recordings': 2}
assert choose([_b, _a], None) is _a and choose([_b], None) is None and choose([_b], 'Nobody') is _b

if __name__ == '__main__':
    main()
