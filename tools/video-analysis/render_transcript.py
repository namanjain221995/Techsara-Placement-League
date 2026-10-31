#!/usr/bin/env python3
"""
Render the ASR checkpoints into the Markdown deliverables:
  docs/video-analysis/FULL_HINDI_TRANSCRIPT.md
  docs/video-analysis/TRANSCRIPT_TIMELINE.md
  docs/video-analysis/FULL_ENGLISH_TRANSLATION.md   (with --translation translation.en.json)

Primary text comes from --primary (large-v3); the --secondary pass (turbo) is shown
beside it as an independent second hearing. Passages where the two disagree strongly
are marked "⚠ uncertain" so nobody treats them as verbatim.

usage: python3 -I render_transcript.py --asr-dir DIR --primary large-v3 --secondary turbo \
          --screens screens.json [--speakers speakers.json] --out-dir docs/video-analysis
"""
from __future__ import annotations

import argparse
import difflib
import json
import os


def ts(t: float) -> str:
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:04.1f}"


def load(path):
    if not os.path.exists(path):
        return {}
    rows = [json.loads(l) for l in open(path, encoding="utf-8")]
    return {r["idx"]: r for r in rows}


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.split(), b.split()).ratio() if a and b else 0.0


def overlap_label(items, s, e, key):
    best, best_ov = None, 0.0
    for it in items:
        ov = min(e, it["end"]) - max(s, it["start"])
        if ov > best_ov:
            best, best_ov = it[key], ov
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--asr-dir", required=True)
    ap.add_argument("--primary", default="large-v3")
    ap.add_argument("--secondary", default="turbo")
    ap.add_argument("--screens", required=True)
    ap.add_argument("--speakers")
    ap.add_argument("--translation", help="translation.en.json (chunk idx -> {en, note})")
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()

    chunks = json.load(open(os.path.join(a.asr_dir, "chunks.json")))
    prim = load(os.path.join(a.asr_dir, f"segments.{a.primary}.jsonl"))
    sec = load(os.path.join(a.asr_dir, f"segments.{a.secondary}.jsonl"))
    cov = json.load(open(os.path.join(a.asr_dir, f"coverage.{a.primary}.json")))
    screens = json.load(open(a.screens))
    speakers = json.load(open(a.speakers)) if a.speakers and os.path.exists(a.speakers) else []

    os.makedirs(a.out_dir, exist_ok=True)
    total = cov["audio_seconds"]
    decoded = sum(1 for c in chunks if c["idx"] in prim)

    # ---------------------------------------------------------------- transcript
    L = []
    L.append("# Full Hindi / Hinglish Transcript — `game building auction.mp4`\n")
    L.append(
        "Machine transcription with **Whisper large-v3** (primary) and **Whisper large-v3-turbo** "
        "(independent second pass), language forced to Hindi, decoded on CPU with a custom greedy "
        "decoder (`tools/video-analysis/transcribe.py`). Spoken Hindi stays in Devanagari; English "
        "words appear as the model heard them (Latin script or Devanagari transliteration).\n"
    )
    L.append(
        f"- Audio length: **{total:.1f} s** ({ts(total)}); VAD speech: **{cov['vad_speech_seconds']:.1f} s** "
        f"in {cov['vad_regions']} regions\n- Chunks decoded: **{decoded}/{len(chunks)}** "
        f"(failed: {cov.get('chunks_missing') or 'none'})\n"
        "- `⚠ uncertain` = the two models disagree substantially (word-overlap < 0.45) or the primary "
        "pass was flagged; read the secondary hearing and the screen context before relying on it.\n"
        "- Speaker labels come from voice-embedding diarization when available; otherwise `SPEAKER_?`.\n"
    )
    for c in chunks:
        p, s2 = prim.get(c["idx"], {}), sec.get(c["idx"], {})
        ptxt, stxt = p.get("text", ""), s2.get("text", "")
        sim = similarity(ptxt, stxt)
        flags = list(p.get("flags", []))
        uncertain = (sim < 0.45 and ptxt and stxt) or bool(flags) or not ptxt
        spk = overlap_label(speakers, c["start"], c["end"], "speaker") if speakers else None
        scr = overlap_label(screens, c["start"], c["end"], "screen")
        L.append(f"\n### [{ts(c['start'])} – {ts(c['end'])}] chunk {c['idx']:02d} · {spk or 'SPEAKER_?'}"
                 + (" · ⚠ uncertain" if uncertain else ""))
        L.append(f"*Screen:* {scr or '—'}\n")
        L.append(f"> {ptxt or '[no speech decoded — UNCLEAR]'}\n")
        meta = f"large-v3 avg log-prob {p.get('avg_logprob')} · tokens {p.get('n_tokens')}"
        if flags:
            meta += f" · flags {flags}"
        L.append(f"<sub>{meta} · agreement with turbo {sim:.2f}</sub>\n")
        if stxt:
            L.append(f"<details><summary>Second hearing (turbo)</summary>\n\n{stxt}\n\n</details>\n")
    open(os.path.join(a.out_dir, "FULL_HINDI_TRANSCRIPT.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")

    # ------------------------------------------------------------------ timeline
    T = ["# Transcript Timeline — every second of the video accounted for\n"]
    T.append(
        "Rows alternate between decoded speech chunks and non-speech gaps (VAD found no speech). "
        "Gaps were still covered visually (see FRAME_BY_FRAME_ANALYSIS.md).\n"
    )
    T.append("| From | To | Kind | Chunk | Speaker | Screen | Opening words (large-v3) |")
    T.append("|---|---|---|---|---|---|---|")
    last = 0.0
    rows = []
    for c in chunks:
        if c["start"] > last + 0.05:
            rows.append((last, c["start"], "no speech", "", "", ""))
        txt = prim.get(c["idx"], {}).get("text", "")
        words = " ".join(txt.split()[:9]) + (" …" if len(txt.split()) > 9 else "")
        spk = overlap_label(speakers, c["start"], c["end"], "speaker") if speakers else "SPEAKER_?"
        rows.append((c["start"], c["end"], "speech", f"{c['idx']:02d}", spk, words))
        last = max(last, c["end"])
    if total > last + 0.05:
        rows.append((last, total, "no speech", "", "", ""))
    for s, e, kind, idx, spk, words in rows:
        scr = overlap_label(screens, s, e, "screen") or "—"
        T.append(f"| {ts(s)} | {ts(e)} | {kind} | {idx} | {spk} | {scr} | {words} |")
    speech_cov = sum(e - s for s, e, k, *_ in rows if k == "speech")
    T.append(f"\nTimeline covered: 00:00.0 → {ts(total)} with no holes. Total length of the speech chunks (incl. 0.25 s padding, small overlaps counted per chunk): {speech_cov:.1f} s.")
    open(os.path.join(a.out_dir, "TRANSCRIPT_TIMELINE.md"), "w", encoding="utf-8").write("\n".join(T) + "\n")
    print("wrote transcript + timeline;", decoded, "chunks")

    # --------------------------------------------------------------- translation
    if not a.translation:
        return
    tr = json.load(open(a.translation, encoding="utf-8"))
    E = ["# Full English Translation — `game building auction.mp4`\n"]
    E.append(
        "A faithful English rendering of the Hindi/Hinglish transcript (`FULL_HINDI_TRANSCRIPT.md`), "
        "chunk by chunk with the same timestamps. Each passage was translated from the large-v3 "
        "text, checked against the turbo second hearing and against what was on screen at that "
        "moment. It is a translation of what was said, not a summary: false starts and fillers "
        "(“uh…”) are kept where they carry meaning.\n"
    )
    E.append(
        "- `[word]` = added for readability (the speaker implied it).\n"
        "- `[unclear]` = nothing reliable was heard; no content was invented for it.\n"
        "- *Note* lines explain every doubtful word, and say which model heard what.\n"
        "- `⚠ uncertain` repeats the flag from the Hindi transcript (models disagree or the "
        "primary pass was flagged).\n"
        "- Non-speech stretches are listed so the whole 9-minute timeline is accounted for.\n"
    )
    missing = []
    last = 0.0
    for c in chunks:
        if c["start"] > last + 0.05:
            E.append(f"\n*[{ts(last)} – {ts(c['start'])}] no speech (screen activity only)*")
        last = max(last, c["end"])
        p, s2 = prim.get(c["idx"], {}), sec.get(c["idx"], {})
        ptxt, stxt = p.get("text", ""), s2.get("text", "")
        sim = similarity(ptxt, stxt)
        uncertain = (sim < 0.45 and ptxt and stxt) or bool(p.get("flags")) or not ptxt
        spk = overlap_label(speakers, c["start"], c["end"], "speaker") if speakers else None
        scr = overlap_label(screens, c["start"], c["end"], "screen")
        entry = tr.get(str(c["idx"]))
        if not entry:
            missing.append(c["idx"])
        E.append(f"\n### [{ts(c['start'])} – {ts(c['end'])}] chunk {c['idx']:02d} · {spk or 'SPEAKER_?'}"
                 + (" · ⚠ uncertain" if uncertain else ""))
        E.append(f"*Screen:* {scr or '—'}\n")
        E.append(f"> {entry['en'] if entry else '[translation missing]'}\n")
        if entry and entry.get("note"):
            E.append(f"*Note:* {entry['note']}\n")
    if total > last + 0.05:
        E.append(f"\n*[{ts(last)} – {ts(total)}] no speech (screen activity only)*")
    E.append(
        f"\n---\nTranslated chunks: {len(chunks) - len(missing)}/{len(chunks)}"
        + (f" — missing: {missing}" if missing else " (complete)") + ".\n"
    )
    open(os.path.join(a.out_dir, "FULL_ENGLISH_TRANSLATION.md"), "w", encoding="utf-8").write("\n".join(E) + "\n")
    print("wrote translation;", len(chunks) - len(missing), "chunks translated; missing", missing)


if __name__ == "__main__":
    main()
