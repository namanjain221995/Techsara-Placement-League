# Organizer (Admin) Guide

All amounts are typed and shown in **millions**: type `25` for $25M, `1.5` for $1.5M.

## Before the event
1. **Create or duplicate** an auction on *My auctions* (`+ New auction`, or the copy icon to duplicate an earlier event with its teams and candidates).
2. **Settings** — purse ($25M), base price ($1M), bid step ($1M), minimum (3) and maximum (9) candidates per team, currency symbol, candidate roles, optional countdown, next-candidate order (random or by number). The green box shows the resulting max bid for an empty team ($23M).
3. **Teams** — add each team: name, short name (≤ 6 letters, used in badges), colour, logo (optional), and the **members** who play for it (press Enter after each name). Use ↑↓ to set the order.
4. **Candidates** — add each candidate: photo (upload or link), name, role, **description**. Write the description point-wise; numbering, bullets and line breaks appear on the live screen exactly as typed (see the preview). For many candidates use **Import** with the Excel **Template**.
5. **Overview** — fix any red issue, read the warnings, then **Lock configuration**. Money and squad rules are now frozen (names, colours, photos and descriptions can still be corrected, even live). *Unlock* is possible until you go live.
6. Open the **Live screen** link on the projector (Overview → copy link, or *Open display*).

## Running the auction (Live console)
| Step | Button | Keyboard |
|---|---|---|
| Start | **Go live** | — |
| Bring up a candidate | **Next candidate** (random/numeric per settings) or **Pick candidate** | N |
| Someone calls a bid | **Tap that team** — opening bid = base price, then + step. Adjust the *Next bid* with − / + first if the caller jumps | 1–9 (team order), + / − |
| Someone calls a specific amount ("10 million!") | **Custom amount** → type `10` → click the team. Every team shows its **max bid**; teams that cannot afford the amount are disabled | C |
| Mistake | **Undo bid** (removes the latest bid) | Z |
| Hammer falls | **Sold** — the screen celebrates and purse/max bid/squad update everywhere | S |
| Nobody bids | **Unsold** (asks for confirmation if bids exist) | — |
| Postpone / remove | **Skip** (back to pool) · **Disqualify** | — |
| Break | **Pause** / **Resume** (bidding blocked, countdown frozen, "Paused" on screen) | P / R |
| Message to the room | Announcement box → shows in the screen's ticker | — |
| Pool empty but unsold candidates remain | **Start round N** | — |
| Finish | **End auction** — shows which teams fall below the minimum and will be **disqualified** | — |

Buttons explain why a team cannot bid: *Leading* (already highest), *Too high* (amount above its max bid), *Full* (squad at maximum). The server enforces the same rules, so nothing illegal can slip through even with two organizers clicking at once.

## Corrections
Candidates page → ⋯ on a candidate (after locking): **Assign to team** at a price (checked against the team's max bid), **Return to pool** (refunds the purse automatically), **Disqualify**, **Reinstate**. Every correction is in the audit log.

## After the event
**Results & reports**: final squads with Qualified/Disqualified, bid history per candidate (undone bids struck through), audit log, **Export Excel** (Summary, Squads, Unsold & Pool, Bid History).
**Reset** (Overview) wipes all bids/results and returns to the ready state — use it after a rehearsal.

## Accounts
`npm run create-admin -- <username> <password>` adds an organizer or resets a password (and signs that organizer out everywhere).
