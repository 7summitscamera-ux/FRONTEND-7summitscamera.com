#!/usr/bin/env python3
"""Build hybrid A-roll segments (jump cuts + layout per piece) from a word transcript.

Usage:
  python3 auto_segments.py words.json START END [--text a-b ...] [--close a-b ...]
                           [--gap 0.35] [--min-cover 0.8]

--text   windows with burned-in text/graphics -> contain_blur, zoom 1.0
--close  close-up shots; with --close-crop-x they are reframed horizontally (face off-center);
         close-ups never get a punch-in (already tight)
--audio  source (or proxy) file: cuts land mid-pause around the kept words (>= 0.12 s after
         the last word, never into the next word) at the quietest point, so no word is clipped
Prints a JSON list ready for plan["aroll"]["segments"].
"""
import argparse
import json
import subprocess

import numpy as np

SR, HOP = 16000, 160  # 10 ms energy frames


def energy(path):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], check=True, stdout=subprocess.PIPE).stdout
    x = np.frombuffer(pcm, np.float32)
    n = len(x) // HOP
    rms = np.sqrt((x[: n * HOP].reshape(n, HOP) ** 2).mean(1) + 1e-12)
    return 20 * np.log10(rms)


def snap(db, t, direction, limit, floor):
    """Move t (s) outward until the audio is quiet (below floor dB) or limit is reached."""
    i, step = int(t * 100), (1 if direction > 0 else -1)
    stop = int((t + direction * limit) * 100)
    best = i
    while 0 <= i < len(db) and (i <= stop if step > 0 else i >= stop):
        if db[i] < floor:
            return i / 100
        if db[i] < db[best]:
            best = i
        i += step
    return best / 100


def span(s):
    a, b = s.split("-")
    return float(a), float(b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("words")
    ap.add_argument("start", type=float)
    ap.add_argument("end", type=float)
    ap.add_argument("--text", type=span, nargs="*", default=[])
    ap.add_argument("--close", type=span, nargs="*", default=[])
    ap.add_argument("--close-crop-x", type=float, help="crop_x for close-up pieces (0=left, 1=right)")
    ap.add_argument("--gap", type=float, default=0.35, help="pause longer than this is cut")
    ap.add_argument("--audio", help="snap cuts to silence using this file's audio")
    ap.add_argument("--punch", default="1.0,1.15", help="zoom levels alternated on wide pieces")
    ap.add_argument("--pad", type=float, default=0.08)
    ap.add_argument("--min-cover", type=float, default=0.8,
                    help="shorter full-crop slivers become contain so the layout does not flash")
    a = ap.parse_args()

    data = json.load(open(a.words))
    allw = data["words"] if isinstance(data, dict) else data
    words = [w for w in allw if a.start <= w["s"] < a.end]
    db = energy(a.audio) if a.audio else None
    floor = float(np.percentile(db, 15)) + 6 if db is not None else 0

    runs, cur = [], None
    for w in words:
        if cur and w["s"] - cur[1] > a.gap:
            runs.append(cur)
            cur = None
        cur = [w["s"], w["e"]] if cur is None else [cur[0], w["e"]]
    if cur:
        runs.append(cur)

    starts = sorted(w["s"] for w in allw)
    ends = sorted(w["e"] for w in allw)
    pieces = []
    for s, e in runs:
        if db is not None:
            # cut in the middle of the pause around the kept words (transcript word ends are
            # often early), never into the neighbouring cut-out word; inside that window prefer
            # the quietest 10 ms frame (music beds mean true silence may not exist)
            prev_end = max([x for x in ends if x <= s - 0.01], default=0.0)
            next_start = min([x for x in starts if x >= e + 0.01], default=e + 1.0)
            s_lim = max(prev_end + 0.04, s - max(0.1, min(0.3, (s - prev_end) / 2)))
            e_lim = min(next_start - 0.04, e + max(0.15, min(0.5, (next_start - e) / 2)))
            e_lo = min(e_lim, e + 0.12)
            seg = db[int(e_lo * 100):int(e_lim * 100) + 1]
            e = (int(e_lo * 100) + int(np.argmin(seg))) / 100 if len(seg) else e_lim
            e = max(e, e_lo)
            s = max(s_lim, a.start - 0.1)  # the range start was chosen on purpose: don't lead in far
        else:
            s, e = max(a.start, s - a.pad), min(a.end, e + a.pad)
        cuts = sorted({s, e, *[x for w in a.text + a.close for x in w if s < x < e]})
        for x, y in zip(cuts, cuts[1:]):
            mid = (x + y) / 2
            contain = any(p <= mid < q for p, q in a.text)
            close = any(p <= mid < q for p, q in a.close)
            pieces.append([x, y, contain, close])

    # a short full-crop sliver next to a contain piece joins it, so the layout does not flash
    for i, pc in enumerate(pieces):
        nb = [pieces[j][2] for j in (i - 1, i + 1) if 0 <= j < len(pieces)]
        if not pc[2] and pc[1] - pc[0] < a.min_cover and any(nb):
            pc[2] = True

    out, k = [], 0
    for x, y, contain, close in pieces:
        d = {"in": round(x, 2), "out": round(y, 2)}
        if contain:
            d.update(fit="contain_blur", zoom=1.0)
        else:
            levels = [float(z) for z in a.punch.split(",")]
            d["zoom"] = 1.0 if close else levels[k % len(levels)]
            k += 1
            if close and a.close_crop_x is not None:
                d["crop_x"] = a.close_crop_x
        out.append(d)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
