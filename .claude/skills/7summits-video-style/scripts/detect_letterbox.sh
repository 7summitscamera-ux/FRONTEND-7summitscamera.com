#!/usr/bin/env bash
# List letterboxed (film/B-roll insert) vs full-frame (host) runs in a video.
# Usage: detect_letterbox.sh <video> [black_threshold=17]
# Limited-range video has black at Y=16, so the default threshold is 17.
set -euo pipefail
IN="$1"
THR="${2:-17}"
TMP=$(mktemp)
ffmpeg -v error -i "$IN" -vf "fps=2,scale=480:-2,crop=iw:12:0:0,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=$TMP" -f null -
python3 - "$TMP" "$THR" <<'PY'
import re, sys
ts, ys, t = [], [], None
for l in open(sys.argv[1]):
    m = re.search(r'pts_time:([\d.]+)', l)
    if m: t = float(m.group(1))
    m = re.search(r'YAVG=([\d.]+)', l)
    if m: ts.append(t); ys.append(float(m.group(1)))
thr = float(sys.argv[2])
lab = ['FILM' if y < thr else 'HOST' for y in ys]
runs, s = [], 0
for i in range(1, len(lab) + 1):
    if i == len(lab) or lab[i] != lab[s]:
        runs.append([lab[s], ts[s], ts[i - 1] + 0.5]); s = i
out = []
for r in runs:  # merge blips shorter than 1 s into the previous run
    if out and (r[2] - r[1] < 1.0 or r[0] == out[-1][0]): out[-1][2] = r[2]
    else: out.append(r)
for k, a, b in out:
    print(f"{k:4s} {a:7.1f}-{b:7.1f}  ({b - a:.1f}s)")
PY
rm -f "$TMP"
