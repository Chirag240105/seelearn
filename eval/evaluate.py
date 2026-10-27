#!/usr/bin/env python3
"""Evaluate real SeeLearn recordings. Missing measurements remain unavailable."""
import argparse
import csv
import glob
import json
import math
import platform
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from vision_service.seelearn_vision import GestureStateMachine, KalmanPointSmoother, MAX_FRAME_WIDTH

PROMPT = 'No recordings found. Record real clips with: python vision_service/seelearn_vision.py --record eval/clips/still_01.json --label "still hand"'
CLASSES = ("pointing", "pinch", "open_palm", "fist", "no_hand")


def read_records(path):
    text = Path(path).read_text(encoding="utf-8").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = [json.loads(line.rstrip(",")) for line in text.splitlines() if line.strip().strip(",") not in ("[", "]")]
    if isinstance(data, dict):
        data = data.get("frames", [])
    return data if isinstance(data, list) else []


def canonical(label, state, detected):
    word = str(label or "").lower().replace("_", " ")
    if not detected:
        return "no_hand"
    if "pinch" in word:
        return "pinch"
    if "fist" in word:
        return "fist"
    if "palm" in word:
        return "open_palm"
    return "pointing"


def predicted(state, detected):
    if not detected:
        return "no_hand"
    if state in ("PINCH_START", "PINCH_HOLD", "PINCH_RELEASE"):
        return "pinch"
    if state == "PALM_ROTATE":
        return "open_palm"
    if state == "FIST_ZOOM":
        return "fist"
    return "pointing"


def normalize(point, size):
    if point is None:
        return None
    if isinstance(point, dict):
        return float(point["x"]), float(point["y"])
    return float(point[0]), float(point[1])


def label_metrics(rows):
    pairs = [(canonical(r.get("label"), r.get("state"), bool(r.get("detected", r.get("rawCursor") is not None))),
              predicted(r.get("state", "IDLE"), bool(r.get("detected", r.get("rawCursor") is not None)))) for r in rows]
    result = {"accuracy": sum(a == b for a, b in pairs) / len(pairs) if pairs else None, "per_class": {}}
    for cls in CLASSES:
        tp = sum(a == cls and b == cls for a, b in pairs)
        fp = sum(a != cls and b == cls for a, b in pairs)
        fn = sum(a == cls and b != cls for a, b in pairs)
        result["per_class"][cls] = {"precision": tp / (tp + fp) if tp + fp else None, "recall": tp / (tp + fn) if tp + fn else None}
    return result


def summarize(records, name, clahe_label="recorded", video_frames=None):
    still = [r for r in records if "still" in str(r.get("label", "")).lower() and r.get("rawCursor") is not None]
    jitter = None
    if len(still) > 1 and all(r.get("frameSize") for r in still):
        size = still[0].get("frameSize")
        coords = [normalize(r.get("rawCursor"), size) for r in still]
        if size and len(size) == 2:
            coords = [(x * size[0], y * size[1]) for x, y in coords]
        if len(coords) > 1:
            jitter = float(np.mean([np.std([p[i] for p in coords], ddof=0) for i in (0, 1)]))
    detected = [bool(r.get("detected", r.get("rawCursor") is not None)) for r in records]
    losses = sum(a and not b for a, b in zip(detected, detected[1:]))
    latencies = [float(r["latencyMs"]) for r in records if r.get("latencyMs") is not None]
    metrics = label_metrics(records)
    return {"source": name, "clahe": clahe_label, "filter": "recorded/replayed", "frames": len(records), "jitterPx": jitter,
            "accuracy": metrics["accuracy"], "lossEvents": losses,
            "latencyMeanMs": statistics.mean(latencies) if latencies else None,
            "latencyMedianMs": statistics.median(latencies) if latencies else None,
            "latencyP95Ms": float(np.percentile(latencies, 95)) if latencies else None,
            "perClass": metrics["per_class"]}


def replay_filter(records, enabled):
    smoother = KalmanPointSmoother()
    values = [None] * len(records)
    for index, rec in enumerate(records):
        point = rec.get("rawCursor")
        size = rec.get("frameSize")
        if point is None:
            smoother.reset()
            continue
        if not size or len(size) != 2:
            smoother.reset()
            continue
        x, y = normalize(point, size)
        x, y = x * size[0], y * size[1]
        if enabled:
            x, y = smoother.update(x, y)
        values[index] = (x, y)
    still_indices = [i for i, r in enumerate(records) if "still" in str(r.get("label", "")).lower() and values[i] is not None]
    selected = [values[i] for i in still_indices]
    return float(np.mean([np.std([p[i] for p in selected]) for i in (0, 1)])) if len(selected) > 1 else None


def video_ablation(path, label, clahe_flag, kalman_flag):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {path}")
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    import mediapipe as mp
    hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=1, model_complexity=1,
                                     min_detection_confidence=.65, min_tracking_confidence=.65)
    smoother = KalmanPointSmoother()
    gm = GestureStateMachine()
    rows, latencies, errors = [], [], []
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            start = time.perf_counter()
            h, w = frame.shape[:2]
            if w > MAX_FRAME_WIDTH:
                frame = cv2.resize(frame, (MAX_FRAME_WIDTH, max(1, round(h * MAX_FRAME_WIDTH / w))), interpolation=cv2.INTER_AREA)
            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]
            processed = frame
            if clahe_flag:
                lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                processed = cv2.cvtColor(cv2.merge((clahe.apply(l), a, b)), cv2.COLOR_LAB2BGR)
            result = hands.process(cv2.cvtColor(processed, cv2.COLOR_BGR2RGB))
            detected = bool(result.multi_hand_landmarks)
            raw = filt = None
            state = "IDLE"
            conf = 0.0
            if detected:
                lm = result.multi_hand_landmarks[0].landmark
                raw = (lm[8].x, lm[8].y)
                px = (raw[0] * w, raw[1] * h)
                fx, fy = smoother.update(*px) if kalman_flag else px
                filt = (fx / w, fy / h)
                state = gm.process(lm, w, h)[0]
                try: conf = float(result.multi_handedness[0].classification[0].score)
                except (AttributeError, IndexError, TypeError): pass
            else:
                gm.process(None, w, h)
                smoother.reset()
            latency = (time.perf_counter() - start) * 1000
            latencies.append(latency)
            rows.append({"label": label, "state": state, "detected": detected, "rawCursor": ({"x": raw[0], "y": raw[1]} if raw else None),
                         "filteredCursor": ({"x": filt[0], "y": filt[1]} if filt else None), "frameSize": [w,h], "confidence": conf, "latencyMs": latency})
            if "still" in label.lower() and filt:
                errors.append((filt[0]*w, filt[1]*h))
    finally:
        hands.close(); cap.release()
    summary = summarize(rows, str(path), "on" if clahe_flag else "off")
    summary["filter"] = "kalman" if kalman_flag else "none"
    summary["jitterPx"] = float(np.mean([np.std(np.asarray(errors)[:,i]) for i in (0,1)])) if len(errors)>1 else None
    summary["latencyMeanMs"] = statistics.mean(latencies) if latencies else None
    summary["latencyMedianMs"] = statistics.median(latencies) if latencies else None
    summary["latencyP95Ms"] = float(np.percentile(latencies, 95)) if latencies else None
    return summary


def fmt(v):
    return "N/A" if v is None else f"{v:.4f}" if isinstance(v, float) else str(v)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("recordings", nargs="*")
    p.add_argument("--video", action="append", default=[])
    p.add_argument("--label", action="append", default=[])
    p.add_argument("--output-dir", default="eval/results")
    args = p.parse_args()
    paths = [Path(x) for x in args.recordings] if args.recordings else [Path(x) for x in glob.glob(str(ROOT / "eval/clips/**/*.json"), recursive=True)]
    videos = [Path(x) for x in args.video]
    if not paths and not videos:
        print(PROMPT, file=sys.stderr); return 2
    try:
        import mediapipe as mp
        mp_version = mp.__version__
    except Exception as exc:
        print(f"MediaPipe unavailable: {exc}", file=sys.stderr); return 2
    out = Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
    rows = []
    all_records = []
    for path in paths:
        recs = read_records(path); all_records.extend(recs)
        row = summarize(recs, str(path)); row["filter"] = "recorded"
        if recs:
            for mode in (False, True):
                ab = dict(row); ab["filter"] = "kalman" if mode else "none"; ab["jitterPx"] = replay_filter(recs, mode)
                ab["clahe"] = "unavailable (JSON has no source frames)"; rows.append(ab)
    for i, path in enumerate(videos):
        label = args.label[i] if i < len(args.label) else ""
        if not label:
            sidecar = path.with_suffix(".json")
            if sidecar.exists():
                side = read_records(sidecar); label = str(side[0].get("label", "")) if side else ""
        if not label:
            print(f"Video label required via --label: {path}", file=sys.stderr); return 2
        for c in (False, True):
            for k in (False, True):
                rows.append(video_ablation(path, label, c, k))
    if not rows:
        print(PROMPT, file=sys.stderr); return 2
    fields = ("source", "clahe", "filter", "frames", "jitterPx", "accuracy", "lossEvents", "latencyMeanMs", "latencyMedianMs", "latencyP95Ms", "perClass")
    with (out / "vision_ablation.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields); writer.writeheader()
        for r in rows:
            value = {k: r.get(k) for k in fields}
            value["perClass"] = json.dumps(value["perClass"], sort_keys=True)
            writer.writerow(value)
    lines = ["# Vision evaluation", "", f"Python: {platform.python_version()}", f"OpenCV (cv2): {cv2.__version__}", f"MediaPipe: {mp_version}", f"Machine type: {platform.machine()}", "", "## Measured ablations", "",
             "| Source | CLAHE | Filter | Frames | Still jitter (px) | Accuracy | Loss events | Mean latency (ms) | Median latency (ms) | P95 latency (ms) |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for r in rows:
        lines.append("| " + " | ".join(fmt(r.get(k)) for k in fields[:-1]) + " |")
    lines += ["", "## Gesture per-class precision and recall", "", "| Source/configuration/class | Precision | Recall |", "|---|---:|---:|"]
    for index, r in enumerate(rows):
        for cls, m in r.get("perClass", {}).items():
            lines.append(f"| {Path(r['source']).name} / {r['filter']} / CLAHE {r['clahe']} / {cls} | {fmt(m['precision'])} | {fmt(m['recall'])} |")
    lines += ["", "Unavailable fields are N/A. Cursor-only JSON recordings cannot be replayed through CLAHE because they contain no source image frames. Video ablation rows come from actual decoded frames.", ""]
    (out / "vision_report.md").write_text("\n".join(lines), encoding="utf-8")
    measured = [(r["source"] + " / " + r["filter"] + " / CLAHE " + r["clahe"], r["jitterPx"]) for r in rows if r.get("jitterPx") is not None]
    fig, ax = plt.subplots(figsize=(max(8, len(measured)*1.4), 4))
    if measured: ax.bar([x[0] for x in measured], [x[1] for x in measured]); ax.tick_params(axis="x", rotation=35); ax.set_ylabel("Still-hand jitter (pixels)")
    else: ax.text(.5,.5,"No labeled still-hand cursor measurements",ha="center",va="center"); ax.set_axis_off()
    fig.tight_layout(); fig.savefig(out / "vision_ablation.png", dpi=150); plt.close(fig)
    print(f"Python {platform.python_version()} | OpenCV {cv2.__version__} | MediaPipe {mp_version} | machine {platform.machine()}")
    print(f"Wrote measured report artifacts to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
