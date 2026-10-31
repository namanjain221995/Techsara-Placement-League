#!/usr/bin/env python3
"""
Speaker diarization for the client video (who spoke when).
pyannote segmentation-3.0 (ONNX) + CAM++ speaker embeddings (VoxCeleb), via sherpa-onnx.
Clustering threshold is conservative; the output is a hint for the transcript, not proof
of identity.

usage: python3 -I diarize.py --audio audio16k.wav --seg model.onnx --emb emb.onnx --out speakers.json
"""
import argparse
import json

import sherpa_onnx
import soundfile as sf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--seg", required=True)
    ap.add_argument("--emb", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--threshold", type=float, default=0.6)
    a = ap.parse_args()

    cfg = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=a.seg), num_threads=2
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=a.emb, num_threads=2),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=a.threshold),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not cfg.validate():
        raise SystemExit("invalid diarization config")
    sd = sherpa_onnx.OfflineSpeakerDiarization(cfg)
    samples, sr = sf.read(a.audio, dtype="float32")
    assert sr == sd.sample_rate, (sr, sd.sample_rate)
    res = sd.process(samples).sort_by_start_time()
    rows = [{"start": round(r.start, 2), "end": round(r.end, 2), "speaker": f"SPEAKER_{r.speaker:02d}"} for r in res]
    json.dump(rows, open(a.out, "w"), indent=1)
    talk = {}
    for r in rows:
        talk[r["speaker"]] = talk.get(r["speaker"], 0) + r["end"] - r["start"]
    print(json.dumps({k: round(v, 1) for k, v in sorted(talk.items())}), len(rows), "turns")


if __name__ == "__main__":
    main()
