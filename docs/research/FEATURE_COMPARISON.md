# Feature Comparison — CricSmart reference vs. TechSara Placement League

Legend — **Client**: ✅ confirmed by the client video · ◐ visible in the client's demo but not discussed · — not in the video. **TPL**: ✅ built · ⚙ built as a proposed enhancement · ✗ not built (reason given).

| Reference feature (CricSmart) | Client | TPL | Notes |
|---|---|---|---|
| Organizer dashboard, create auction | ✅ 00:04 | ✅ | |
| Clone/duplicate auction | ✅ 00:08 | ✅ | Copies settings, teams, candidates, images |
| Status tabs, delete | ◐ 00:00 | ✅ | |
| Purse / base price / squad limits | ✅ 03:16, 05:39 | ✅ | Integers in thousands; shown in millions |
| Tiered bid increments | — | ⚙ single configurable step | Client's event uses a flat $1M step |
| Teams: name, colour, owner names | ✅ 00:17–00:49 | ✅ | "Members" list |
| Team logo, short name | ◐ 00:39 | ✅ | Upload PNG/JPG/WEBP/GIF |
| Adjust purse per team | ◐ 00:32 | ✅ (before lock) | |
| Team owner magic link / access code (owners bid from phones) | ◐ 00:32, 03:27 | ✗ | Not requested; the client entered bids himself — open question Q-02 |
| Candidate photo, name, role | ✅ 01:07 | ✅ | Upload or URL; generated portrait fallback |
| Many profile fields (age, DOB, email, location…) | ◐ 01:18 | ✗ by design | Client: "only description" (01:22) |
| Point-wise description | ✅ 01:22–01:52 | ✅ | Reference used a one-line input and truncated it — fixed |
| Player display-field configurator | ◐ 01:54 | ✗ | Replaced by fixed card: photo, number, role, name, base, full description |
| Excel import / template / export | ◐ 00:51 | ✅ | XLSX/CSV import, template, multi-sheet XLSX export |
| Player grades / retention / RTM | ◐ menu only | ✗ | Not part of the client's event |
| Registration form / WhatsApp alerts | ◐ menu only | ✗ | Out of scope; no third-party messaging |
| Lock configuration, launch checklist | ✅ 03:22 | ✅ | Blocking issues + warnings |
| Live console: next / pick candidate | ✅ 03:59 / ◐ | ✅ | Random or numeric order |
| Tap team to bid, ±step | ✅ 04:13 / ◐ | ✅ | Keyboard 1–9, +/- |
| Custom amount with quick multiples | ✅ 07:43 | ✅ | Typed in **millions**; shows every team's max; blocks above max (the reference errored on "10") |
| Sold / Unsold / Undo / Skip / Disqualify / Pause / End | ✅ / ◐ | ✅ | Confirmations for destructive actions |
| Countdown (30 s) | ◐ 03:16 (unused) | ⚙ optional, off by default | Never auto-sells — Q-04 |
| Rounds (re-auction unsold) | ◐ "Round 1" | ✅ | |
| Announcement box | ◐ 04:00 | ✅ | Shown in the ticker |
| Bid history, audit log | ◐ 05:36 | ✅ | |
| Post-auction trades (48 h) | — | ✗ | Not mentioned |
| Public live screen / broadcast | ✅ 03:45 | ✅ | `/display/<code>`; projector, LED, phone |
| Leading team floats to top | ✅ 05:06 | ✅ | Animated reorder |
| Max bid / purse / squad table | ✅ 03:51, 08:29 | ✅ | |
| Round / pool / sold counters | ✅ 07:26 | ✅ | Pool excludes the candidate on the block (as on the reference) |
| SOLD animation | ✅ 04:47 | ✅ | GSAP stamp, confetti in team colours, optional gavel sound |
| Ticker | ◐ 03:51 | ✅ | |
| OBS overlays / YouTube streaming | ◐ menu | ✗ | Display page can be captured by OBS as a browser source |
| Crowd popularity / viewer stats | ◐ 04:57 | ✗ | |
| Android app | — | ✗ | Responsive web instead |
| Multi-sport | — | ✗ | Single placement-league game |
| Analytics / value picks | — | ⚙ partial | Top sale, top spender, totals |
| Winner / scoring | — | ✗ | Not defined by the client — Q-01 |

**Irrelevant to this event:** cricket-specific scoring, fixtures, tournaments, payments, kabaddi/badminton variants, plan limits ("free for 4 teams").
