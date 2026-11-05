# First download: fetches the song sources into a library folder, slowly, and keeps only
# real MIDI files. Safe to re-run. Run: python -I download_songs.py <library>
import csv, hashlib, html, io, os, re, sys, threading, time, urllib.parse as up, urllib.request as ur, zipfile

OUT = sys.argv[1]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
DELAY, MAX_FILE, MAX_ZIP, MAX_PAGES = 1.0, 5_000_000, 30_000_000, 20000
LINK = re.compile(r'''(?:href|src)\s*=\s*["']([^"'<>]+)["']|(https?://[^\s"'<>]+.(?:mid|midi|kar|zip)\b)''', re.I)
FILE = re.compile(r'\.(mid|midi|kar|zip)$', re.I)
SKIP = re.compile(r'contato|guestbook|recommended|links\.html|signbook|\.php', re.I)
lock, seen = threading.Lock(), {}
done = set()
log_path = os.path.join(OUT, 'manifest.csv')

def safe_name(url_or_name):
    n = up.unquote(url_or_name.split('?')[0].rstrip('/').split('/')[-1].replace(chr(92), '/').split('/')[-1])
    n = re.sub(r'[<>:"/\|?*\x00-\x1f]', '_', n).strip(' .')
    return n[:120] or 'file'

def is_midi(b):
    return b[:4] == b'MThd' or (b[:4] == b'RIFF' and b[8:12] == b'RMID')

assert safe_name('http://x/a%20b.mid?y=1') == 'a b.mid'
assert safe_name(r'..\..\evil.mid') == 'evil.mid'
assert is_midi(b'MThd....') and not is_midi(b'<html>')

def log(src, url, status, path=''):
    with lock:
        with open(log_path, 'a', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow([src, url, status, path])

def get(url, cap):
    r = ur.urlopen(ur.Request(url, headers={'User-Agent': UA}), timeout=40)
    b = r.read(cap + 1)
    if len(b) > cap: raise ValueError('too large')
    return b

def links(url, text):
    out = []
    for a, b in LINK.findall(text):
        u = html.unescape(a or b)
        if u.startswith(('mailto:', 'javascript:', '#')): continue
        out.append(up.urljoin(url, u).split('#')[0])
    return out

def keep(src, url, name, b, dest):
    h = hashlib.sha256(b).hexdigest()
    with lock:
        dup = seen.get(h)
        if not dup: seen[h] = url
    if dup: return log(src, url, 'duplicate')
    os.makedirs(dest, exist_ok=True)
    base, ext = os.path.splitext(safe_name(name))
    p, i = os.path.join(dest, base + ext), 1
    while os.path.exists(p):
        i += 1; p = os.path.join(dest, f'{base} ({i}){ext}')
    with open(p, 'wb') as f: f.write(b)
    log(src, url, 'ok', os.path.relpath(p, OUT))

def fetch(src, url, dest):
    if url in done: return
    time.sleep(DELAY)
    try:
        path = up.urlsplit(url).path
        if path.lower().endswith('.zip'):
            b = get(url, MAX_ZIP)
            z = zipfile.ZipFile(io.BytesIO(b)); n = 0
            for i in z.infolist():
                # shortcut: only MIDI members under the size cap are read; anything else in a ZIP is ignored
                if i.is_dir() or not re.search(r'\.(mid|midi|kar)$', i.filename, re.I) or i.file_size > MAX_FILE: continue
                m = z.read(i)
                if is_midi(m): keep(src, url + '#' + i.filename, i.filename, m, dest); n += 1
            log(src, url, f'zip:{n}')
        else:
            b = get(url, MAX_FILE)
            if is_midi(b): keep(src, url, path, b, dest)
            else: log(src, url, 'not-midi')
    except Exception as e:
        log(src, url, 'error:' + type(e).__name__ + ':' + str(e)[:80])

def crawl(src, starts, dest, same_prefix=None, depth=2):
    q, visited, files = [(s, 0) for s in starts], set(), []
    while q and len(visited) < MAX_PAGES:
        u, d = q.pop(0)
        if u in visited: continue
        visited.add(u); time.sleep(DELAY)
        try: text = get(u, 3_000_000).decode('utf-8', 'replace')
        except Exception as e: log(src, u, 'page-error:' + str(e)[:80]); continue
        for l in links(u, text):
            p = up.urlsplit(l).path
            if FILE.search(p):
                if l not in files: files.append(l); fetch(src, l, dest)
            elif d < depth and same_prefix and l.startswith(same_prefix) and re.search(r'\.html?$', p, re.I) and not SKIP.search(l):
                q.append((l, d + 1))
    log(src, starts[0], f'crawl-done pages={len(visited)} files={len(files)}')

def drive(src, page, dest):
    text = get(page, 3_000_000).decode('utf-8', 'replace')
    ids = sorted(set(re.findall(r'drive\.google\.com/file/d/([\w-]{20,})', text)))
    for i in ids: fetch(src, f'https://drive.google.com/uc?export=download&id={i}', dest)
    log(src, page, f'drive-ids={len(ids)}')

B = 'https://www.beakauffmann.com/'
JOBS = [
    (crawl, ('Kauffmann', [B + 'midi.html'] + [B + f'mpb_{c}.html' for c in ['0-9'] + list('abcdefghijklmnopqrstuvwxyz')], 'Brazilian/Beatriz Kauffmann', B)),
    (crawl, ('MIDISNET', ['https://midinet.blogspot.com/2013/04/midisnet-playbacks-midi-gratis.html'], 'Brazilian/MIDISNET', None)),
    (crawl, ('MidisGratis', ['https://midieritmosgratis.blogspot.com/'], 'Brazilian/Midis Gratis', None)),
    (crawl, ('TimMim', ['https://timmimjunior.blogspot.com/p/baixar-midi-e-kar-gratis.html'], 'Brazilian/Tim Mim Junior', None)),
    (drive, ('Accordion', 'https://sites.google.com/site/midiaccordeon/bossa-nova', 'Brazilian/Accordion Bossa Nova')),
    (crawl, ('McKenzie', ['https://bushgrafts.com/midi/'], 'Jazz/Doug McKenzie', None)),
    (crawl, ('PerfessorBill', ['https://ragpiano.com/pbmidiall.shtml'], 'Jazz/Perfessor Bill', None)),
    (fetch, ('Weimar', 'https://jazzomat.hfm-weimar.de/download/downloads/RELEASE2.0_mid_unquant.zip', 'Jazz/Weimar Solos')),
    (crawl, ('Butters', ['https://www.terrybutters.co.uk/terrybutters3.htm'], 'Blues/Terry Butters', None)),
    (crawl, ('MIDIPianos', ['https://sites.google.com/site/midipianos/piano-boogie-woogie'], 'Blues/MIDI-Pianos', None)),
    (crawl, ('MIDIWORLD', ['https://www.midiworld.com/search/?q=blues', 'https://www.midiworld.com/search/2/?q=blues'], 'Blues/MIDIWORLD', None)),
]

os.makedirs(OUT, exist_ok=True)
if os.path.exists(log_path):
    for row in csv.reader(open(log_path, encoding='utf-8')):
        if len(row) > 2 and row[2] in ('ok', 'duplicate', 'not-midi'): done.add(row[1].split('#')[0])
for root, _, fs in os.walk(OUT):
    for n in fs:
        if not n.endswith('.csv'): seen[hashlib.sha256(open(os.path.join(root, n), 'rb').read()).hexdigest()] = n

ts = []
for fn, a in JOBS:
    a = a[:2] + (os.path.join(OUT, a[2]),) + a[3:]
    t = threading.Thread(target=fn, args=a); t.start(); ts.append(t)
for t in ts: t.join()
print('finished')
