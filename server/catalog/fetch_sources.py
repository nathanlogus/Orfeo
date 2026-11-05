# Caches the source pages the catalog is built from. Safe to re-run: pages
# already on disk are skipped. Saved HTML is untrusted data, only ever parsed
# with regexes in build_catalog.py.
import os, re, sys, time, urllib.error, urllib.request as ur

DATA = os.environ.get('ORFEO_DATA') or sys.exit('Set ORFEO_DATA to the private folder that holds the catalog data')
RAW = os.path.join(DATA, 'raw')
BASE = 'https://www.beakauffmann.com/'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
DELAY = 1.0
MAX_DELAY = 8.0
BUSY = {429, 500, 502, 503, 504, 508}  # 508 is HostGator's resource-limit error
LETTERS = ['0-9'] + list('abcdefghijklmnopqrstuvwxyz')
LISTS = ['musicas-juninas', 'musicas-folcloricas', 'musicas-carnavalescas']
SONG = re.compile(r'href="(mpb_[^/"]+/[^"/]+\.html)"')


def cached(url, path):
    if os.path.exists(path):
        return open(path, 'rb').read()
    time.sleep(DELAY)
    body = ur.urlopen(ur.Request(url, headers=UA), timeout=40).read(3_000_000)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.part'
    with open(tmp, 'wb') as f:
        f.write(body)
    os.replace(tmp, path)
    return body


def main():
    songs = set()
    for name in [f'mpb_{c}' for c in LETTERS] + LISTS:
        html = cached(f'{BASE}{name}.html', os.path.join(RAW, 'kauffmann', 'index', name + '.html'))
        songs |= set(SONG.findall(html.decode('latin-1')))
    for url, name in [('https://ragpiano.com/pbmidiall.shtml', 'pbmidiall.html'),
                      ('https://ragpiano.com/pbmusic_songs2.shtml', 'pbmusic_songs2.html')]:
        try:
            cached(url, os.path.join(RAW, 'perfessorbill', name))
        except Exception as e:
            print('page failed', url, e, flush=True)

    todo = sorted(songs)
    print('song pages', len(todo), flush=True)
    failed = 0
    global DELAY
    for i, rel in enumerate(todo, 1):
        path = os.path.join(RAW, 'kauffmann', 'songs', rel.replace('/', '__'))
        for attempt in range(3):
            try:
                cached(BASE + rel, path)
                break
            except urllib.error.HTTPError as e:
                if e.code not in BUSY or attempt == 2:
                    failed += 1
                    print('page failed', rel, e, flush=True)
                    break
                # The host is struggling: stop for two minutes and stay slower from here on.
                DELAY = min(MAX_DELAY, DELAY * 2)
                print(f'server busy ({e.code}), pausing; delay now {DELAY}s', flush=True)
                time.sleep(120)
            except Exception as e:
                failed += 1
                print('page failed', rel, e, flush=True)
                break
        if i % 250 == 0:
            print(f'progress {i}/{len(todo)} failed={failed}', flush=True)
    print(f'finished pages={len(todo)} failed={failed}', flush=True)


assert SONG.findall('<a href="mpb_a/asa-branca.html" class="BB">') == ['mpb_a/asa-branca.html']
main()
