# Game Rules — TechSara Placement League

Each rule names its source in the client video (`game building auction.mp4`, mm:ss) and its classification:
**CONFIRMED** (stated or demonstrated) · **INFERRED** (strongly implied by the reference flow the client asked to replicate) · **PROPOSED** (engineering safeguard) · **UNRESOLVED** (needs the client).

## 1. What the game is
A live auction in which **teams** spend a fixed virtual **purse** to buy **candidates**. An organizer runs the auction from an admin console; the audience follows on a big **live screen**. The client demonstrated the flow on CricSmart and asked for the same functionality, built properly (04:29–04:47 "बस मुझे यही फंक्शनेलिटी चाहिए … अच्छे से बनाओ"). — CONFIRMED

## 2. Configuration of the client's event
| Setting | Value | Source | Class |
|---|---|---|---|
| Teams | 5 | speech 00:17–00:34, 05:39; screen 00:20 | CONFIRMED |
| Candidates | 20 | speech 06:53–07:08 ("20 candidates"); screen 00:15 | CONFIRMED |
| Purse per team | $25M | speech 05:56–06:14; screen 03:16 | CONFIRMED |
| Base price | $1M | screen 03:16; speech 06:53 ("1 million के 2 candidates") | CONFIRMED |
| Minimum candidates per team | 3 | speech 05:39–05:55, 06:53–07:08 | CONFIRMED |
| Maximum candidates per team | 9 | screen 03:16 ("Squad size 3–9") | CONFIRMED (visual) |
| Currency / unit | US$, millions | screens throughout | CONFIRMED (visual) |
| Bid step | $1M | screen 04:14 ("±$1M") | INFERRED |
| Countdown | 30 s configured, but the live console showed "Auctioneer — No timer" | screens 03:16, 04:57 | UNRESOLVED (Q-04) |

All values are organizer settings ("this logic can be changed" — 06:36–06:53, CONFIRMED). Money and squad rules freeze when the configuration is locked.

## 3. Before the auction
1. Create the auction, or **duplicate** an existing one with its teams and candidates (00:04–00:17). — CONFIRMED
2. Add teams: name, colour, members ("who plays in that team"); editable later (00:17–00:49). — CONFIRMED. Logo and short name — INFERRED (edit form 00:39).
3. Add candidates: photo, name, role (e.g. Bowler, All-Rounder), point-wise description (01:07–01:52). — CONFIRMED
4. **Lock the configuration**, then **Go live** (03:22–03:43). — CONFIRMED

## 4. Bidding
| # | Rule | Source | Class |
|---|---|---|---|
| B1 | The organizer brings up the next candidate ("Next player"); the live screen shows them immediately. | 03:59–04:11 | CONFIRMED |
| B2 | Bids are called out in the room and entered by the organizer for the calling team ("किसी ने बोला कि Delhi Capitals पर 2 million … मैंने यहाँ 2 million update किया"). | 04:13–04:47 | CONFIRMED |
| B3 | The opening bid is at least the base price; one tap raises by the bid step. | 04:14 (first bid $1M "by Unknown" → RCB $1M → DC $2M) | INFERRED |
| B4 | A custom amount can be typed **in millions** ("10" = $10M) and assigned to a team; this must not error. | 07:43–08:10 | CONFIRMED |
| B5 | A bid must be greater than the current bid. | 08:06 reference message | INFERRED |
| B6 | **A team can never bid more than its max bid** — e.g. max 23 → 24 impossible, 23 possible. The custom-bid dialog shows each team's max bid. | 08:11–08:56 | CONFIRMED |
| B7 | A team whose squad is full (9) cannot bid. | screen 03:16 | INFERRED |
| B8 | The team holding the highest bid cannot raise against itself (double-tap protection). | — | PROPOSED |
| B9 | The organizer can undo the latest bid. | screen 04:14 ("Undo bid") | INFERRED |
| B10 | Simultaneous actions are applied one at a time; a request is never applied twice. | real-time requirement 05:23–05:35 | PROPOSED (engineering) |

## 5. Max-bid formula (CONFIRMED by the client's explanation and the reference numbers)
```
remaining purse = purse − total spent on bought candidates
reserved        = base price × max(0, minimum − candidates bought − 1)
max bid         = 0 if squad is full, else max(0, remaining purse − reserved)
```
Client (06:53–07:08): "Why 23? Minimum 3 must be bought; with the max at 23, two candidates of 1 million can still come later."
Client (05:56–06:14): "as bids happen it keeps reducing from the purse and from the maximum bid; as soon as a team has two, both values become the same."
Check: empty team → 25 − 1 × 2 = **$23M** (screen 03:51). After buying one for $2M → remaining 23, reserved 1 → **$22M** (screen 05:00). After two buys → reserved 0 → max bid = remaining purse (the "both values the same" statement).

## 6. Closing a candidate
| # | Rule | Source | Class |
|---|---|---|---|
| C1 | **SOLD** to the leading team at the current bid; shown on the screen. Purse, max bid and squad update immediately. | 04:47–05:02, screens 04:57–05:00 | CONFIRMED |
| C2 | **Unsold** — nobody buys; the candidate can return in a later round. | console 04:14; rounds shown 07:26 | INFERRED |
| C3 | **Skip** — back to the pool without a result; **Disqualify** — removed from the auction. | console 04:14 | INFERRED |
| C4 | Next round: when the pool is empty, unsold candidates go back to the pool and the round number increases. | "Round" counter 03:51, 07:26 | INFERRED |
| C5 | A countdown, if enabled, restarts on every bid and shows "time up"; it never sells automatically. | Q-04 | PROPOSED pending Q-04 |

## 7. End of the auction
| # | Rule | Source | Class |
|---|---|---|---|
| E1 | The auction ends when the organizer ends it (normally after all candidates are processed). | 06:53–07:08 ("20 candidates खतम") | CONFIRMED |
| E2 | **Teams with fewer than the minimum (3) candidates are disqualified.** | 06:53–07:08 | CONFIRMED |
| E3 | What disqualification means for prizes/ranking, and how a league winner is determined, was **not stated**. The app declares **no winner**; it shows final squads with Qualified / Disqualified. | — | UNRESOLVED (Q-01, Q-07) |

## 8. What the screen shows (CONFIRMED unless marked)
Candidate photo, name, role, full point-wise description (01:53–03:05, 03:59–04:11); current bid and the team bidding (02:19–02:35, 04:29–04:47); the team list with max bid / purse / squad, leading team on top (05:06–05:35; columns visible 03:51); round, pool and sold counts (07:26–08:00); SOLD with the buying team (04:47–05:02). Ticker, multiple of base price, final squads board — INFERRED/PROPOSED.
