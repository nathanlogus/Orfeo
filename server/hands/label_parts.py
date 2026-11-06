# Labels each exported piano part. Songs the model is unsure of, or that come out
# inverted, are left out so Pliage's own engine keeps handling them.
import json, os, statistics as st, sys, time
os.environ['HF_HUB_OFFLINE'] = '1'
# Run with the virtual environment that has torch: label_parts.py <tool-checkout> <models-folder>
# The models are read in safe mode, so a tampered file can't run code.
TOOL, MODELS = sys.argv[1:3]
DATA = os.environ.get('PLIAGE_DATA') or sys.exit('Set PLIAGE_DATA')
sys.path.insert(0, os.path.join(TOOL, 'src'))
import numpy as np, torch
_load = torch.load
torch.load = lambda *a, **k: _load(*a, **{**k, 'weights_only': True})  # never run pickled code
from piano_hand_assignment import HandAssigner
from piano_hand_assignment.midi_io import Note
torch.set_num_threads(max(2, (os.cpu_count() or 4) - 4))
MIN_CONFIDENCE = 0.80
RIGHT = 0
a = HandAssigner(device='cpu', checkpoint_dir=MODELS)
parts = json.load(open(os.path.join(DATA, 'hands', 'parts.json'), encoding='utf-8'))
out, unsure, inverted, t0 = {}, 0, 0, time.time()
for i, p in enumerate(parts):
    order = sorted(range(len(p['notes'])), key=lambda k: (p['notes'][k][0], p['notes'][k][2]))
    notes = [Note(start=p['notes'][k][0], end=p['notes'][k][1], pitch=p['notes'][k][2], velocity=80, channel=0, track=0) for k in order]
    labels, conf = a.assign_notes(notes, p['tpb'])
    hands = [''] * len(order)
    for pos, k in enumerate(order): hands[k] = 'R' if labels[pos] == RIGHT else 'L'
    mean = float(np.mean(conf))
    pitches = [n[2] for n in p['notes']]
    r = [x for x, h in zip(pitches, hands) if h == 'R']; l = [x for x, h in zip(pitches, hands) if h == 'L']
    if mean < MIN_CONFIDENCE: unsure += 1; continue
    if r and l and st.mean(r) < st.mean(l): inverted += 1; continue
    out[p['rel']] = {'trackIndex': p['trackIndex'], 'hands': ''.join(hands), 'confidence': round(mean, 3)}
    if (i + 1) % 500 == 0: print(i + 1, round(time.time() - t0), 's', len(out), flush=True)
json.dump(out, open(os.path.join(DATA, 'hands', 'labels.json'), 'w'))
c = [v['confidence'] for v in out.values()]
print(f'finished parts={len(parts)} labelled={len(out)} unsure={unsure} inverted={inverted} seconds={time.time() - t0:.0f} median-confidence={st.median(c):.3f}', flush=True)
