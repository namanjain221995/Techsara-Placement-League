# Organizer (Admin) Guide

Auction credits are typed and shown in **millions**: type `25` for $25M, `1.5` for $1.5M. **Salaries** are different: whole US dollars per year, e.g. `120000` (or `$120,000`).

**Who wins:** the team whose purchased profiles have the highest **combined actual annual salary** (from the original offer letters, USD, excluding bonuses). Credits are only for bidding; the number of profiles does not matter. Tie → more credits left wins; still tied → joint winners. A team below the minimum squad is disqualified and not ranked.

## Before the event
1. **Create or duplicate** an auction on *My auctions* (`+ New auction`, or the copy icon to duplicate an earlier event with its teams and candidates).
2. **Settings** — purse ($25M), base price ($1M), bid step ($1M), minimum (3) and maximum (9) candidates per team, currency symbol, candidate roles, optional countdown, next-candidate order (random or by number). The green box shows the resulting max bid for an empty team ($23M).
3. **Teams** — add each team: name, short name (≤ 6 letters, used in badges), colour, logo (optional), and the **members** who play for it (press Enter after each name). Use ↑↓ to set the order.
4. **Candidates** — add each candidate: photo (upload or link), **tweaked name** (the name everyone sees while bidding), role, **description** (the clues). Write the description point-wise; numbering, bullets and line breaks appear on the live screen exactly as typed (see the preview). For many candidates use **Import** with the Excel **Template** (it also has *Original Name*, *Annual Salary (USD)* and *Salary Verified* columns).
   In the gold **"Hidden until the final reveal"** box of each candidate enter:
   - **Original candidate name** — as on the offer letter;
   - **Annual salary (USD)** — the annual base salary on the actual offer letter, whole dollars, **excluding bonuses**; use the same rule for every profile;
   - **Upload letter** — the actual offer letter as PDF, PNG, JPG or WEBP (max 10 MB). Redact anything you do not want on the big screen (address, signature, IDs) before uploading — the audience sees the letter during the reveal;
   - tick **"I checked this amount against the offer letter"** once verified (changing the amount clears the tick).
   The bar at the top of the Candidates page counts salaries, verifications, letters and original names (e.g. *Annual salaries 20/20*). **Hide hidden details** masks them on screen. All of this can still be edited after locking — right up to the start of the final reveal.
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

## Hidden salary totals (organizer only)
The live console's **Hidden salary totals** panel shows each team's combined salary from **confirmed purchases** (SOLD) — a bid in progress never counts. It is masked by default; press **Show** (and **Hide** again before anyone looks at your laptop). The strip under the candidate's name on the block shows the real name, salary and letter the same way. The audience screen never receives this data before the reveal.

## Corrections
Candidates page → ⋯ on a candidate (after locking): **Assign to team** at a price (checked against the team's max bid), **Return to pool** / **Cancel purchase** (refunds the credits automatically), **Disqualify**, **Reinstate**. Credits **and** hidden salary totals are recalculated immediately. Corrections remain possible after *End auction* (a cancelled purchase then becomes unsold) until the final reveal starts. Every correction is in the audit log (salary changes are logged without the amounts).

## Final Reveal
1. **End auction** — the screen shows **"Final reveal coming up"** and the final squads (tweaked names and credits only).
2. In the live console the **Final reveal** panel lists anything still missing. It will not start while a purchased profile has no salary; missing letters, original names or unverified salaries are warnings.
3. **Start Final Reveal** — profiles appear in purchase order. Press **Next** (or **→**) for each step: *tweaked name → original candidate name → actual offer letter → annual salary → purchasing team*. At the team step the salary is added to that team's visible total on the screen. **Back** (or **←**) undoes a step; **Restart** hides everything again (and re-enables corrections).
4. After the last profile, **Next** shows the final leaderboard: *Team · Profiles purchased · Combined annual offer amount · Rank*, winner highlighted. Refreshing the projector keeps the leaderboard.
While the reveal runs, purchases, salaries, original names and letters are frozen. The console shows you every detail of the current profile and marks which ones the audience can already see.

## After the event
**Results & reports**: the **salary leaderboard and winner** (organizer view; "Hide salaries" masks it), final squads with original names and salaries, bid history per candidate (undone bids struck through), audit log, **Export Excel** (Summary with the winner, *Winner (Salary Totals)*, Squads with original names/salaries/letters, Unsold & Pool, Bid History).
**Reset** (Overview) wipes all bids/results and the reveal and returns to the ready state — salaries, original names and letters are kept. Use it after a rehearsal.

## Accounts
`npm run create-admin -- <username> <password>` adds an organizer or resets a password (and signs that organizer out everywhere).
