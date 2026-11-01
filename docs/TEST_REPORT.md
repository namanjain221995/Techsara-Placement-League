# Test Report

Environment: Ubuntu 24.04.5 (cloud build container), 2 vCPU, 7.8 GB RAM, Node.js 22.23.4, embedded PostgreSQL 18.6, Chromium (Playwright 1.63.0). Dates: 31 Oct 2026 (first delivery) and **1 Nov 2026** (winner by combined actual offers + Final Reveal — see the section at the end). Every result below was produced by actually running the command on the code of that date; nothing is extrapolated.

## Summary
| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit -p tsconfig.json` | ✅ 0 errors |
| Lint | `npx eslint .` | ✅ 0 errors, 0 warnings (one justified inline disable: hard redirect on expired session in `src/lib/api.ts`) |
| Formatting | `npx prettier --check .` | ✅ all code files formatted (docs excluded by `.prettierignore`) |
| Production build | `rm -rf .next && npx next build` (Next.js 16.4.3, Turbopack) | ✅ clean build, 11 routes |
| Unit tests | `npx vitest run` (project `unit`) | ✅ **39 / 39** (1 Nov 2026, latest; 37 after the salary winner, 25 on 31 Oct) |
| Integration tests (real PostgreSQL, HTTP + WebSocket) | `npx vitest run` (project `integration`) | ✅ **25 / 25** (1 Nov 2026, latest; 24 after the salary winner, 21 on 31 Oct) |
| End-to-end (production build, Chromium) | `npx playwright test` | ✅ **7 / 7** on 1 Nov 2026 after a clean rebuild — run 4 times in a row on fresh databases (1.2–1.3 min each); 6 / 6 after the salary winner, 5 / 5 on 31 Oct |
| Real-time latency (command → public display, localhost) | logged by `realtime.test.ts` | **14.3 ms, 11.8 ms, 9.4 ms** on 1 Nov 2026 (31 Oct: 12.5 / 9.9 / 16.7; earlier runs 12.8 / 8.6 / 15.9, 23.9 / 9.1 / 9.9, 14.5 / 10.5 / 10.7, 12.6 / 9.5 / 10.6 ms); assertion < 500 ms |
| Docker image steps (outside Docker) | clean `npm ci` → `next build` → `npm ci --omit=dev` → `node --import tsx server/index.ts` in the image's runtime layout, against a fresh external PostgreSQL | ✅ migrations on an empty database, generated organizer password printed, health check 200, demo seed (`--force`), full UI run + auction to the end, 0 page errors, clean SIGTERM shutdown. The image could not be built on the build machine (container registries blocked); `docker compose config` validates the compose file. |
| Docker Compose on the client laptop (Windows 11, Docker Desktop) | `start-with-docker.cmd` → `docker compose up -d --build`; `add-demo-auction.cmd` | ✅ image built (≈ 2 min), `db` and `app` containers running, port 3000 published, the app answered its health check and served the organizer sign-in page at `http://localhost:3000`, demo auction created. |
| GitHub Actions CI (`.github/workflows/deploy.yml`, ubuntu-24.04 runner) | runs #1 and #2 on `main` | ✅ typecheck, lint, format check, unit + integration tests, production build and end-to-end tests passed on GitHub's runners; the deploy job was skipped until the repository secrets were added |
| Production deployment (GitHub Actions → EC2 → Cloudflare Tunnel) | run #3 on `main`; checks against `https://tpl.techsarasolutions.com` | ✅ deploy job connected as `ec2-user`, built and started the containers; `/api/health` → `{"ok":true}` through Cloudflare; `/admin` redirects to the sign-in page; the live screen's Socket.IO channel answers through the tunnel (unknown display code → "Display link not found") |
| Demo run against the production server | scripted (Playwright + organizer API), see below | ✅ full demo auction played to the end; 15 screenshots, **0 page errors, 0 console errors** |

## Unit — `tests/unit/rules.test.ts` (25)
Money formatting and parsing (typed amounts are **millions**: "10" → $10M, "23" → $23M, junk rejected); max bid **$23M** empty team, **$22M** after a $2M buy, no reserve after 2 buys, 0 when full, never negative, alternative minimum; opening bid = base, step +$1M; quick amounts Base $1M · Next $3M · +50% $4.5M · 2× $6M · 3× $9M · 5× $15M (as on the reference at 07:57); `checkBid`: valid raise, **24 rejected / 23 accepted**, custom 10M accepted on a $2M lot, not-above-current, below-base, self-outbid, squad full, paused/not live/no candidate/unknown team/bad amount; display order reproducing the reference at 03:51, 04:18, 04:33, 05:15; disqualification below minimum; setup checks.

## Integration — `tests/integration/*.test.ts` (21, real PostgreSQL + HTTP + Socket.IO)
| Area | Tests |
|---|---|
| Auth | anonymous 401, wrong password 401, missing CSRF header 403, login/logout; server-side validation 400 |
| Setup | create, configure, teams, candidates (**description round-trips byte-for-byte**), duplicate (counts copied), lock (blocked when incomplete), money settings frozen after lock (`CONFIG_LOCKED`), cosmetic edits still allowed, unlock |
| Video replay 04:03–05:00 | next candidate (no bid, base $1M) → one-tap bid $1M → $2M by another team → SOLD → purse $23M, **max $22M**, squad 1; stats sold 1 / pool 19 |
| Custom ceiling 08:11–08:56 | $24M → 409 `EXCEEDS_MAX_BID` mentioning $23M; $10M accepted; $23M accepted |
| Rules | not above current, self-outbid, paused blocks bids, resume, one-tap = current + step |
| Idempotency | same `commandId` twice → applied once, `duplicate: true`, same version |
| Concurrency | **10 simultaneous identical raises → exactly 1 accepted**, others `NOT_ABOVE_CURRENT_BID`/`ALREADY_LEADING`; **SOLD + SOLD + BID race → sold exactly once**, spent = sale price |
| Lot outcomes | undo ×2 restores leaders, `NO_BIDS` guards, unsold, skip, disqualify (pool/unsold/DQ counts) |
| Squad & rounds | max squad enforced (`SQUAD_FULL`), `POOL_EMPTY`, next round re-pools unsold |
| End | `LOT_OPEN` guard; teams with 0 and 1 candidates **disqualified**, team with 3 qualified; results; Excel export 200; audit contains `live.end_auction` |
| Corrections | assign above max rejected; assign $5M → spent 5000; return to pool → refund, max back to $23M |
| Real-time | display receives every change (latency logged); organizer room requires session; unknown code → `NOT_FOUND`; reconnect gets the newer version; `sync` |
| Countdown | server deadline, restarted by a bid, frozen by pause, resumed, **time-up flagged without selling** |
| Crash recovery | server + database stopped and restarted → same version, open lot, current bid and leader; SOLD still works |
| Import & uploads | downloaded Excel template imports unchanged (2 candidates, multi-line description and $1.5M base kept); CSV import with quoted multi-line description; invalid row → 400 `IMPORT_INVALID` with row numbers and **nothing imported**; SVG upload refused (`UNSUPPORTED_IMAGE`); PNG served as `image/png` with `nosniff` |

## End-to-end — `tests/e2e/*.spec.ts` (5, production build on port 3100, isolated DB)
1. **Login guard** — `/admin` redirects to login; wrong password message; correct password enters.
2. **Complete auction through the real UI with a 1920×1080 display following live** — create auction; add 3 teams with members via dialogs; add 4 candidates with a point-wise description (**list shows it exactly**); lock; open console; display shows *starting soon*; go live → *next candidate coming up*; next candidate → display name and **full description identical to what was typed**; pool counter excludes the candidate on the block; tap bids $1M → $2M with the leader **first** on the display; custom amount **24 → every team disabled, "Max $23M" shown**; custom 10 → $10M on display; SOLD → overlay with $10M, team row purse **$15M** and max **$14M**; undo → "Awaiting the opening bid"; keyboard **P** pause → paused banner, resume; unsold with confirmation; end auction with the disqualification warning → final board shows **Disqualified** and the $10M purchase.
3. **Refresh & network loss** — display reload restores bid and leader; display offline while two bids happen → reconnects to $7M and the correct leader.
4. **Two operators at once** — two signed-in consoles click different teams together; accepted bids are strictly increasing with no duplicate price, and both consoles converge to the server state.
5. **Layouts** — phone 390×844, projector 1920×1080, LED wall 3840×2160 all render bid, leading team row and full description (copies of the screenshots in `docs/screenshots/`).

## Demo run on the production server (`npm run start`)
*The fictional demo seed used for this run (`npm run db:reset`) was removed from the project afterwards, at the client's request, before production use.*
Driven by a Playwright script through the real UI, then finished through the organizer API:
- Organizer pages (auctions, overview, teams, candidates, settings, results) and the live console rendered with the demo data.
- Live screen at 1920×1080 before going live, waiting, bidding ($1M → $2M → $3M), SOLD overlay ($10M custom bid), and on a phone (390×844).
- Custom amount **24 → every team marked “Above max”, Max $23M shown** (the client's request at 08:11–08:56).
- The candidate on the block and the remaining 18 were auctioned to the end: **14 sold, 6 unsold, total spent $61M**; Recruit Rockets finished with 2 candidates and was shown **Disqualified · below minimum 3**, the other four teams **Qualified**; purses and spent amounts checked by hand against the sale prices.
- Excel export downloaded: sheets *Summary*, *Squads*, *Unsold & Pool*, *Bid History*; spot-checked squad prices match the screen.
- No page errors or console errors in any browser context.

## Defects found by testing and fixed
| Found by | Defect | Fix |
|---|---|---|
| Visual review (screenshots) | Pool counter included the candidate on the block (reference shows it excluded) | Snapshot stats exclude the on-block candidate |
| Visual review | Long team names truncated on the display; cramped team table on phones; SOLD stamp covering the surname | Two-line names, rem-based phone columns, stamp moved |
| E2E | **Two current-bid elements could stay on the display** after a reconnect (exit animation of the old amount never finished) | Enter-only keyed animation; old value removed instantly |
| E2E | Form labels not programmatically linked to inputs (accessibility) | `Field` auto-links label → control |
| Lint (React hooks rules) | setState inside effects (stake reset, settings form, dialog reset, overlay, live hook) | Derived state / "adjust state on input change" pattern |
| Test design | Two E2E tests assumed exact click timing / exact chip text | Assertions made timing-independent; exact-tie races remain covered by integration tests |
| Writing this report | Excel template's tips row sat in the Name column, so importing the unedited template failed | Tips moved to an *Instructions* sheet; import test added |
| Demo run (server log) | Every start printed a harmless PostgreSQL `database "tpl" already exists` ERROR, and `db:reset` ended with a dangling-connection error | The app checks `pg_database` before `CREATE DATABASE`; fresh-directory and existing-directory starts both re-verified |
| Demo screenshots | Custom-bid dialog cut longer team names (“Pipeline Pant…”); team-board headers PURSE/SQUAD touched on phones | Names wrap to two lines; tighter header letter-spacing and wider gaps on small screens |
| Format check | Code was not Prettier-formatted | `prettier --write` applied (formatting only), `.prettierignore` keeps docs untouched; all checks re-run afterwards |
| Security review before packaging | A server started without `.env` would have created the first organizer with a fallback password written in the source | No built-in default any more: without a usable `ADMIN_PASSWORD` a random password is generated and printed once. Verified on a fresh database and with `npm run setup` on a clean copy (new `.env` with a random password; second run reports the existing account); all suites re-run afterwards |

## Not tested (honest gaps)
- Running **natively** on Windows with Node.js (the Docker setup was run on the client's Windows laptop — Linux containers; the native path was not). The Windows code path is the same Node.js code; embedded PostgreSQL ships Windows binaries and the data directory defaults to `%LOCALAPPDATA%` to avoid spaces in paths — but this was not executed on Windows here.
- Real projector/LED hardware and venue Wi-Fi; Safari/Firefox (Chromium only).
- Load beyond a few concurrent screens; multi-hour soak; several auctions live at the same time.
- Excel import with the client's own spreadsheets (only the template and synthetic CSV files were tested).

## 1 Nov 2026 — winner by combined actual offers + Final Reveal
All commands re-run on the final code: `tsc` 0 errors · `eslint .` 0 problems · `prettier --check .` clean · `rm -rf .next && next build` clean · **unit 37 / 37 · integration 24 / 24 · end-to-end 6 / 6**.

### Unit — `tests/unit/reveal.test.ts` (12)
The client's example (3 profiles $431,000 beat 4 profiles $400,000); credits never deducted and profile count ignored; salary tie → more credits wins; full tie → joint winners with competition ranks 1, 1, 3; a disqualified team with the highest total is unranked and cannot win; no winner while every total is $0; reveal visibility before / during (earlier profiles fully, current up to its step, later and unsold profiles not at all) / after; salary parsing (`120000`, `$120,000`, `95,500.00`, `USD 95000`) and rejection of cents, negatives, zero, text.

### Integration — `tests/integration/reveal.test.ts` (3, real PostgreSQL + HTTP + Socket.IO)
1. **Whole event** (5 teams, 12 profiles, minimum squad 1): private data entered after locking; changed salary loses its verification; cents rejected; PDF and PNG letters uploaded, HTML refused (`UNSUPPORTED_LETTER`), organizer download `application/pdf` + `no-store`, anonymous 401.
   - Bid alone → hidden total **$0**; SOLD → **$150,000**; credits $24M; second sale after a rival bid → $291,000; a sold profile without salary counts 0 until entered; MUM 4 profiles → $400,000; a bid-on then **unsold** profile ($987,654) never counts; BLR $250,000.
   - Corrections: return to pool → BLR $0 and credits back to $25M; assign to GUJ for $2M → $250,000 and $23M.
   - End auction (BLR disqualified, 0 < 1); cancelling a purchase after the end → profile **UNSOLD**, MUM $300,000; re-assigned → $400,000.
   - **Start Final Reveal blocked** (`REVEAL_NOT_READY`, names profile #3) until its salary is entered → CHS **$431,000 rank 1 winner**, MUM $400,000 rank 2.
   - **Leak scan:** the join snapshot and **every** public socket message received before the reveal (> 10), and the public REST snapshot, contain no original name, no `annualSalary` number, no `originalName` value, no letter URL, no `private` key, no unsold salary; the public letter endpoint answers 404.
   - Reveal steps checked on the public API: step 0 name only; step 1 original name (next profile's name absent); step 2 letter URL → 200 `application/pdf`, file name not exposed, next profile's letter still 404; step 3 salary, team hidden, team total still $0; step 4 team + credits paid, visible total $150,000, unranked. Back/forward across profiles. Edits during the reveal → `REVEAL_STARTED` (salary, letter, correction); unchanged values accepted. After every completed profile the visible totals equal the revealed salaries. Final: **CHS 3 / $431,000 / rank 1 / winner · MUM 4 / $400,000 / 2 · GUJ 1 / $250,000 / 3 · BLR, DEL unranked**; unsold profile never revealed (letter 404).
   - **Server + database restart** → the public leaderboard is identical. Results API and Excel export (*Winner (Salary Totals)* row 1 = Chennai Strikers, 3, 431000, WINNER; Squads sheet with original names). Audit log has `privateFieldsChanged` and no salary values. Restart reveal → everything hidden again, letters 404, edits allowed. Rehearsal reset → LOCKED, reveal NOT_STARTED, private data kept, totals $0.
2. **Import and clone:** CSV with *Original Name*, *Annual Salary (USD)* (`"$120,000"`), *Salary Verified* (`Yes`) imported; `12.5k` rejected with a row message; clone copies names, salaries, verification and the letter file (downloadable); readiness counts; template headers present.
3. **Session end:** an organizer socket whose session is logged out is refused on `sync` (`UNAUTHORIZED`) and leaves the private room.

A deliberate mutation check was also run: making `publicSnapshot()` return the full organizer snapshot makes test 1 fail at the first leak scan (then reverted).

### End-to-end — `tests/e2e/final-reveal.spec.ts` (1, production build, Chromium, 1920×1080 display)
Seven profiles with salaries and letters (one watermarked sample PNG, six PDFs). Hidden-totals panel masked until **Show**; the lot strip shows the original name and $150,000/yr to the organizer; a bid leaves CCR at **$0**, SOLD → **$150,000**; after six more sales CCR **$431,000**, HHK **$400,000**; the audience page text contains no original name or salary. End auction → **"Final reveal coming up"**; Start Final Reveal → *Profile 1 of 7*; keyboard → steps: original name, the letter image actually loads (natural width > 100 px), salary **$150,000**, team + running total **$150,000**; the second profile's PDF letter is embedded and served as `application/pdf`; remaining steps → leaderboard: **Code Crusaders winner, rank 1, 3 profiles, $431,000**; Hire Hawks rank 2, 4 profiles, $400,000; Offer Owls *Not ranked* (below the minimum squad). Projector reload shows the same leaderboard. The organizer-flow E2E was updated for the renamed *Tweaked name* field and still passes.

### Screenshots (fictional data, watermarked sample letters)
`docs/screenshots/`: `admin-candidates-hidden-data.png`, `admin-candidate-private-fields.png`, `console-hidden-salary-totals.png`, `display-bidding-no-salaries.png`, `console-final-reveal-ready.png`, `display-final-reveal-coming-up.png`, `display-reveal-step0-display-name.png`, `display-reveal-step2-offer-letter.png`, `display-reveal-step4-team-total.png`, `console-final-reveal-running.png`, `display-final-leaderboard.png`, `admin-results-salary-winner.png`.

### Not tested (1 Nov additions)
- PDF letters **rendering** inside the projector browser: headless Chromium has no PDF viewer, so the tests check the embedded frame and the served file (`application/pdf`), not the drawn pages. Image letters were verified visually.
- The client's real offer letters and salaries (not available; nothing was invented).

## 1 Nov 2026 (later) — countdown position on the live screen
Client screenshot: the countdown ring covered the "Current bid" label. Re-run on the final code: `tsc` 0 errors · `eslint .` clean · `prettier --check .` clean · clean `next build` · **unit 39 / 39 · integration 25 / 25 · end-to-end 7 / 7**.
- **Measured default placement** (public display, candidate on the block): the timer no longer touches the bid box or the candidate name at 1920×1080, 1536×864, 1366×768, 1280×720, 1112×625, 3840×2160 and 390×844 (phone).
- **Unit (2):** the position schema accepts any spot 0–100 % (rounded to 0.01) or the default spot, sizes 0.5–3; rejects off-screen values, a single coordinate, tiny/huge sizes, strings.
- **Integration — `tests/integration/display.test.ts` (1):** organizer moves the timer while LIVE with a candidate on the block → public socket receives the new position, public API shows it, the candidate stays on the block; 400 for half/off-screen positions, 401 anonymous, 403 without the CSRF header; reset after the auction ended; copied by *duplicate*; audit entry `auction.timer_layout`.
- **End-to-end — `tests/e2e/timer-position.spec.ts` (1):** no overlap with the bid box or the name at 1920×1080, 1366×768 and 1112×625; a spectator's drag changes nothing; the organizer drags the timer on the live screen to (300, 820) → saved as 15.6 % / 75.9 % and the spectator screen shows it there within 6 px; console size XL roughly doubles it; dragging on the console map moves it to the top-left; *Next to the bid* resets it (no overlap again); double-click on the organizer's live screen resets it; a refreshed projector keeps a saved position.
- **Flake found and fixed in the test:** measuring before the web fonts had loaded gave a 35 px offset in one full run; the test now waits for `document.fonts.ready` and a settled position (4 consecutive full runs green afterwards).
- Screenshots: `docs/screenshots/display-timer-default.png`, `display-timer-moved.png`, `console-timer-position.png`.
