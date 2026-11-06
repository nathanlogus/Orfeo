# Rechecks Weimar authors against the performer's own recording: a pop hit can
# have more recordings than the standard of the same name, so the title alone
# credited "Work" to Rihanna. Blank beats wrong, so an author stays only if a
# recording confirms it or the performer is among the credited writers.
import json, os, sqlite3, sys, urllib.parse as up

DATA = os.environ.get('PLIAGE_DATA') or sys.exit('Set PLIAGE_DATA to the private folder that holds the catalog data')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I leaves the script's folder off the path
from fetch_authors import ROLES, get, norm, query_title

ROOT = 'https://musicbrainz.org/ws/2/'
CACHE = os.path.join(DATA, 'art_cache', 'musicbrainz_recordings.json')
OUT = os.path.join(DATA, 'authors.json')


def recording_writers(performer, title):
    q = f'recording:"{query_title(title)}" AND artist:"{performer}"'
    found = get(ROOT + 'recording/?' + up.urlencode({'query': q, 'fmt': 'json', 'limit': 10})).get('recordings', [])
    for r in [r for r in found if norm(r.get('title')) == norm(query_title(title))][:3]:
        rels = get(f"{ROOT}recording/{r['id']}?inc=work-rels+work-level-rels+artist-rels&fmt=json").get('relations', [])
        for w in [x['work'] for x in rels if x.get('work')]:
            full = get(f"{ROOT}work/{w['id']}?inc=artist-rels&fmt=json").get('relations', [])
            people = list(dict.fromkeys(x['artist']['name'] for x in full if x.get('type') in ROLES and x.get('artist')))
            if people: return {'people': people, 'work': w['id']}
    return None


def main():
    db = sqlite3.connect(os.path.join(DATA, 'catalog.sqlite'))
    rows = db.execute("SELECT id, title, performer FROM songs WHERE source = 'Weimar Solos' AND parse_error IS NULL").fetchall()
    db.close()
    authors = json.load(open(OUT, encoding='utf-8'))
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    confirmed = changed = dropped = kept = 0
    for i, (sid, title, performer) in enumerate(rows, 1):
        key = f'{performer}|{title}'
        if key not in cache:
            try:
                cache[key] = recording_writers(performer, title)
            except Exception as e:
                print('lookup failed', ascii(title), type(e).__name__, str(e)[:80], flush=True)
                continue
        hit, old = cache[key], authors.get(sid)
        if hit:
            same = old and set(map(norm, old['people'])) & set(map(norm, hit['people']))
            confirmed += bool(same); changed += not same
            if not same: print('changed', ascii((title, performer, old and old['people'], hit['people'])), flush=True)
            authors[sid] = {'people': hit['people'], 'work': hit['work'], 'recordings': (old or {}).get('recordings', 0)}
        elif old:
            if any(norm(p) == norm(performer) for p in old['people']): kept += 1
            else:
                dropped += 1
                del authors[sid]
        if i % 25 == 0:
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'progress {i}/{len(rows)} confirmed={confirmed} changed={changed} dropped={dropped} kept={kept}', flush=True)
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    tmp = OUT + '.part'
    json.dump(authors, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
    os.replace(tmp, OUT)
    print(f'finished confirmed={confirmed} changed={changed} dropped={dropped} kept={kept} total={len(authors)}', flush=True)


if __name__ == '__main__':
    main()
