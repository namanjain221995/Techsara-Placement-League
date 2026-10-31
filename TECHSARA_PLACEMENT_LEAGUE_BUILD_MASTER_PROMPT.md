# BUILD MASTER PROMPT — TechSara Placement League

> Generated after analysing the client's Hindi/Hinglish requirement video (`game building auction.mp4`, 9:01), the reference sites cricsmart.in / auction.cricsmart.in, and designing the architecture. It is a standalone, implementation-ready brief: another senior agent can rebuild the same application from it. Evidence for every requirement is in `docs/requirements/REQUIREMENTS_TRACEABILITY.md`. Timestamps (mm:ss) refer to the client video.

---

## 1. Project description
Build **TechSara Placement League (TPL)**: a self-hosted, real-time **live auction game** for an internal TechSara event. Teams of colleagues (5 in the client's event) receive the same virtual purse ($25M) and buy job **candidates** (20) at a live auction. An **organizer** runs the room from an admin console and types in the bids that people call out; the audience watches a **live screen** (projector/LED wall/phones) that updates within milliseconds. Teams that end with fewer than the minimum number of candidates (3) are **disqualified**.

The client demonstrated CricSmart Auction and said: "I want exactly this functionality — build it very well" (04:29–04:47), with specific fixes: full point-wise descriptions on screen, custom bids typed in millions, and custom bids capped at each team's max bid. It must be a real full-stack app (server-validated, persisted, real-time), not a mock-up.

## 2. Confirmed client requirements (must build)
1. Organizer dashboard to create auctions and **duplicate** an auction (00:04–00:17).
2. Teams: create five; name, colour and **members** ("who plays in that team"); editable later (00:17–00:49).
3. Candidates: list; **photo upload**; name; **role** (Batsman, Bowler, All-Rounder, Wicket Keeper) (00:51–01:22).
4. **Only a description** besides name/role/photo, shown under the name, in a **box that grows** with its content (01:22–01:35).
5. Description is **point-wise and exact**: numbers stay numbers, bullets stay bullets, new lines stay new lines — in the dashboard and in the game (01:35–01:52).
6. Candidate shown in **list view, card view and on the game screen** (01:53–02:08).
7. Game screen shows **photo, name, bidding team, description** (02:19–02:35) and the **FULL description — never truncated** (02:49–03:05, 03:59–04:11).
8. **Lock the configuration**, then **Go live** from the live console (03:22–03:43).
9. A separate **live-screen link** for the main screen that the whole audience sees; the admin back end is separate (03:45–04:11, 04:47–05:02).
10. **Next player** brings the next candidate on screen (03:59–04:11).
11. Organizer **enters bids for teams** as they are called out (04:13–04:47).
12. The **team that bids moves to the top** and the current price updates (05:06–05:35).
13. **SOLD** when bidding ends, shown on the screen (04:47–05:02).
14. **Real-time** updates, as fast as possible (05:23–05:35).
15. Five teams; **minimum 3** candidates each; **purse $25M**; **max bid $23M** = purse − base × (minimum − 1); purse and max bid fall with each purchase; equal once a team owns 2 (05:39–07:08).
16. The rule **logic must be configurable** (06:36–06:53).
17. When all candidates are done, teams **below the minimum are disqualified** (06:53–07:08).
18. Screen shows **round, pool and sold** counters (07:26–08:00).
19. **Custom bid**: type a number meaning **millions** ("10" = $10M), choose the team; must not error (07:43–08:10).
20. A custom bid can **never exceed the team's max bid** (max 23 → 24 impossible, 23 possible) and the dialog **shows every team's max bid** (08:11–08:56).
Visual configuration confirmed: base $1M, purse $25M, squad 3–9, currency USD, 5 teams, 20 candidates (03:16).

**Optional enhancements built (clearly labelled, not client-confirmed):** bid step stepper and quick multiples (Base/Next/+50%/2×/3×/5×), undo/skip/disqualify/pause, pick a candidate, rounds for unsold candidates, announcement ticker, bid history, audit log, Excel import/export, manual corrections, rehearsal reset, optional countdown (never auto-sells), keyboard shortcuts, synthesized sound, SOLD animation, pre-live line-up, final squads board.

**Do not build without a client decision:** team members bidding from their phones (Q-02), winner/scoring (Q-01), auto-sell on timer (Q-04), bold text in descriptions (Q-06, unclear audio).

## 3. Exact game mechanics
- **Money unit:** store integers in thousands (1000 = $1M); display and accept **millions**.
- **Opening bid** ≥ base price (candidate base or auction base). One tap = base for the opening bid, otherwise current + step ($1M).
- **Any bid** must be > current bid; team must exist; squad not full (< 9); team not already leading; amount ≤ **max bid**.
- **Max bid** = 0 if squad full, else `max(0, (purse − spent) − base × max(0, min − bought − 1))`.
- **SOLD** → candidate to leading team at current bid; spent/squad derived from SOLD candidates (refunds automatic on correction).
- **UNSOLD** → candidate status UNSOLD; **SKIP** → back to pool; **DISQUALIFY** → out of the auction.
- **Next round** (pool empty, unsold > 0) → unsold back to pool, round + 1.
- **End** (no open lot) → `disqualified = squad < min` for each team; no winner is declared.
- **Display order** of teams: leading team first; others by most bought, then most spent, then organizer order.
- **Pool counter** excludes the candidate currently on the block.
- **Countdown** (optional): restarts on every bid, freezes on pause, sets "time up" at zero, never sells.

## 4. User roles and permissions
Organizer (authenticated, full control, all actions audited); Spectator (public read-only live screen via unguessable code); Team members (names only; bid by calling out). See `docs/requirements/USER_ROLES.md`.

## 5. Frontend screens
`/` landing · `/login` · `/admin` auctions list (filters, create, duplicate, delete) · `/admin/auctions/:id` overview (checklist, lock/unlock/reset, live-screen link, rule explanation) · `…/teams` · `…/players` (list ⇄ cards, import, corrections) · `…/settings` · `…/live` live console · `…/results` (squads, bid history, audit, Excel) · `/display/:code` live screen (pre-live, waiting, on the block, paused, SOLD/UNSOLD overlay, final squads). Blueprints: `docs/design/SCREEN_BLUEPRINTS.md`.

## 6. Backend services
Express 5 REST API; AuctionEngine (live commands, corrections, setup mutations, countdown, crash recovery); snapshot builder (single read model); catalog (auctions/teams/candidates, clone, lock/unlock/reset); spreadsheets (import, template, results, bid history, audit, XLSX export); uploads (magic-byte checked images); auth (sessions, CSRF); audit log.

## 7. Database schema requirements
PostgreSQL tables `admins, sessions, auctions, teams, players, lots, bids, processed_commands, audit_logs` with: unique display code; one OPEN lot per auction (partial unique index); unique candidate number per auction; unique team name per auction; CHECK sold consistency; positive money; squad/timer/round checks; `auctions.version` incremented by every change. Details: `docs/architecture/DATABASE_DESIGN.md`.

## 8. Real-time communication rules
Socket.IO rooms per auction; client `join {slug|auctionId}` → full snapshot; server emits full versioned `state` after every committed change; clients ignore older versions, re-join on reconnect, `sync` every 15 s, measure clock offset for countdowns. Commands travel over HTTP with idempotency keys, never over the socket. `docs/architecture/REALTIME_EVENT_PROTOCOL.md`.

## 9. Authentication and security
bcrypt passwords; random session token (SHA-256 stored) in HttpOnly SameSite cookie; CSRF header + Origin check; login rate limit; Zod validation; magic-byte image checks (no SVG); audit log; helmet headers; generic 500s. `docs/architecture/SECURITY_DESIGN.md`.

## 10. UI design direction
Original "Night Stadium" identity: navy stadium night, trophy gold money, electric blue system cues, team colours as accents; Oswald (display) + Inter (text); fluid `clamp()` sizing readable from the back of a hall; no third-party brands. `docs/design/DESIGN_SYSTEM.md`.

## 11. Animation specifications
Candidate slide-in, bid roll-up, animated leader reorder with team-colour glow, SOLD stamp slam + confetti in team colours + optional gavel, countdown ring, ticker marquee; ≤ 0.6 s; transform/opacity only; full reduced-motion support. `docs/design/ANIMATION_PLAN.md`.

## 12. Admin workflows
Create or duplicate → settings → teams (members, colours, logos) → candidates (photo, role, point-wise description, or Excel import) → overview checklist → lock → open live screen on projector → live console: Go live → Next/Pick candidate → tap team (or custom amount) per called bid → Sold/Unsold/Skip/Disqualify/Undo → repeat → next round if needed → End auction → Results/Excel. Rehearsal: Reset.

## 13. Gameplay workflows
Audience sees "starting soon" line-up → "next candidate coming up" → candidate with full description and current bid, leading team floating to the top → SOLD celebration with buying team and price → counters/ticker update → final squads with Qualified/Disqualified.

## 14. API contracts
`docs/architecture/API_SPECIFICATION.md` (auth, auctions, live commands with all error codes, teams, candidates, corrections, results/exports, public snapshot).

## 15. Data validation rules
Names 1–80 chars (teams 1–60, short name 1–6, upper-cased); colour `#RRGGBB`; members ≤ 12; description ≤ 4000 chars kept verbatim (only CRLF → LF and trailing spaces trimmed); money positive integers (k); min 0–50, max 1–50, min ≤ max; purse ≥ base × max(min,1); countdown 5–600 s; roles 1–12; photo URL http(s); commands need UUID `commandId`; import rows validated all-or-nothing with row numbers.

## 16. Error handling
Typed `AppError` (status + code + human message naming the team and limit, e.g. "Hire Hawks can bid at most $23M (…)"); Zod → 400 with field details shown inline; Postgres unique violation → 409 DUPLICATE; unknown → 500 "not applied"; UI shows toasts and inline field errors; console never applies optimistic state (it renders the server's snapshot); confirmations for destructive actions.

## 17. Testing strategy
Unit (rules & money incl. the client's numbers), integration on real PostgreSQL through the HTTP API and sockets (auth, setup, the 04:03–05:00 replay, 24-vs-23, idempotency, 10 simultaneous bids, SOLD race, undo/rounds/end/disqualification, corrections, latency, reconnect, countdown, crash recovery), Playwright E2E on the production build (full UI flow with display, refresh/offline recovery, two operators, phone/projector/4K). `docs/TEST_REPORT.md`.

## 18. Deployment architecture
Single Node process (UI + API + WebSocket) + PostgreSQL. Local: embedded PostgreSQL, `npm run setup`, `npm run build && npm start`, projector opens `http://<laptop-ip>:3000/display/<code>`. Server: reverse proxy with TLS (WebSocket upgrade), managed PostgreSQL via `DATABASE_URL`, `COOKIE_SECURE=true`, persistent `UPLOAD_DIR`, backups. `docs/DEPLOYMENT_GUIDE.md`.

## 19. Development phases
A foundation (Next + Express + Socket.IO + Drizzle + embedded PG) → B schema/migrations, auth, audit → C pure rules + engine with transactions/idempotency → D real-time snapshots, reconnect, countdown, recovery → E design system + organizer pages → F live console → G live screen → H animation polish → I results/exports/import → J tests, production build, docs.

## 20. Acceptance criteria
- AC1 Organizer can create, duplicate, configure, lock and go live without touching code.
- AC2 Typed description appears identically (line breaks, numbering, bullets) in the list, the card view, the console and the live screen; the screen never truncates it.
- AC3 With $25M / $1M / min 3, every empty team shows max bid $23M; after a $2M purchase $22M; after a $10M purchase $14M.
- AC4 Typing "24" for a team with max $23M is impossible (UI disables, server rejects); "23" is accepted; "10" means $10M.
- AC5 The leading team is first on the live screen within one second of the bid.
- AC6 SOLD updates purse, max bid and squad on every screen and shows the buying team.
- AC7 Ending the auction disqualifies teams below the minimum; final board shows it.
- AC8 Two operators bidding simultaneously never produce two accepted bids at the same price; a double-sent request is applied once.
- AC9 Refreshing or reconnecting any screen shows the exact current state; a server restart loses nothing.
- AC10 Works on a 1920×1080 projector, a 4K wall and a phone; production build passes; all tests pass.

## 21. Requirement-to-code traceability
Maintain `docs/requirements/REQUIREMENTS_TRACEABILITY.md`; reference requirement IDs (R-…) in code comments at the implementation points (e.g. `src/shared/rules.ts#maxBid` → R-MAXBID-01).

## 22. Final verification checklist
- [ ] `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e` all green, outputs recorded in TEST_REPORT.md
- [ ] AC1–AC10 demonstrated (E2E or manual), screenshots kept
- [ ] Every CONFIRMED requirement has evidence + implementation + verification in the traceability matrix
- [ ] Open questions listed in KNOWN_LIMITATIONS.md and the delivery report
- [ ] Fresh clone: `npm install && npm run setup && npm run dev` works with no other installs
- [ ] No real candidate/team data or credentials in the repository; demo data fictional
