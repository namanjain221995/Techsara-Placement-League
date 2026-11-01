# API Specification (REST, JSON)

Base path `/api`. Money fields (auction credits) are **integers in thousands** (1000 = $1M). `annualSalary` is different: **whole US dollars** per year, excluding bonuses. Organizer endpoints need the session cookie `tpl_session` and, for non-GET requests, the header `x-tpl-request: 1` (CSRF guard). Errors always have the shape:
```json
{ "error": { "code": "EXCEEDS_MAX_BID", "message": "Delhi Dynamos can bid at most $23M (remaining purse $25M minus $2M kept for the minimum squad of 3).", "details": null } }
```
Common status codes: 400 `VALIDATION_FAILED` (details = `[{path, message}]`), 401 `UNAUTHORIZED`, 403 `FORBIDDEN` (CSRF), 404 `NOT_FOUND`, 409 rule/state violations, 413 too large, 500 `INTERNAL` (nothing applied).

## Public
| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ok, time}` (checks the DB) |
| GET | `/public/auctions/:slug` | **public** `LiveSnapshot` — never contains `private`; `reveal` carries only what the final reveal has reached |
| GET | `/public/auctions/:slug/squads` | `{squads: {teamId: [{name, price}]}}` (tweaked names and credits only) |
| GET | `/public/auctions/:slug/reveal/:playerId/offer-letter` | the offer letter, **only** once the reveal has reached that profile's "offer letter" step (otherwise 404). `Content-Disposition: inline; filename="offer-letter.<ext>"`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` |
| GET | `/uploads/:file` | image (UUID file names only, `nosniff`, immutable cache) |

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{admin}` + cookie. 401 `BAD_CREDENTIALS`. Rate-limited (20 / 15 min / IP) |
| POST | `/auth/logout` | — | `{ok}` |
| GET | `/auth/me` | — | `{admin}` or 401 |

## Auctions
| Method | Path | Body / notes |
|---|---|---|
| GET | `/auctions` | list with `teamCount`, `playerCount`, `soldCount` |
| POST | `/auctions` | `{name}` → 201 `{auction}` (defaults: $25M, $1M, step $1M, squad 3–9) |
| GET | `/auctions/:id` | `{auction, counts, readiness:{profiles, withSalary, verified, withLetter, withOriginalName, warnings[]}, issues:{blocking, warnings}}` |
| PUT | `/auctions/:id/settings` | `{name, currencySymbol, purse, basePrice, bidIncrement, minSquad, maxSquad, timerEnabled, timerSeconds (5–600), poolOrder: RANDOM\|SEQUENTIAL, roles[]}`. After lock, money/squad fields → 409 `CONFIG_LOCKED` |
| PUT | `/auctions/:id/timer-layout` | `{x, y, scale}` — position of the countdown on the live screen: centre in % of the screen (0–100, both or neither; `null, null` = default spot next to the current bid), `scale` 0.5–3. Allowed in every state; broadcast to all screens at once |
| POST | `/auctions/:id/clone` | `{name}` → 201 (settings incl. timer position, teams, candidates incl. original names/salaries/letters, images; no results) |
| DELETE | `/auctions/:id` | 409 `AUCTION_LIVE` while live/paused |
| POST | `/auctions/:id/lock` | 409 `SETUP_INCOMPLETE` (details = issues); `{ok, warnings}` |
| POST | `/auctions/:id/unlock` | LOCKED → DRAFT |
| POST | `/auctions/:id/reset` | wipe bids/results and the reveal → LOCKED (private profile data kept) |
| GET | `/auctions/:id/snapshot` | organizer `LiveSnapshot` **with** `private` (hidden totals, profiles, reveal readiness) |
| POST | `/auctions/:id/commands` | **Live command** (below) → `{snapshot, duplicate}` |

## Live commands — `POST /auctions/:id/commands`
Every body carries `type` and a client-generated `commandId` (UUID). Re-sending the same `commandId` returns the current snapshot with `duplicate: true` and changes nothing.

| type | Extra fields | Allowed when | Errors (409 codes) |
|---|---|---|---|
| `GO_LIVE` | — | LOCKED | `INVALID_STATE` |
| `PAUSE` / `RESUME` | — | LIVE / PAUSED | `INVALID_STATE` |
| `NEXT_PLAYER` | — | LIVE, no open lot | `LOT_OPEN`, `POOL_EMPTY` |
| `PICK_PLAYER` | `playerId` | LIVE, no open lot, candidate POOL/UNSOLD | `PLAYER_NOT_AVAILABLE` |
| `BID` | `teamId`, `amount?` (omitted = base for opening, else current + step) | LIVE with open lot | `AUCTION_PAUSED`, `NO_PLAYER_ON_BLOCK`, `TEAM_NOT_FOUND`, `SQUAD_FULL`, `ALREADY_LEADING`, `BELOW_BASE_PRICE`, `NOT_ABOVE_CURRENT_BID`, `EXCEEDS_MAX_BID`, `INVALID_AMOUNT` |
| `UNDO_BID` | — | LIVE/PAUSED, open lot with bids | `NO_BIDS` |
| `SOLD` | — | LIVE/PAUSED, open lot with a bid | `NO_BIDS`, `SQUAD_FULL`, `EXCEEDS_MAX_BID` (re-check) |
| `UNSOLD` / `SKIP` / `DISQUALIFY_PLAYER` | — | LIVE/PAUSED, open lot | `NO_PLAYER_ON_BLOCK` |
| `NEXT_ROUND` | — | pool empty, unsold > 0 | `POOL_NOT_EMPTY`, `NOTHING_TO_REAUCTION` |
| `RESTART_TIMER` | — | LIVE, countdown on | `TIMER_DISABLED` |
| `END_AUCTION` | — | LIVE/PAUSED, no open lot | `LOT_OPEN` |
| `ANNOUNCE` | `text` (≤160, empty clears) | LOCKED/LIVE/PAUSED | — |
| `START_REVEAL` | — | COMPLETED, reveal NOT_STARTED, every purchased profile has a salary | `REVEAL_ALREADY_STARTED`, `REVEAL_NOT_READY` (details = `{blocking, warnings}`) |
| `REVEAL_NEXT` | — | COMPLETED, reveal IN_PROGRESS (after the last step → COMPLETE) | `REVEAL_NOT_STARTED`, `REVEAL_COMPLETE` |
| `REVEAL_BACK` | — | COMPLETED, reveal IN_PROGRESS/COMPLETE | `REVEAL_NOT_STARTED`, `REVEAL_AT_START` |
| `RESTART_REVEAL` | — | COMPLETED, reveal started | `REVEAL_NOT_STARTED` |

## Teams
| Method | Path | Body |
|---|---|---|
| GET | `/auctions/:id/teams` | → `{teams: TeamView[]}` (purse, spent, remaining, squadCount, maxBid) |
| POST | `/auctions/:id/teams` | `{name, shortName (≤6, upper-cased), color "#RRGGBB", members[], purse?}` — DRAFT only |
| POST | `/auctions/:id/teams/reorder` | `{ids[]}` (every team exactly once) |
| PUT | `/teams/:teamId` | same as create; purse change needs DRAFT |
| DELETE | `/teams/:teamId` | DRAFT only |
| POST / DELETE | `/teams/:teamId/logo` | multipart `file` (PNG/JPG/WEBP/GIF ≤ 3 MB, magic-byte checked) |

## Candidates
| Method | Path | Body |
|---|---|---|
| GET | `/auctions/:id/players` | `{players: PrivatePlayerView[]}` (adds `originalName`, `annualSalary`, `salaryVerified`, `letter:{url, kind, fileName}`) |
| POST | `/auctions/:id/players` | `{name (tweaked name), role, description (≤4000, kept verbatim), basePrice?, photoUrl? (http/https), number?, originalName?, annualSalary? (whole USD 1–100,000,000), salaryVerified?}` — DRAFT only |
| POST | `/auctions/:id/players/import` | multipart `file` (.xlsx/.csv); all-or-nothing; 400 `IMPORT_INVALID` with `[{row, message}]` |
| GET | `/players-template.xlsx` | template |
| PUT | `/players/:playerId` | as create; number/base price need DRAFT. Private fields: omitted = unchanged, `null` = clear; changing them after the reveal started → 409 `REVEAL_STARTED`; a changed salary is un-verified unless `salaryVerified` is sent |
| DELETE | `/players/:playerId` | DRAFT only |
| POST / DELETE | `/players/:playerId/photo` | multipart `file` |
| GET | `/players/:playerId/offer-letter` | the letter (organizer only) |
| POST / DELETE | `/players/:playerId/offer-letter` | multipart `file`: PDF/PNG/JPG/WEBP ≤ 10 MB, magic-byte checked (400 `UNSUPPORTED_LETTER`, `FILE_TOO_LARGE`); 409 `REVEAL_STARTED` during the reveal |
| POST | `/players/:playerId/override` | `{action:"ASSIGN", teamId, amount}` · `{action:"RETURN_TO_POOL"}` · `{action:"DISQUALIFY"}` · `{action:"REINSTATE"}` — LOCKED/LIVE/PAUSED, and COMPLETED until the reveal starts (then a cancelled purchase becomes UNSOLD and disqualification flags are recomputed); not the candidate on the block; 409 `REVEAL_STARTED` during the reveal |

## Results & reports
| Method | Path | Response |
|---|---|---|
| GET | `/auctions/:id/results` | `reveal`, salary `standings` (ranked), `revealCheck`, teams with squads (private views), unsold, pool, disqualified, totals |
| GET | `/auctions/:id/bids` | lots with all bids (incl. undone) |
| GET | `/auctions/:id/audit` | latest 400 audit entries |
| GET | `/auctions/:id/export.xlsx` | Summary (incl. winner) · Winner (Salary Totals) · Squads (incl. original names, salaries, letters) · Unsold & Pool · Bid History |

`LiveSnapshot` and all view types are defined in `src/shared/types.ts`.
