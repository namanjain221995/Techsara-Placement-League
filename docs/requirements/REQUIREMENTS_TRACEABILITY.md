# Requirements Traceability — video evidence → code → tests

Test files: **U** = `tests/unit/rules.test.ts` · **U-W** = `tests/unit/reveal.test.ts` · **I-L** = `tests/integration/live.test.ts` · **I-R** = `tests/integration/realtime.test.ts` · **I-W** = `tests/integration/reveal.test.ts` · **E-F** = `tests/e2e/organizer-flow.spec.ts` · **E-R** = `tests/e2e/resilience.spec.ts` · **E-W** = `tests/e2e/final-reveal.spec.ts` · **I-D** = `tests/integration/display.test.ts` · **E-T** = `tests/e2e/timer-position.spec.ts`.

| Req | Class | Video | Implementation | Verified by |
|---|---|---|---|---|
| R-SETUP-01 create auctions | CONFIRMED | 00:04–00:17 | `server/services/catalog.ts#createAuction`, `src/app/admin/page.tsx` | E-F "organizer runs a complete auction" |
| R-SETUP-02 duplicate auction | CONFIRMED | 00:04–00:17, 00:08 | `catalog.ts#cloneAuction`, clone dialog in `admin/page.tsx` | I-L "creates, configures, clones and locks" |
| R-CFG-01 configurable money/squad | CONFIRMED | 03:16, 05:39–06:14 | `src/shared/schemas.ts#auctionSettingsSchema`, `catalog.ts#updateSettings`, `settings/page.tsx` | I-L setup test |
| R-RULE-02 logic changeable | CONFIRMED | 06:36–06:53 | All rules read settings (`ruleConfig`) | U "supports a different minimum" |
| R-FLOW-01 lock before live | CONFIRMED | 03:22–03:31 | `catalog.ts#lockAuction`, engine `GO_LIVE` requires LOCKED, `LOCKED_FIELDS` | I-L setup (CONFIG_LOCKED, SETUP_INCOMPLETE), E-F |
| R-TEAM-01..03 teams, editable, members | CONFIRMED | 00:17–00:49 | `catalog.ts#createTeam/updateTeam`, `teams/page.tsx` | I-L setup, E-F (UI adds 3 teams with members) |
| R-TEAM-04 logo/short name/order | INFERRED | 00:39 | `uploads.ts`, `setTeamLogo`, `reorderTeams` | type-checked; manual |
| R-PLAYER-01/02 list, photo, name, role | CONFIRMED | 00:51–01:22 | `catalog.ts#createPlayer/updatePlayer/setPlayerPhoto`, `players/page.tsx` | E-F (UI adds 4 candidates) |
| R-PLAYER-03/04 description exactly as typed, auto-growing | CONFIRMED | 01:22–01:52 | `normaliseDescription`, `.description-text {white-space: pre-wrap}`, `Textarea` auto-grow, `Description` | I-L (description round-trip), E-F (list innerText equals typed text) |
| R-PLAYER-06 import/export template | INFERRED | 00:51 | `spreadsheets.ts#parsePlayersFile/playersTemplate` | manual + type-checked |
| R-PLAYER-07 corrections | INFERRED | 01:18 | `engine.ts#override`, `CorrectionsDialog` | I-L "manual corrections with purse refunds" |
| R-ADMIN-01 admin back end vs front-end link | CONFIRMED | 04:47–05:02 | `/admin/**` (auth) vs `/display/[slug]` (public) | E-F, E-R |
| R-FLOW-02 go live | CONFIRMED | 03:35–03:43 | engine `GO_LIVE` | I-L, E-F |
| R-LIVE-01 next player | CONFIRMED | 03:59–04:11 | engine `NEXT_PLAYER` (random/sequential) | I-L, E-F |
| R-BID-01 organizer enters bids | CONFIRMED | 04:13–04:47 | engine `BID`, live console team grid | I-L replay of 04:03–05:00, E-F |
| R-BID-02 one tap = base / +step | INFERRED | 04:14 | `suggestedNextBid`, staged stepper | U, I-L |
| R-BID-06 greater than current | INFERRED | 08:06 | `checkBid NOT_ABOVE_CURRENT_BID` | U, I-L |
| R-BID-07 custom amount in millions | CONFIRMED | 07:43–08:10 | `parseMillions`, `CustomBidDialog` | U "reads typed amounts as MILLIONS", I-L ("10" accepted), E-F |
| R-BID-08 never above max; max shown in dialog | CONFIRMED | 08:11–08:56 | `checkBid EXCEEDS_MAX_BID`, dialog shows "Max $23M" and disables teams | U "rejects 24 … accepts 23", I-L, E-F |
| R-BID-09 undo/pause/skip/DQ/unsold/end | INFERRED | 04:00–04:14 | engine commands | I-L, E-F |
| R-SOLD-01 SOLD shown on screen | CONFIRMED | 04:47–05:02 | engine `SOLD`, `ResultOverlay` | I-L, E-F (overlay + price) |
| R-ROUND-01 next round | INFERRED | 03:51 | engine `NEXT_ROUND` | I-L "re-auctions unsold … next round" |
| R-REPORT-01 history/audit/export | INFERRED | 05:36 | `spreadsheets.ts`, `results/page.tsx` | I-L (export.xlsx 200, audit contains end) |
| R-RULE-01 minimum 3 | CONFIRMED | 05:39–05:55 | `minSquad`, `reservedForMandatorySlots` | U |
| R-PURSE-01 purse $25M decreasing | CONFIRMED | 05:56–06:14 | `teamFinances` (spent derived from SOLD) | I-L (remaining 23,000 after $2M) |
| R-MAXBID-01/02 max-bid formula | CONFIRMED | 05:39–07:08 | `src/shared/rules.ts#maxBid` | U ($23M, $22M), I-L, E-F ($14M after $10M) |
| R-SQUAD-01 max 9 | CONFIRMED (visual) | 03:16 | `checkBid SQUAD_FULL`, `maxBid`=0 when full | U, I-L "enforces the maximum squad" |
| R-END-01/02 end & disqualify below minimum | CONFIRMED | 06:53–07:08 | engine `END_AUCTION` sets `teams.disqualified` | I-L "disqualifies teams below the minimum", E-F (final board) |
| R-DISPLAY-01 live-screen link | CONFIRMED | 03:45–04:11 | `src/app/display/[slug]`, overview copy link | E-F, E-R |
| R-DISPLAY-02 list & card views | CONFIRMED | 01:53–02:08 | players page list/card toggle | manual (screenshots) |
| R-DISPLAY-03/04 photo, name, bidding team, FULL description | CONFIRMED | 02:19–03:05, 03:59–04:11 | `PlayerStage`, `AutoFitDescription` (shrinks font, never truncates) | E-F (display description equals typed text), E-R (3 viewports) |
| R-DISPLAY-05 bidding team moves to top | CONFIRMED | 05:06–05:35 | `orderTeamsForDisplay` + `motion` layout animation | U (reference orders 04:18/04:33/05:15), E-F (first row = leader) |
| R-DISPLAY-06 round/pool/sold | CONFIRMED | 07:26–08:00 | `Header` counters, `stats` (pool excludes on-block) | E-F (pool = 3 with 4 candidates, one on the block) |
| R-DISPLAY-07 max bid / purse / squad | CONFIRMED | 03:51, 08:29 | `TeamBoard` | E-F ($15M purse, $14M max) |
| R-RT-01 real-time ms | CONFIRMED | 05:23–05:35 | Socket.IO room broadcast after commit | I-R (command→display latency logged, < 500 ms asserted) |
| R-NFR-01/02 server authority, atomic, idempotent | PROPOSED | — | `engine.ts` (`runExclusive` + `FOR UPDATE` + `processed_commands`), DB constraints | I-L idempotency, 10-bid burst, SOLD+SOLD+BID race; E-R two operators |
| R-NFR-03 persistence & recovery | PROPOSED | — | PostgreSQL state, `engine.recover()`, client `sync`/re-join | I-R restart test, reconnect test; E-R refresh + offline |
| R-NFR-04 auth, CSRF, audit | PROPOSED | — | `auth.ts`, `audit.ts` | I-L auth test, E-F login test |
| R-NFR-05 layouts & reduced motion | PROPOSED | — | vw/clamp sizing, responsive grid, `prefers-reduced-motion` CSS, `useReducedMotion` | E-R phone/projector/4K screenshots |
| Q-04 countdown never auto-sells | PROPOSED pending Q-04 | 03:16, 04:57 | `armTimer/onTimer` sets `timeUp` only | I-R countdown test |

## Winner by combined actual offers (client request, 1 Nov 2026)
| Req | Class | Source | Implementation | Verified by |
|---|---|---|---|---|
| R-WIN-01 score = Σ annual salaries; count irrelevant; credits not deducted | CONFIRMED | request §1 | `src/shared/rules.ts#rankStandings`, `server/engine/snapshot.ts#standings` | U-W (client example, credits), I-W (431,000 vs 400,000 end to end), E-W |
| R-WIN-02 profile data (tweaked/original name, letter, salary, team, price) | CONFIRMED | request §2 | `players` columns (migration `0001_hidden_salary_reveal.sql`), `catalog.ts#updatePlayer/setOfferLetter`, `uploads.ts#saveOfferLetter`, Candidates page private box | I-W (PDF + PNG upload, type check, organizer-only download), E-W |
| R-WIN-03 hidden totals on SOLD only; corrections; unsold excluded; counted once | CONFIRMED | request §3, §5 | `privateView` (SOLD only), `engine.ts#override` (+ `refreshDisqualification`, post-auction cancellation → UNSOLD) | I-W (bid → $0, SOLD → +salary, RETURN/ASSIGN, unsold $987,654 never counted), E-W |
| R-WIN-04 private data hidden from the audience | CONFIRMED | request §3 | `publicSnapshot`, separate Socket.IO rooms (`auction:<id>:org` / `:pub`), public letter endpoint gated by `revealVisibility` | I-W (every public socket/API payload scanned before the reveal; letters 404), E-W (display text) |
| R-WIN-05 Start Final Reveal, 5 steps, visible totals | CONFIRMED | request §4 | engine `START_REVEAL/REVEAL_NEXT/REVEAL_BACK/RESTART_REVEAL`, `revealView`, `components/display/reveal.tsx`, `components/admin/reveal-console.tsx` | I-W (each step's public payload), E-W (keyboard → steps on the display) |
| R-WIN-06 final leaderboard, winner highlight | CONFIRMED | request §4 | `FinalLeaderboard` | E-W |
| R-WIN-07 ties | CONFIRMED | request §5 | `rankStandings` | U-W |
| R-WIN-08 preserved on refresh | CONFIRMED | request §5 | state in PostgreSQL (`auctions.reveal_*`) | I-W (server restart), E-W (projector reload) |
| R-WIN-09 disqualified teams unranked | INFERRED | 06:53–07:08 | `rankStandings` | U-W, I-W |
| R-WIN-10 order, readiness gate, freeze, back/restart | PROPOSED | — | `START_REVEAL` checks, `assertBeforeReveal`, override guard | I-W |

## Countdown position (client screenshot, 1 Nov 2026)
| Req | Class | Source | Implementation | Verified by |
|---|---|---|---|---|
| R-DISPLAY-09 timer never over the bid; movable anywhere | CONFIRMED | client screenshot + message, 1 Nov 2026 | `src/components/display/countdown.tsx` (default slot next to `display-bid-box`, floating portal at the saved %, drag + double-click for organizers), `components/admin/timer-layout.tsx` (map, sizes, reset), `PUT /auctions/:id/timer-layout`, `auctions.timer_layout` | E-T, I-D, U-W (schema) |
