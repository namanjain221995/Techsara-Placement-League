# Complete Product Requirements — TechSara Placement League

**Source of truth:** the client's Hindi/Hinglish screen recording `game building auction.mp4` (9 min 01 s), transcribed in full with Whisper large-v3 (`docs/video-analysis/FULL_HINDI_TRANSCRIPT.md`, translation in `FULL_ENGLISH_TRANSLATION.md`) and reviewed visually (`FRAME_BY_FRAME_ANALYSIS.md`). The reference product (CricSmart Auction) only explains the mechanics the client is pointing at; where it differs from what the client said, the client wins.

**Classification:** CONFIRMED = said and/or shown by the client · INFERRED = visible in the reference flow the client asked to replicate ("I want exactly this functionality", 04:29–04:47) but not discussed · PROPOSED = engineering/UX improvement · UNRESOLVED = needs a business decision.

## 1. Product summary
The **TechSara Placement League** is a live auction event. A handful of teams (5 in the client's event), each made of TechSara colleagues, spend a fixed virtual purse ($25M) to "buy" job candidates (20). An organizer runs the room from an **admin console**, entering bids as they are called out; the audience follows on a **live screen** (projector/LED, also usable on phones). Every change appears on every screen in real time. When the auction ends, teams that bought fewer than the minimum (3) are disqualified.

## 2. Users
Organizer (admin), audience/spectators (live screen, no login). Team members bid by calling out — they do not use the system in the demonstrated flow. See `USER_ROLES.md`.

## 3. Requirements catalogue

### 3.1 Auction setup
| ID | Requirement | Class | Evidence |
|---|---|---|---|
| R-SETUP-01 | Organizer dashboard listing auctions; create a new auction. | CONFIRMED | 00:04–00:17 speech "यहाँ से ऑक्शन ऐड कर सकते हैं"; 00:00 screen |
| R-SETUP-02 | Duplicate an existing auction (settings, teams, candidates) and work on the copy. | CONFIRMED | 00:04–00:17 "इसको एक duplicate बनाता हूँ"; 00:08 clone dialog |
| R-SETUP-03 | Status filters / delete auctions. | INFERRED | 00:00 tabs, delete icon |
| R-CFG-01 | Configurable purse, base price, bid step, min/max squad, currency; defaults $25M / $1M / $1M / 3–9 / $. | CONFIRMED (values: visual 03:16, speech 05:39–06:14) | |
| R-RULE-02 | The rule logic (minimum, purse, base…) must be changeable later. | CONFIRMED | 06:36–06:53 "ये लोजिक तो चेंज हो सकता है" |
| R-FLOW-01 | Lock the configuration before going live; money/squad rules frozen after locking. | CONFIRMED | 03:22–03:31 "जो कन्फिग्रेशन किया उसको लॉक कर देंगे"; 03:24–03:30 screens |
| R-FLOW-03 | Unlock (before live); reset a rehearsal. | PROPOSED | — |

### 3.2 Teams
| ID | Requirement | Class | Evidence |
|---|---|---|---|
| R-TEAM-01 | Create the teams (five for this event). | CONFIRMED | 00:17–00:34 "मुझे अभी पांच टीम बनानी है" |
| R-TEAM-02 | Team name, colour etc. editable, also later. | CONFIRMED | 00:17–00:49 "बाद में editable भी होना चाहिए", "नाम ऐसे कलर वगैरह सब चेंज होना चाहिए" |
| R-TEAM-03 | Record who plays in (belongs to) each team. | CONFIRMED | 00:34–00:49 "उस टीम में कौन-कौन खेलेगा उसका नाम … ऐड करना चाहिए"; 00:39 owner names |
| R-TEAM-04 | Team logo, short name, display order. | INFERRED | 00:39 edit form |
| R-TEAM-05 | Per-team purse adjustment before locking. | INFERRED | 00:32 "Adjust purse" |

### 3.3 Candidates ("players")
| ID | Requirement | Class | Evidence |
|---|---|---|---|
| R-PLAYER-01 | List of candidates on whom bidding happens. | CONFIRMED | 00:51–01:04 |
| R-PLAYER-02 | Upload a candidate photo; edit name and role (Bowler, All-Rounder …). | CONFIRMED | 01:07–01:22 "इमेज भी अपलोड करने का ऑप्शन चाहिए … रोल क्या है बोलर है और राउंडर है" |
| R-PLAYER-03 | Only a **description** is needed besides name/role/photo; shown under the name; the box grows with the text (flex box). | CONFIRMED | 01:22–01:35 "मुझे ओनली डिस्क्रिप्शन … flex box … अपने आप update" |
| R-PLAYER-04 | Point-wise description: numbered points stay points, bullets stay bullets, new lines stay new lines (like a pre box) — in the dashboard and in the game. | CONFIRMED | 01:35–01:52 "अगर पॉइंट में डाले पॉइंट में आना चाहिए … बुलेट … न्यू लाइन" |
| R-PLAYER-05 | Roles list Batsman / Bowler / All-Rounder / Wicket Keeper (configurable). | CONFIRMED (visual 01:12) | |
| R-PLAYER-06 | Per-candidate base price, photo by URL, bulk import (Excel/CSV), status filters. | INFERRED | 00:51 Import / Template / filters; 01:09 URL |
| R-PLAYER-07 | Manual corrections: assign to team, return to pool, disqualify, reinstate. | INFERRED | 01:18 admin actions |

### 3.4 Live control (back end / admin)
| ID | Requirement | Class | Evidence |
|---|---|---|---|
| R-ADMIN-01 | The back end has a complete admin dashboard; the live screen is a separate front-end link. | CONFIRMED | 04:47–05:02 "front end अलग से link … back end का एक admin dashboard" |
| R-FLOW-02 | Go live from the live console. | CONFIRMED | 03:35–03:43 |
| R-LIVE-01 | "Next player" brings a candidate to the block and onto the screen. | CONFIRMED | 03:59–04:11 |
| R-LIVE-02 | Pick a specific candidate. | INFERRED | 04:00 "Pick player" |
| R-BID-01 | Organizer enters each called-out bid for the team. | CONFIRMED | 04:13–04:47 |
| R-BID-02 | One-tap bid at base / current + step; adjustable next amount. | INFERRED | 04:14 stepper "±$1M" |
| R-BID-06 | Custom amount must be greater than the current bid. | INFERRED | 08:06 |
| R-BID-07 | Custom amount typed in **millions** ("10" = $10M) and assigned to a team — without the reference tool's error. | CONFIRMED | 07:43–08:22 "custom bid करने का भी option … 10 million … error आ रहा है … ऐसा नहीं होना चाहिए" |
| R-BID-08 | Custom bid can never exceed the team's max bid (23 ok, 24 not); the dialog shows each team's max. | CONFIRMED | 08:11–08:56 |
| R-BID-09 | Undo the latest bid; pause/resume; skip; disqualify; unsold; announcement; end auction. | INFERRED | 04:00–04:14 console |
| R-SOLD-01 | When bidding ends, mark SOLD; the screen shows SOLD and the buying team. | CONFIRMED | 04:47–05:02 |
| R-ROUND-01 | Rounds: re-auction unsold candidates. | INFERRED | 03:51 "Round 1" |
| R-REPORT-01 | Bid history, audit log, export, squad reports. | INFERRED | 05:36 sidebar |

### 3.5 Money rules
| ID | Requirement | Class | Evidence |
|---|---|---|---|
| R-RULE-01 | Each team must buy at least **3** candidates. | CONFIRMED | 05:39–05:55 |
| R-PURSE-01 | Purse **$25M** per team, reduced by every purchase. | CONFIRMED | 05:56–06:14, 07:08–07:26 |
| R-MAXBID-01 | Max bid = remaining purse − base × (minimum − bought − 1) → **$23M** for an empty team. | CONFIRMED | 06:53–07:08 explanation; 03:51 value |
| R-MAXBID-02 | Max bid and purse both fall with each purchase; equal once a team has 2. | CONFIRMED | 05:56–06:14 |
| R-SQUAD-01 | Maximum 9 candidates per team. | CONFIRMED (visual 03:16) | |
| R-END-01 | The auction ends after all candidates (organizer ends it). | CONFIRMED | 06:53–07:08 |
| R-END-02 | Teams below the minimum at the end are **disqualified**. | CONFIRMED | 06:53–07:08 |

### 3.6 Live screen (front end)
| ID | Requirement | Class | Evidence |
|---|---|---|---|
| R-DISPLAY-01 | A live-screen link for the main screen; the whole audience sees it. | CONFIRMED | 03:45–04:11 |
| R-DISPLAY-02 | Candidate card in list and card views and on the game screen. | CONFIRMED | 01:53–02:08 |
| R-DISPLAY-03 | Screen shows photo, name, bidding team, description. | CONFIRMED | 02:19–02:35 |
| R-DISPLAY-04 | The **full description** is visible on the main screen (reference truncated it — the client's stated issue). | CONFIRMED | 02:49–03:05, 03:59–04:11 |
| R-DISPLAY-05 | Teams on the side; the team that bids moves to the top. | CONFIRMED | 02:49–03:05, 05:06–05:35 |
| R-DISPLAY-06 | Round, pool and sold counters. | CONFIRMED | 07:26–08:00 |
| R-DISPLAY-07 | Max bid / purse / squad per team on the screen. | CONFIRMED (visual 03:51; speech 08:29 "max bid में जो amount दिख रहा है") | |
| R-DISPLAY-08 | Ticker, multiple of base, SOLD animation, pre-live lineup, final squads board. | INFERRED / PROPOSED | 03:51, 04:33, 05:00 |
| R-RT-01 | Real-time updates "in milliseconds". | CONFIRMED | 05:23–05:35 |

### 3.7 Non-functional
| ID | Requirement | Class |
|---|---|---|
| R-NFR-01 | Server-authoritative state; every action validated on the server. | PROPOSED (required by the master brief) |
| R-NFR-02 | Atomic, idempotent commands; simultaneous actions serialised; no double sale. | PROPOSED |
| R-NFR-03 | Persistence in PostgreSQL; recovery after restart; reconnecting screens resync. | PROPOSED |
| R-NFR-04 | Organizer authentication; CSRF protection; audit log of every action. | PROPOSED |
| R-NFR-05 | Readable on projector / LED wall / laptop / phone; reduced-motion support. | PROPOSED |
| R-NFR-06 | Runs locally on a Windows laptop with no installs beyond Node.js. | PROPOSED |

### 3.8 Winner by combined actual offers and Final Reveal (client request, 1 Nov 2026)
All CONFIRMED by the client's written request unless marked; full rules in `GAME_RULES.md` section 9.
| ID | Requirement | Class |
|---|---|---|
| R-WIN-01 | Team score = sum of the actual annual salaries (USD, excluding bonuses) from the original offer letters of its purchased profiles; highest wins; profile count irrelevant; credits never deducted. | CONFIRMED |
| R-WIN-02 | Per profile: tweaked name, original name, offer letter (PDF/image), verified annual salary, purchasing team, final price in credits. | CONFIRMED |
| R-WIN-03 | Totals update automatically on SOLD; temporary bids never count; corrections/cancellations update credits and totals; each purchase counted once; unsold excluded. | CONFIRMED |
| R-WIN-04 | Original name, letter, salary, team totals and salary rankings hidden from the audience until the final reveal; visible only in the organizer's private view. | CONFIRMED |
| R-WIN-05 | "Start Final Reveal": per purchased profile tweaked name → original name → offer letter → salary → team; each salary added to the team's visible total. | CONFIRMED |
| R-WIN-06 | Final leaderboard: Team · Profiles purchased · Combined annual offer amount · Rank; winner highlighted. | CONFIRMED |
| R-WIN-07 | Ties: more credits remaining wins; still tied → joint winners. | CONFIRMED |
| R-WIN-08 | Purchases and totals preserved on refresh. | CONFIRMED |
| R-WIN-09 | Disqualified teams are not ranked and cannot win. | INFERRED (from R-END-02) |
| R-WIN-10 | Reveal order = purchase order; reveal blocked while a purchased profile has no salary; private data frozen during the reveal; Back / Restart controls. | PROPOSED |

### 3.9 Countdown position (client request with screenshot, 1 Nov 2026)
| ID | Requirement | Class |
|---|---|---|
| R-DISPLAY-09 | The countdown must not sit on the wrong spot (it covered the "Current bid" label); the user can move the timer anywhere on the live screen. | CONFIRMED |
| R-DISPLAY-10 | Default spot next to the current-bid box; drag on the live screen (signed-in organizer) or on the console's screen map; size S–XL; reset; saved per auction for every screen; phones keep the default spot. | PROPOSED (how "anywhere" is offered) |

## 4. Open questions (UNRESOLVED)
| ID | Question | Current behaviour |
|---|---|---|
| ~~Q-01~~ | **Resolved 1 Nov 2026** — the winner is the team with the highest combined actual annual offer amount (section 3.8). | Implemented (R-WIN-01…10). |
| Q-02 | Should team members bid from their own phones (reference shows magic links / access codes, 00:32, 03:27)? The client demonstrated organizer-entered bids only. | Not built; organizer enters bids. |
| Q-03 | Real franchise names (IPL teams in the reference) carry trademark risk on a public screen. | Any names allowed; test and screenshot data use invented names. |
| Q-04 | Countdown: 30 s configured, but "No timer" while bidding. Should time-up auto-sell? | Optional countdown (off by default) that only shows "time up". |
| Q-05 | Are unsold candidates re-auctioned in further rounds? | Organizer may start another round. |
| Q-06 | Unclear audio at 06:18–06:36 — only "…तो यह बोल्ड राइंग बोल्ड" was recovered (“…then this bold [unclear, possibly ‘writing’] bold”) — possibly a request about **bold text** in descriptions. | Not implemented; plain text exactly as typed. |
| Q-07 | Consequence of team disqualification beyond the ranking (prizes, return of candidates?). | Disqualified teams are flagged and not ranked (R-WIN-09); nothing else. |
| Q-08 | Candidate privacy on a public screen (the reference data looked partly masked). | Partly answered by the client on 1 Nov 2026: profiles are shown under **tweaked names**; real names, letters and salaries appear only in the final reveal. Offer letters become viewable by anyone with the display link from their reveal step on. |
