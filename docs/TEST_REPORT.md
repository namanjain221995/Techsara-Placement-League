# Test Report

Environment: Ubuntu 24.04.5 (cloud build container), 2 vCPU, 7.8 GB RAM, Node.js 22.23.4, embedded PostgreSQL 18.6, Chromium (Playwright 1.63.0). Date: 31 Oct 2026. Every result below was produced by actually running the command on the final code; nothing is extrapolated.

## Summary
| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit -p tsconfig.json` | ✅ 0 errors |
| Lint | `npx eslint .` | ✅ 0 errors, 0 warnings (one justified inline disable: hard redirect on expired session in `src/lib/api.ts`) |
| Formatting | `npx prettier --check .` | ✅ all code files formatted (docs excluded by `.prettierignore`) |
| Production build | `rm -rf .next && npx next build` (Next.js 16.4.3, Turbopack) | ✅ clean build, 11 routes |
| Unit tests | `npx vitest run` (project `unit`) | ✅ 25 / 25 |
| Integration tests (real PostgreSQL, HTTP + WebSocket) | `npx vitest run` (project `integration`) | ✅ 21 / 21 |
| End-to-end (production build, Chromium) | `npx playwright test` | ✅ 5 / 5 on the final code (36.5 s); the same suite also passed on 5 earlier runs during development |
| Real-time latency (command → public display, localhost) | logged by `realtime.test.ts` | **12.5 ms, 9.9 ms, 16.7 ms** on the final run (earlier runs: 12.8 / 8.6 / 15.9, 23.9 / 9.1 / 9.9, 14.5 / 10.5 / 10.7 and 12.6 / 9.5 / 10.6 ms); assertion < 500 ms |
| Docker image steps (outside Docker) | clean `npm ci` → `next build` → `npm ci --omit=dev` → `node --import tsx server/index.ts` in the image's runtime layout, against a fresh external PostgreSQL | ✅ migrations on an empty database, generated organizer password printed, health check 200, demo seed (`--force`), full UI run + auction to the end, 0 page errors, clean SIGTERM shutdown. The image could not be built on the build machine (container registries blocked); `docker compose config` validates the compose file. |
| Docker Compose on the client laptop (Windows 11, Docker Desktop) | `start-with-docker.cmd` → `docker compose up -d --build`; `add-demo-auction.cmd` | ✅ image built (≈ 2 min), `db` and `app` containers running, port 3000 published, the app answered its health check and served the organizer sign-in page at `http://localhost:3000`, demo auction created. |
| GitHub Actions CI (`.github/workflows/deploy.yml`, ubuntu-24.04 runner) | runs #1 and #2 on `main` | ✅ typecheck, lint, format check, unit + integration tests, production build and end-to-end tests passed on GitHub's runners; the deploy job was skipped until the repository secrets were added |
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
