#!/usr/bin/env python3
"""
Second look at the stretches VAD classed as non-speech: measure their loudness and decode the
audible ones, so quiet speech missed by VAD would still surface.

usage: python3 -I check_gaps.py --audio audio16k.wav --coverage asr2/coverage.large-v3.json \
          --model-dir <whisper dir> --model large-v3 [--min-dbfs -65] --out asr2/gaps.large-v3.json
"""
import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from transcribe import Whisper  # noqa: E402


def dbfs(x):
    r = float(np.sqrt(np.mean(np.square(x, dtype=np.float64)))) if len(x) else 0.0
    return 20 * np.log10(max(r, 1e-9))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--coverage", required=True)
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--min-dbfs", type=float, default=-65.0, help="decode gaps whose loudest 0.5 s exceeds this level")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    audio, sr = sf.read(a.audio, dtype="float32")
    gaps = json.load(open(a.coverage))["non_speech_gaps"]
    w = None
    rows = []
    for s, e in gaps:
        seg = audio[int(s * sr) : int(e * sr)]
        frames = [dbfs(seg[i : i + sr // 2]) for i in range(0, max(1, len(seg) - sr // 4), sr // 2)]
        row = {"start": s, "end": e, "mean_dbfs": round(dbfs(seg), 1), "loudest_dbfs": round(max(frames), 1)}
        if e - s >= 1.0 and row["loudest_dbfs"] > a.min_dbfs:
            w = w or Whisper(a.model_dir, a.model, 2, "hi")
            r = w.decode(seg)
            row.update(model=a.model, text=r["text"], avg_logprob=r["avg_logprob"], n_tokens=r["n_tokens"])
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    json.dump(rows, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
