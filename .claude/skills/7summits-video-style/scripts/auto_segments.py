#!/usr/bin/env python3
"""Build hybrid A-roll segments (jump cuts + layout per piece) from a word transcript.

Usage:
  python3 auto_segments.py words.json START END [--text a-b ...] [--close a-b ...]
                           [--gap 0.35] [--min-cover 0.8]

--text   windows with burned-in text/graphics -> contain_blur, zoom 1.0
--close  close-up shots (kept center-framed, still alternate punch-in)
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
            if not contain and y - x < a.min_cover:
                contain = True
            pieces.append((x, y, contain))

    out, k = [], 0
    for x, y, contain in pieces:
        d = {"in": round(x, 2), "out": round(y, 2)}
        if contain:
            d.update(fit="contain_blur", zoom=1.0)
        else:
            d["zoom"] = [1.0, 1.15][k % 2]
            k += 1
        out.append(d)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
