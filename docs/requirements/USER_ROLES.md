# User Roles & Permissions

| Role | Who | Access | Can | Cannot |
|---|---|---|---|---|
| **Organizer** (admin) | Event host / auctioneer (the person in the client video) | Username + password → HTTP-only session cookie (12 h default) | Create, duplicate, configure, lock/unlock, reset and delete auctions; manage teams and candidates; run the live console (go live, next/pick candidate, enter bids, custom amounts, sold/unsold/undo/skip/disqualify, pause/resume, rounds, announcements, end); manual corrections; results, bid history, audit log, Excel export | Bypass rules: every command is re-validated by the server (max bid, squad limits, state machine) |
| **Spectator / audience** | Everyone in the room watching the projector, LED wall or a phone | Public read-only live-screen link `/display/<code>` — no login | See the live auction state: candidate, description, current bid, leading team, team purse/max bid/squad, counters, ticker, SOLD, final squads | Change anything; see organizer pages, audit log or exports |
| **Team members** | The colleagues forming each team (e.g. two team members per team) | None in v1 — they bid by calling out in the room (client 04:13–04:47) | Have their names shown on the screen (R-TEAM-03) | Bid from their own device — see open question Q-02 |
| **System** | The server | — | Countdown "time up" flag, crash recovery, audit entries labelled `system` | — |

## Organizer accounts
- The first account is created on first start from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (`npm run setup` generates a random password and prints it once).
- More organizers or password resets: `npm run create-admin -- <username> <password>` (resetting signs out existing sessions).
- Several organizers may run the same live console at once (e.g. auctioneer + assistant). Their actions are serialised by the server; each is recorded with the username in the audit log.

## Permission enforcement
| Area | Enforcement |
|---|---|
| `/api/*` organizer endpoints | `requireAdmin` (session cookie) + `csrfGuard` (custom header + Origin check) — `server/auth/auth.ts` |
| Organizer WebSocket room (`join` by auction id) | Session cookie verified in the Socket.IO handshake — `server/realtime/socket.ts` |
| Public data | Only `GET /api/public/auctions/:slug`, `GET /api/public/auctions/:slug/squads`, socket `join` by slug, and image files |
| Setup changes after lock | Server rejects money/squad changes (`CONFIG_LOCKED`); cosmetic edits stay allowed |
| Live commands | State machine + rules in `server/engine/engine.ts` / `src/shared/rules.ts` |
