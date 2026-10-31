# Animation Plan

Goal: broadcast energy without ever delaying information. Every animation starts after the new state is already on screen and lasts ≤ 0.6 s (except the SOLD celebration, 6.5 s, dismissed instantly by the next candidate or bid).

| Moment | Effect | Tech | Duration |
|---|---|---|---|
| Candidate comes up | Stage card slides in from the left with a soft spring; previous card exits right | `motion` `AnimatePresence` (spring 220/26) | ~0.5 s |
| New bid | Amount rolls up from below and settles (scale 1.25 → 1) | `motion` popLayout (spring 420/22) | ~0.35 s |
| Leader changes | Team rows reorder; leader slides to the top, glows in its colour, gets a gold "BID" tag | `motion` `layout` + CSS `glow` keyframes | ~0.4 s + 2.4 s pulse loop |
| Bidding team bar | Fades/slides in with the team gradient | `motion` | 0.3 s |
| SOLD | Backdrop blur; card with team tint; **SOLD! stamp slams** (scale 3 → 1, −24° → −9°, back-out ease) then card shakes 5×; two confetti bursts in team colour + gold; optional synthesized 3-knock gavel | GSAP timeline + canvas-confetti + WebAudio | stamp 0.5 s, overlay 6.5 s |
| UNSOLD | Same card, amber stamp, no confetti | GSAP | 3 s |
| Countdown | Ring stroke drains; turns red ≤ 5 s; pulses at time up | SVG + CSS | continuous |
| ON AIR / live dots | Breathing dot | CSS keyframes | 1.4 s loop |
| Waiting state | Diagonal shimmer sweep | CSS gradient animation | 2.8 s loop |
| Ticker | Seamless marquee (two copies, −50 % translate), speed scales with text length | CSS keyframes | 18 s+ loop |
| Pre-live line-up | Team cards rise in sequence (80 ms stagger) | `motion` | ~0.6 s |

## Performance & accessibility
- Only `transform`/`opacity` are animated (GPU-friendly on venue laptops); confetti particle count is capped (2 × 160).
- `prefers-reduced-motion: reduce` → CSS animations/transitions effectively off, `useReducedMotion()` skips GSAP, confetti is disabled.
- Sound is **off by default** (browsers block autoplay) and enabled with the speaker button on the display; sounds are synthesized (no audio files).
