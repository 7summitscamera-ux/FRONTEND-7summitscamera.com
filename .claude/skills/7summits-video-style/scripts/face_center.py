#!/usr/bin/env python3
"""Center the talent in every portrait (cover) segment of a plan, using face detection.

Usage:
  python3 face_center.py plan.json --video proxy.mp4 [--samples 5] [--dry-run]

For each A-roll segment that is not contain_blur and not marked "lock_crop": true,
samples frames, finds the largest face (frontal, or profile facing either way) and sets
crop_x so the face sits in the middle of the 9:16 frame at that segment's zoom.
Segments with no face found (B-roll, graphics) are left unchanged.
Needs: pip install "opencv-python-headless==4.10.0.84" (bundles the haar cascades).
"""
import argparse
import json
import statistics
import subprocess

import cv2
import numpy as np

W_OUT, H_OUT = 1080, 1920


def frame_at(video, t, width=640):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1",
                          "-vf", f"scale={width}:-2", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         check=True, stdout=subprocess.PIPE).stdout
    h = len(raw) // width
    return np.frombuffer(raw[: width * h], np.uint8).reshape(h, width)


def face_x(img, cascades):
    """Normalized x of the largest face center, or None."""
    h, w = img.shape
    best = None
    for name, flip in cascades:
        src = cv2.flip(img, 1) if flip else img
        found = name.detectMultiScale(src, scaleFactor=1.1, minNeighbors=5, minSize=(w // 20, w // 20))
        for (x, y, fw, fh) in found:
            cx = x + fw / 2
            if flip:
                cx = w - cx
            if best is None or fw * fh > best[1]:
                best = (cx / w, fw * fh)
    return best[0] if best else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("--video", required=True, help="source or proxy with the same timing")
    ap.add_argument("--samples", type=int, default=5)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--track-min", type=float, default=3.5,
                    help="segments longer than this get a smooth face-following pan (crop_track)")
    a = ap.parse_args()

    d = cv2.data.haarcascades
    front = cv2.CascadeClassifier(d + "haarcascade_frontalface_default.xml")
    prof = cv2.CascadeClassifier(d + "haarcascade_profileface.xml")
    cascades = [(front, False), (prof, False), (prof, True)]

    plan = json.load(open(a.plan))
    probe = frame_at(a.video, 1.0)
    src_aspect = probe.shape[1] / probe.shape[0]
    for seg in plan["aroll"]["segments"]:
        if seg.get("fit") == "contain_blur" or seg.get("lock_crop"):
            continue
        z = seg.get("zoom", 1.0)
        vw = min(1.0, (W_OUT / H_OUT) / src_aspect / z)  # visible fraction of source width
        n = a.samples
        ts = [seg["in"] + (seg["out"] - seg["in"]) * (i + 0.5) / n for i in range(n)]
        xs = [x for x in (face_x(frame_at(a.video, t), cascades) for t in ts) if x is not None]
        if len(xs) < max(1, n // 3):
            print(f"  {seg['in']:7.2f}-{seg['out']:7.2f}  no face -> unchanged")
            continue
        xf = statistics.median(xs)
        cx = min(1.0, max(0.0, (xf - vw / 2) / (1 - vw))) if vw < 1 else 0.5
        print(f"  {seg['in']:7.2f}-{seg['out']:7.2f}  face x={xf:.2f} ({len(xs)}/{n})  "
              f"crop_x {seg.get('crop_x', '-')} -> {cx:.3f}")
        seg["crop_x"] = round(cx, 3)
        seg.pop("crop_track", None)
        dur = seg["out"] - seg["in"]
        if dur > a.track_min:
            # follow the talent: face x every 0.5 s, median + mean smoothed, as crop keyframes
            tt = [i * 0.5 for i in range(int(dur / 0.5) + 1)]
            raw = [face_x(frame_at(a.video, seg["in"] + min(t, dur - 0.05)), cascades) for t in tt]
            raw = [r if r is not None else xf for r in raw]
            med = [statistics.median(raw[max(0, i - 2):i + 3]) for i in range(len(raw))]
            smo = [sum(med[max(0, i - 2):i + 3]) / len(med[max(0, i - 2):i + 3]) for i in range(len(med))]
            track = [[round(t, 2), round(min(1.0, max(0.0, (x - vw / 2) / (1 - vw))), 3)]
                     for t, x in zip(tt, smo)]
            spread = max(k[1] for k in track) - min(k[1] for k in track)
            if spread > 0.05:
                seg["crop_track"] = track
                print(f"      tracking pan, crop_x {min(k[1] for k in track):.2f}..{max(k[1] for k in track):.2f}")
    if not a.dry_run:
        json.dump(plan, open(a.plan, "w"), indent=1)


if __name__ == "__main__":
    main()
