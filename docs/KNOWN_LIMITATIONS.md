# Known Limitations & Open Questions

## Business questions for the client (nothing invented — current behaviour shown)
| ID | Question | What the app does now |
|---|---|---|
| ~~Q-01~~ | Winner — **resolved by the client on 1 Nov 2026**: highest combined actual annual offer amount of the purchased profiles. | Implemented with a step-by-step Final Reveal (see GAME_RULES.md section 9). |
| Q-02 | Should team members **bid from their phones** (the reference shows magic links / access codes)? | Not built. The organizer enters the bids that are called out, as demonstrated (04:13–04:47). |
| Q-03 | Real franchise names/logos (e.g. IPL teams, as in the reference event) on a public screen carry trademark risk. | Any names/logos can be entered; the sample data used for tests and screenshots uses invented names. |
| Q-04 | The reference config showed a 30 s timer, but bidding ran with "No timer". Should time-up **sell automatically**? | Countdown is optional (off by default), restarts on every bid, shows "time up", never sells. |
| Q-05 | Re-auction unsold candidates in more rounds? | Organizer may start round 2, 3… when the pool is empty. |
| Q-06 | 06:18–06:36 is mostly inaudible; only "…यह बोल्ड राइंग बोल्ड" was recovered (“…this bold [unclear] bold”) — possibly a request for **bold text** in descriptions. | Plain text exactly as typed (bullets, numbering, line breaks). No bold markup. |
| Q-07 | What does **disqualification** mean afterwards (prizes, candidates returned)? | Disqualified teams are flagged, **not ranked and cannot win** (my reading of "disqualified" — please confirm). Nothing else changes. |
| Q-09 | In which **order** should the final reveal go through the profiles? Not specified. | Purchase order (first sold first). |
| Q-10 | Should the purchasing team be revealed before or with the salary? The request lists salary then team. | Exactly that order; the salary joins the team's visible total at the team step. |
| Q-08 | **Candidate privacy** on a public screen (names, interview status). | Bidding uses tweaked names. Real names, salaries and offer letters are sent to the audience only during the final reveal — but from then on anyone with the display link can open the revealed letters. Redact anything (addresses, IDs, signatures) you do not want on the big screen before uploading. |

## Technical limitations
- **Single instance.** One server process per database (no Redis adapter for Socket.IO). Ample for one event; not horizontally scalable as-is.
- **HTTP only.** Use a TLS reverse proxy for anything beyond a trusted LAN; set `COOKIE_SECURE=true`.
- **No Content-Security-Policy** header (Next.js inline scripts); other security headers are set.
- **One organizer role.** All organizers have full rights; no read-only operator role.
- **Countdown granularity** depends on the browser clock offset measurement (± a few tens of ms on a LAN).
- **Images:** PNG/JPG/WEBP/GIF up to 3 MB; no server-side resizing or cropping (large photos are sent as-is).
- **Excel import** is all-or-nothing, max 500 rows per file; tested with the template and synthetic CSV only. Offer letters cannot be imported from the sheet — upload them per candidate.
- **Offer letters**: PDF, PNG, JPG or WEBP up to 10 MB. PDFs are shown with the browser's built-in PDF viewer (Chrome/Edge/Firefox); the projector browser must be able to display PDFs inline, otherwise upload the letter as an image. No server-side redaction.
- **Salaries** are whole US dollars (no cents), entered by the organizer; the app cannot read amounts from the letters — the "verified" tick is the organizer's own check.
- **Private data on organizer screens** (hidden totals, original names) is masked on the live console by default, but anyone looking at an organizer screen after pressing "Show" can see it.
- **Description formatting** is plain text: there is no bold/italic/link support (see Q-06).
- **Multiple simultaneous auctions** are supported by design but were not load-tested together.

## Verification gaps (see TEST_REPORT.md)
- Not run on Windows itself, on real projector/LED hardware, or in Safari/Firefox.
- No long soak/load test.

## Video-analysis caveats
- The transcript is machine-generated (Whisper large-v3 with a turbo second pass). Hinglish words are sometimes spelled phonetically; passages where the two models disagree or the audio is unclear are marked `⚠ uncertain` and were not used as the sole basis for any requirement.
- One speaker dominates (≈ 85 % of speech by voice clustering); short stretches cluster separately and may be a second person or the same voice — speakers are labelled cautiously.
- Frames were reviewed every 3 s plus full-resolution reads of key screens, not frame by frame.
- Authenticated reference pages were not accessed; their behaviour is known only from the client's recording.
