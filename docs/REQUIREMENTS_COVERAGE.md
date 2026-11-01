# Requirements Coverage

Status: ✅ implemented and verified by automated tests · ☑ implemented, verified manually/visually · ⏸ not built (needs a client decision). Full evidence → code → test mapping: `docs/requirements/REQUIREMENTS_TRACEABILITY.md`.

## CONFIRMED by the client (video)
| ID | Requirement | Status |
|---|---|---|
| R-SETUP-01 | Organizer dashboard, create auctions | ✅ |
| R-SETUP-02 | Duplicate an auction | ✅ |
| R-CFG-01 | $25M purse, $1M base, squad 3–9, USD (configurable) | ✅ |
| R-RULE-02 | Logic changeable (settings) | ✅ |
| R-FLOW-01 | Lock configuration before live | ✅ |
| R-FLOW-02 | Go live | ✅ |
| R-TEAM-01/02/03 | Five teams; name/colour editable later; members | ✅ |
| R-PLAYER-01/02 | Candidate list; photo upload; name; role | ✅ (photo upload integration-tested; UI upload ☑) |
| R-PLAYER-03/04 | Description only; grows with text; points/bullets/new lines exact | ✅ |
| R-PLAYER-05 | Roles Batsman/Bowler/All-Rounder/Wicket Keeper | ✅ |
| R-DISPLAY-01 | Separate live-screen link for the audience | ✅ |
| R-DISPLAY-02 | List view, card view, game screen | ☑ (list ✅ in E2E; card view visual) |
| R-DISPLAY-03/04 | Photo, name, bidding team, **full** description on screen | ✅ |
| R-DISPLAY-05 | Bidding team moves to the top | ✅ |
| R-DISPLAY-06 | Round, pool, sold counters | ✅ |
| R-DISPLAY-07 | Max bid / purse / squad per team | ✅ |
| R-ADMIN-01 | Complete admin back end, separate from the front-end link | ✅ |
| R-LIVE-01 | Next player | ✅ |
| R-BID-01 | Organizer enters called-out bids | ✅ |
| R-BID-07 | Custom bid typed in millions; no error | ✅ |
| R-BID-08 | Custom bid ≤ team max (24 ✗, 23 ✓); max shown in dialog | ✅ |
| R-SOLD-01 | SOLD shown on screen | ✅ |
| R-RT-01 | Real-time updates (command → screen under 25 ms on localhost, measured) | ✅ |
| R-RULE-01 | Minimum 3 per team | ✅ |
| R-PURSE-01 | Purse decreases with purchases | ✅ |
| R-MAXBID-01/02 | Max bid formula ($23M → $22M; equal to purse after 2) | ✅ |
| R-SQUAD-01 | Maximum 9 | ✅ |
| R-END-01/02 | End; disqualify teams below minimum | ✅ |

**Confirmed requirement IDs: 35 / 35 implemented** — 33 covered by automated tests; the card view and the photo-upload dialog were checked visually (the upload API itself is integration-tested).

## CONFIRMED by the client (written request, 1 Nov 2026) — winner by combined actual offers
| ID | Requirement | Status |
|---|---|---|
| R-WIN-01 | Score = sum of actual annual salaries (USD, excl. bonuses) of purchased profiles; profile count irrelevant; credits not deducted | ✅ unit + integration (client example $431,000 vs $400,000) |
| R-WIN-02 | Per profile: tweaked name, original name, offer letter (PDF/image), verified salary, team, price | ✅ integration + E2E |
| R-WIN-03 | Hidden totals update on SOLD only; corrections/cancellations update credits and totals; unsold excluded | ✅ integration + E2E |
| R-WIN-04 | Nothing private reaches the audience before the reveal (socket, API, letters) | ✅ integration (every public payload checked) + E2E |
| R-WIN-05 | Start Final Reveal; 5 steps per profile; salary added to the visible total | ✅ integration + E2E |
| R-WIN-06 | Final leaderboard with winner highlight | ✅ E2E |
| R-WIN-07 | Ties: credits remaining, then joint winners | ✅ unit |
| R-WIN-08 | Preserved on refresh / server restart | ✅ integration (restart) + E2E (refresh) |

## CONFIRMED by the client (screenshot, 1 Nov 2026) — countdown position
| ID | Requirement | Status |
|---|---|---|
| R-DISPLAY-09 | Countdown never covers the current bid; movable anywhere | ✅ E2E (no overlap at 1920×1080, 1366×768, 1112×625; drag on the live screen and on the console map; size; reset; refresh) + integration (API, broadcast, access) |

## INFERRED from the demonstrated reference flow
| ID | Requirement | Status |
|---|---|---|
| R-SETUP-03 | Status filters, delete | ☑ (delete ✅ API) |
| R-TEAM-04/05 | Logo, short name, order; per-team purse before lock | ☑ |
| R-PLAYER-06 | Base price per candidate, photo URL, Excel/CSV import, filters | ✅ import / ☑ rest |
| R-PLAYER-07 | Manual corrections | ✅ |
| R-LIVE-02 | Pick a specific candidate | ☑ |
| R-BID-02 | One tap = base / current + step; stepper | ✅ |
| R-BID-06 | Bid must exceed current | ✅ |
| R-BID-09 | Undo, pause/resume, skip, disqualify, unsold, announcement, end | ✅ |
| R-ROUND-01 | Rounds for unsold candidates | ✅ |
| R-REPORT-01 | Bid history, audit log, Excel export, squad reports | ✅ |
| R-DISPLAY-08 | Ticker, multiple of base, SOLD animation, pre-live line-up, final board | ✅ / ☑ |

## PROPOSED (engineering & UX)
Server authority, idempotency, serialisation of simultaneous actions, persistence and crash recovery, reconnection, auth/CSRF/audit, responsive projector/phone/4K layouts, reduced motion, keyboard shortcuts, rehearsal reset, optional countdown (never auto-sells), synthesized sound, zero-install embedded PostgreSQL — **all built; server-side items ✅ tested**.

## UNRESOLVED (not built — see KNOWN_LIMITATIONS.md)
⏸ Q-02 team phone bidding · ⏸ Q-04 auto-sell on time-up · ⏸ Q-06 bold text in descriptions · ⏸ Q-07 consequences of disqualification beyond ranking · ⏸ Q-09 reveal order (purchase order used) · ⏸ Q-10 salary/team step order (as listed by the client). Q-01 (winner) was resolved by the client on 1 Nov 2026. (Q-03, Q-05, Q-08 are handled by configurable behaviour.)
