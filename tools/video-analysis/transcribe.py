#!/usr/bin/env python3
"""
Full-timeline Hindi/Hinglish transcription of the client requirement video.

Why a custom decoder: sherpa-onnx's built-in Whisper greedy search caps output at
~6 tokens per second of audio. Devanagari needs ~15-20 Whisper tokens per second,
so the built-in decoder silently truncated every chunk mid-sentence (observed on
the first 7 chunks of this video). This script drives the same Whisper large-v3
ONNX export directly with onnxruntime and lets each window use the model's full
448-token text context.

Pipeline
  1. 16 kHz mono WAV extracted with FFmpeg (see extract_media.sh).
  2. Silero VAD (sherpa-onnx) finds speech regions across the WHOLE file.
  3. Regions are packed into chunks of <= --max-chunk seconds, cut only at
     silences, with --pad seconds of overlapping context on each side.
  4. Each chunk is zero-padded to 30 s and converted to a 128-bin log-mel exactly
     like reference Whisper, then decoded greedily with prompt
     <|startoftranscript|><|hi|><|transcribe|><|notimestamps|>.
  5. Results are appended to a JSONL checkpoint after every chunk (resumable).
  6. Chunks that hit the token ceiling, loop, or have low average log-probability
     are re-decoded as two halves split at the longest internal silence. Persistent
     problems are flagged, never "fixed" by inventing text.
  7. coverage JSON accounts for every second of the timeline.

Usage
  python3 -I transcribe.py --audio audio16k.wav --model-dir DIR --model large-v3 \
      --vad silero_vad.onnx --out-dir OUT [--threads 2] [--language hi]
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time

import kaldi_native_fbank as knf
import numpy as np
import onnxruntime as ort
import sherpa_onnx
import soundfile as sf

SR = 16000
N_SAMPLES_30S = 30 * SR
N_FRAMES = 3000


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# --------------------------------------------------------------------------- VAD
def vad_regions(samples, vad_model, threshold, max_speech):
    cfg = sherpa_onnx.VadModelConfig()
    cfg.silero_vad.model = vad_model
    cfg.silero_vad.threshold = threshold
    cfg.silero_vad.min_silence_duration = 0.30
    cfg.silero_vad.min_speech_duration = 0.20
    cfg.silero_vad.max_speech_duration = max_speech
    cfg.sample_rate = SR
    vad = sherpa_onnx.VoiceActivityDetector(cfg, buffer_size_in_seconds=60)
    win = cfg.silero_vad.window_size
    regions = []

    def drain():
        while not vad.empty():
            seg = vad.front
            st = seg.start / SR
            regions.append((st, st + len(seg.samples) / SR))
            vad.pop()

    for i in range(0, len(samples), win):
        vad.accept_waveform(samples[i : i + win])
        drain()
    vad.flush()
    drain()
    return sorted(regions)


def pack_chunks(regions, total, max_chunk, max_gap, pad):
    chunks, cur = [], None
    for s, e in regions:
        if cur is None:
            cur = [s, e]
        elif (e - cur[0]) <= max_chunk and (s - cur[1]) <= max_gap:
            cur[1] = e
        else:
            chunks.append(cur)
            cur = [s, e]
    if cur:
        chunks.append(cur)
    return [
        {
            "idx": i,
            "speech_start": round(s, 3),
            "speech_end": round(e, 3),
            "start": round(max(0.0, s - pad), 3),
            "end": round(min(total, e + pad), 3),
        }
        for i, (s, e) in enumerate(chunks)
    ]


# ----------------------------------------------------------------------- Whisper
class Whisper:
    def __init__(self, model_dir, model, threads, language):
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        prov = ["CPUExecutionProvider"]
        self.enc = ort.InferenceSession(os.path.join(model_dir, f"{model}-encoder.int8.onnx"), so, providers=prov)
        self.dec = ort.InferenceSession(os.path.join(model_dir, f"{model}-decoder.int8.onnx"), so, providers=prov)
        m = self.enc.get_modelmeta().custom_metadata_map
        self.n_mels = int(m["n_mels"])
        self.n_layer = int(m["n_text_layer"])
        self.n_ctx = int(m["n_text_ctx"])
        self.n_state = int(m["n_text_state"])
        self.eot = int(m["eot"])
        self.sot = int(m["sot"])
        self.transcribe = int(m["transcribe"])
        self.no_ts = int(m["no_timestamps"])
        codes = m["all_language_codes"].split(",")
        toks = [int(t) for t in m["all_language_tokens"].split(",")]
        self.lang_token = dict(zip(codes, toks))[language]
        self.suppress = np.array([int(t) for t in m["non_speech_tokens"].split(",")], dtype=np.int64)
        self.vocab = {}
        for line in open(os.path.join(model_dir, f"{model}-tokens.txt"), encoding="utf-8"):
            parts = line.rstrip("\n").split()
            if len(parts) == 2:
                self.vocab[int(parts[1])] = base64.b64decode(parts[0])

    def features(self, audio):
        audio = np.concatenate([audio, np.zeros(max(0, N_SAMPLES_30S - len(audio)), dtype=np.float32)])[:N_SAMPLES_30S]
        opts = knf.WhisperFeatureOptions()
        opts.dim = self.n_mels
        fb = knf.OnlineWhisperFbank(opts)
        fb.accept_waveform(SR, audio)
        fb.input_finished()
        feats = np.stack([fb.get_frame(i) for i in range(fb.num_frames_ready)])
        if feats.shape[0] < N_FRAMES:
            feats = np.pad(feats, ((0, N_FRAMES - feats.shape[0]), (0, 0)))
        feats = feats[:N_FRAMES]
        log_spec = np.log10(np.maximum(feats, 1e-10))
        log_spec = np.maximum(log_spec, log_spec.max() - 8.0)
        mel = (log_spec + 4.0) / 4.0
        return mel.T[None, :, :].astype(np.float32)  # (1, n_mels, 3000)

    def decode(self, audio, max_tokens=440):
        t0 = time.time()
        cross_k, cross_v = self.enc.run(None, {"mel": self.features(audio)})
        t_enc = time.time() - t0
        k = np.zeros((self.n_layer, 1, self.n_ctx, self.n_state), dtype=np.float32)
        v = np.zeros_like(k)
        prompt = [self.sot, self.lang_token, self.transcribe, self.no_ts]
        tokens = np.array([prompt], dtype=np.int64)
        offset = 0
        out, logps = [], []
        hit_ceiling = looped = False
        while True:
            logits, k, v = self.dec.run(
                None,
                {
                    "tokens": tokens,
                    "in_n_layer_self_k_cache": k,
                    "in_n_layer_self_v_cache": v,
                    "n_layer_cross_k": cross_k,
                    "n_layer_cross_v": cross_v,
                    "offset": np.array([offset], dtype=np.int64),
                },
            )
            offset += tokens.shape[1]
            lg = logits[0, -1].astype(np.float64)
            lg[self.eot + 1 :] = -np.inf  # no special tokens except <|endoftext|>
            lg[self.suppress] = -np.inf  # reference Whisper suppress_tokens="-1"
            if not out:
                lg[220] = -np.inf  # suppress blank at the start (reference behaviour)
            nxt = int(np.argmax(lg))
            mx = lg.max()
            logps.append(float(lg[nxt] - (mx + np.log(np.exp(lg - mx).sum()))))
            if nxt == self.eot:
                break
            out.append(nxt)
            if is_looping(out):
                looped = True
                break
            if len(out) >= max_tokens or offset >= self.n_ctx - 1:
                hit_ceiling = True
                break
            tokens = np.array([[nxt]], dtype=np.int64)
        text = b"".join(self.vocab.get(t, b"") for t in out).decode("utf-8", errors="replace").strip()
        return {
            "text": text,
            "n_tokens": len(out),
            "avg_logprob": round(float(np.mean(logps)), 3) if logps else None,
            "hit_ceiling": hit_ceiling,
            "looped": looped,
            "encoder_seconds": round(t_enc, 2),
            "total_seconds": round(time.time() - t0, 2),
        }


def is_looping(out: list[int], max_period: int = 40, repeats: int = 3) -> bool:
    """True when the tail is the same block of 1..max_period tokens repeated `repeats` times
    (Whisper's classic hallucination loop, e.g. "में में में …")."""
    n = len(out)
    for p in range(1, max_period + 1):
        if n < p * repeats:
            break
        block = out[n - p :]
        if all(out[n - (k + 1) * p : n - k * p] == block for k in range(1, repeats)):
            return True
    return False


def split_point(samples, regions, start, end):
    """Longest silence inside [start, end] (seconds) -> split time; fallback midpoint."""
    inner = [(s, e) for s, e in regions if s >= start and e <= end]
    best, best_len = (start + end) / 2, 0.0
    for (s1, e1), (s2, _e2) in zip(inner, inner[1:]):
        if s2 - e1 > best_len:
            best, best_len = (e1 + s2) / 2, s2 - e1
    return best


def flags_for(res, dur):
    f = []
    if res["hit_ceiling"]:
        f.append("hit_token_ceiling")
    if res["looped"]:
        f.append("looping_tokens")
    if not res["text"] and dur > 2.0:
        f.append("empty_for_speech")
    if res["avg_logprob"] is not None and res["avg_logprob"] < -1.0:
        f.append("low_confidence")
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--vad", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--language", default="hi")
    ap.add_argument("--vad-threshold", type=float, default=0.40)
    ap.add_argument("--max-chunk", type=float, default=18.0)
    ap.add_argument("--max-gap", type=float, default=2.0)
    ap.add_argument("--pad", type=float, default=0.25)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--tag", default="")
    ap.add_argument("--priority", default="", help="comma-separated chunk ids to decode first")
    a = ap.parse_args()

    os.makedirs(a.out_dir, exist_ok=True)
    samples, sr = sf.read(a.audio, dtype="float32", always_2d=False)
    if sr != SR:
        sys.exit(f"expected {SR} Hz audio, got {sr}")
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    total = len(samples) / SR
    log(f"audio {a.audio}: {total:.2f}s")

    regions = vad_regions(samples, a.vad, a.vad_threshold, max_speech=a.max_chunk - 1)
    json.dump(regions, open(os.path.join(a.out_dir, "vad_regions.json"), "w"))
    speech = sum(e - s for s, e in regions)
    log(f"VAD: {len(regions)} speech regions, {speech:.1f}s speech of {total:.1f}s")
    chunks = pack_chunks(regions, total, a.max_chunk, a.max_gap, a.pad)
    json.dump(chunks, open(os.path.join(a.out_dir, "chunks.json"), "w"), indent=1)
    todo = chunks[: a.limit] if a.limit else chunks
    if a.priority:
        first = [int(x) for x in a.priority.split(",") if x.strip()]
        rank = {idx: i for i, idx in enumerate(first)}
        todo = sorted(todo, key=lambda c: (rank.get(c["idx"], len(first)), c["idx"]))
    log(f"{len(chunks)} chunks (max {a.max_chunk}s)")

    w = Whisper(a.model_dir, a.model, a.threads, a.language)
    tag = a.tag or a.model
    out_path = os.path.join(a.out_dir, f"segments.{tag}.jsonl")
    done = set()
    if os.path.exists(out_path):
        for line in open(out_path, encoding="utf-8"):
            try:
                done.add(json.loads(line)["idx"])
            except Exception:
                pass
    log(f"resume: {len(done)} chunks already decoded")

    with open(out_path, "a", encoding="utf-8") as fh:
        for c in todo:
            if c["idx"] in done:
                continue
            piece = samples[int(c["start"] * SR) : int(c["end"] * SR)]
            dur = len(piece) / SR
            rec = dict(c, model=a.model, language=a.language)
            res = None
            for attempt in range(1, 4):
                try:
                    res = w.decode(piece)
                    rec["attempts"] = attempt
                    break
                except Exception as ex:  # recoverable runtime failure -> retry
                    rec["error"] = repr(ex)
                    time.sleep(1)
            if res is None:
                rec.update(text="", flags=["decode_failed"])
            else:
                rec.update(res)
                rec["flags"] = flags_for(res, dur)
                if any(f in rec["flags"] for f in ("hit_token_ceiling", "looping_tokens")) and dur > 4:
                    cut = split_point(samples, regions, c["start"], c["end"])
                    p1 = samples[int(c["start"] * SR) : int((cut + 0.15) * SR)]
                    p2 = samples[int((cut - 0.15) * SR) : int(c["end"] * SR)]
                    r1, r2 = w.decode(p1), w.decode(p2)
                    alt_flags = sorted(set(flags_for(r1, len(p1) / SR) + flags_for(r2, len(p2) / SR)))
                    rec["retry"] = {
                        "split_at": round(cut, 2),
                        "original_text": rec["text"],
                        "original_flags": rec["flags"],
                        "halves": [r1["text"], r2["text"]],
                        "half_flags": alt_flags,
                    }
                    if len(alt_flags) < len(rec["flags"]):
                        rec["text"] = (r1["text"] + " " + r2["text"]).strip()
                        rec["flags"] = alt_flags
                        rec["retry"]["used"] = "halves"
            rec["rtf"] = round(rec.get("total_seconds", 0) / max(dur, 1e-6), 2)
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fh.flush()
            log(
                f"[{c['idx']:03d}] {c['start']:7.2f}-{c['end']:7.2f} tok={rec.get('n_tokens')} "
                f"lp={rec.get('avg_logprob')} enc={rec.get('encoder_seconds')}s tot={rec.get('total_seconds')}s "
                f"flags={rec['flags']} :: {rec['text'][:70]}"
            )

    rows = sorted((json.loads(l) for l in open(out_path, encoding="utf-8")), key=lambda r: r["idx"])
    last, covered, gaps = 0.0, 0.0, []
    for r in rows:
        if r["start"] > last + 0.05:
            gaps.append([round(last, 2), round(r["start"], 2)])
        covered += max(0.0, r["end"] - max(r["start"], last))
        last = max(last, r["end"])
    if total > last + 0.05:
        gaps.append([round(last, 2), round(total, 2)])
    cov = {
        "audio_seconds": round(total, 2),
        "vad_regions": len(regions),
        "vad_speech_seconds": round(speech, 2),
        "chunks_total": len(chunks),
        "chunks_decoded": len(rows),
        "chunks_missing": [c["idx"] for c in chunks if c["idx"] not in {r["idx"] for r in rows}],
        "chunks_flagged": {r["idx"]: r["flags"] for r in rows if r["flags"]},
        "seconds_sent_to_asr": round(covered, 2),
        "non_speech_gaps": gaps,
        "model": a.model,
        "language": a.language,
    }
    json.dump(cov, open(os.path.join(a.out_dir, f"coverage.{tag}.json"), "w"), indent=1)
    log("coverage:", json.dumps({k: v for k, v in cov.items() if k != "non_speech_gaps"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
