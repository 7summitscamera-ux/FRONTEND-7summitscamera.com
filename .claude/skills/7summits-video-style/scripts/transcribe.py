#!/usr/bin/env python3
"""Word-level transcript for captions and clip picking.

Usage:
  python3 transcribe.py input.mp4 [-o words.json] [--model small] [--lang id]
          [--start 120 --end 300]

Output JSON: {"words": [{"w","s","e"}...], "segments": [{"text","s","e"}...]}
Times are in SOURCE seconds (offset by --start), ready for render.py with time_base "source".
Needs: pip install faster-whisper (first run downloads the model).
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("-o", "--output")
    ap.add_argument("--model", default="small", help="tiny/base/small/medium/large-v3")
    ap.add_argument("--lang", default="id")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float)
    a = ap.parse_args()

    from faster_whisper import WhisperModel

    # decode with ffmpeg (avoids PyAV version issues), 16 kHz mono float32
    cmd = ["ffmpeg", "-v", "error", "-ss", str(a.start)]
    if a.end:
        cmd += ["-to", str(a.end)]
    cmd += ["-i", a.input, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    audio = np.frombuffer(subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout, np.float32)
    model = WhisperModel(a.model, device="auto", compute_type="int8")
    segs, _ = model.transcribe(audio, language=a.lang, word_timestamps=True, vad_filter=True)
    words, segments = [], []
    for sg in segs:
        segments.append({"text": sg.text.strip(), "s": round(sg.start + a.start, 3),
                         "e": round(sg.end + a.start, 3)})
        print(f"[{sg.start + a.start:8.2f}] {sg.text.strip()}", flush=True)
        for w in sg.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start + a.start, 3),
                          "e": round(w.end + a.start, 3)})

    out = Path(a.output or Path(a.input).with_suffix(".words.json"))
    out.write_text(json.dumps({"words": words, "segments": segments}, ensure_ascii=False, indent=1))
    print(f"Saved {len(words)} words -> {out}")


if __name__ == "__main__":
    main()
