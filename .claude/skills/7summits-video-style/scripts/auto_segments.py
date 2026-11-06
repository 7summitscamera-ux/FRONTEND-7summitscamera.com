#!/usr/bin/env python3
"""Build hybrid A-roll segments (jump cuts + layout per piece) from a word transcript.

Usage:
  python3 auto_segments.py words.json START END [--text a-b ...] [--close a-b ...]
                           [--gap 0.35] [--min-cover 0.8]

--text   windows with burned-in text/graphics -> contain_blur, zoom 1.0
--close  close-up shots; with --close-crop-x they are reframed horizontally (face off-center)
Prints a JSON list ready for plan["aroll"]["segments"].
"""
import argparse
import json


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
    ap.add_argument("--pad", type=float, default=0.08)
    ap.add_argument("--min-cover", type=float, default=0.8,
                    help="shorter full-crop slivers become contain so the layout does not flash")
    a = ap.parse_args()

    data = json.load(open(a.words))
    words = [w for w in (data["words"] if isinstance(data, dict) else data) if a.start <= w["s"] < a.end]

    runs, cur = [], None
    for w in words:
        if cur and w["s"] - cur[1] > a.gap:
            runs.append(cur)
            cur = None
        cur = [w["s"], w["e"]] if cur is None else [cur[0], w["e"]]
    if cur:
        runs.append(cur)

    pieces = []
    for s, e in runs:
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
            d["zoom"] = [1.0, 1.15][k % 2]
            k += 1
            if close and a.close_crop_x is not None:
                d["crop_x"] = a.close_crop_x
        out.append(d)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
