# Reference Website Analysis — cricsmart.in and auction.cricsmart.in

Research date: 31 Oct 2026 (IST). Researcher: Claude (autonomous build agent).

## 1. How the research was done (and what was NOT done)

| Source | Method | Result |
|---|---|---|
| `https://cricsmart.in/` (home) | WebFetch (server-rendered HTML → text) | Read successfully |
| `https://cricsmart.in/cricket-player-auction` | WebFetch | Read successfully |
| `https://cricsmart.in/corporate-cricket-tournament` | WebFetch | Read successfully |
| `https://cricsmart.in/glossary`, `/faq` | WebFetch | Read; contain no auction mechanics (general cricket content) |
| `https://auction.cricsmart.in/` (landing) | WebFetch | Read successfully |
| `https://auction.cricsmart.in/explore` | WebFetch | Read successfully — lists public auctions incl. three **Techsara Placement League** auctions |
| `https://auction.cricsmart.in/techsara-placement-league-final-496484` (+ `/players`, `/teams`) | WebFetch | Read successfully (public spectator pages) |
| `.../broadcast`, `.../live` (public) | WebFetch | **JavaScript-rendered over WebSocket** — only the shell ("Connecting…") was retrievable; the live layout was therefore studied from the client video instead |
| `https://auction.cricsmart.in/admin` (organizer area) | **Not accessed** | Requires login. No attempt was made to sign in or bypass access control. The organizer screens documented below were observed **only in the client's own screen recording** (`game building auction.mp4`, logged in as the client's account) |
| Shell/headless browser from the build container | Blocked by network allow-list (HTTP 403 at the egress proxy) | Not used |

Nothing on these sites was copied: no source code, branding, logos, illustrations or text blocks are reused in Techsara Placement League. Feature descriptions below are paraphrased.

## 2. What CricSmart is

CricSmart presents itself as a multi-sport (cricket, kabaddi, badminton, pickleball, football/futsal) auction and league-management platform from Noida, India. The auction product runs IPL-style player auctions: an organizer configures teams with a purse, imports a player pool, and runs a live room where team owners (or the organizer on their behalf) bid in real time while spectators watch a public screen or an OBS overlay. It is free for very small leagues (the pages disagree on whether the limit is "fewer than 4" or "fewer than 5" teams) and charges a one-time per-event fee above that (₹1,999 is quoted on the cricket auction page).

## 3. Publicly documented features (marketing pages)

### 3.1 Auction engine
- Real-time bidding over WebSockets, claimed sub-50 ms latency.
- Tiered/dynamic bid increments (examples quoted in lakh/crore; the two pages disagree about the 1–5 crore tier).
- Configurable bidding windows with "going once / going twice" phases.
- Player retention with an RTM (Right-to-Match) card; retained players are charged to the purse before the auction.
- Multi-round auctions (unsold players can come back in later rounds).
- Purse tracking with an automatically calculated **maximum affordable bid** that reserves money for the mandatory squad slots still to be filled (formula not published on the site — see §5.3 for the value observed in the video).

### 3.2 Administration
- Undo stack (last 3 sold/unsold actions, restoring purse and squad).
- Pause mid-bid; disqualify a player (with purse refund if already sold).
- Excel import of teams and players; custom registration form; WhatsApp "sold" alerts.
- Multi-sheet XLSX export (summary, rosters, sold, unsold); spending and role analytics.

### 3.3 Presentation
- Public spectator URL ("Watch Live") for unlimited viewers.
- 1920×1080 OBS-ready broadcast overlay with animated player card, bid ticker and team purse panel; several overlay themes.
- YouTube streaming support.

### 3.4 Team owner access
- Each team receives a unique **magic link** (browser, mobile or desktop) and an **access code** (for CricSmart's Android app).

### 3.5 After the auction
- 48-hour bilateral trade window; trades proposed by teams and approved by the admin, with automatic purse rebalancing.

### 3.6 Corporate positioning
The corporate-tournament page pitches the same auction as an employee-engagement event: department heads receive virtual budgets and bid on employees, non-playing staff watch in spectator mode, and HR gets participation/budget reports. No corporate-specific bidding rules are published.

## 4. The client's existing CricSmart auctions (public data)

The public Explore page lists three LIVE auctions named **Techsara Placement League (Final)**, **Techsara Placement League run** and **Techsara Placement League (Copy)**, all started 30 Oct 2026, each with:

| Setting | Value |
|---|---|
| Teams | 5 (named after IPL franchises: Mumbai Indians, Gujarat Titans, Royal Challengers Bangalore, Delhi Capitals, Chennai Super Kings) |
| Players | 20 |
| Currency | USD ($) |
| Purse per team | $25M |
| Base price | $1M |
| Squad size | 3–9 |
| Round | Round 1 |

Public player-pool page of the "(Final)" auction shows that the "players" are **job candidates**, not cricketers. Each card carries: role (re-used cricket roles "All-Rounder" / "Batsman"), and a description with *Experience*, *Niche* (e.g., AI/ML, Full-Stack, Supply-Chain Analytics, QA Automation, Clinical Research, Financial Analysis, Product Management), *Company background*, *Current interview / round* (e.g., "Coding cleared at company X; system design pending"), *Move-forward ratio* (a percentage, 35–70 %), and *Personal preference* (scheduling/work-style notes). Names appear lightly masked. Two sales were visible on the public page at research time (e.g., $9M and $7M purchases), confirming the bidding is in "$M".

**Implication:** the client is using CricSmart as a stand-in for an internal game in which TechSara teams "buy" candidates. The video (see `docs/video-analysis/`) is the authoritative source for what must be rebuilt; these public pages only corroborate the configuration values.

## 5. Organizer workflow as observed in the client video (CricSmart admin)

Timestamps refer to the client video. Details are in `docs/video-analysis/FRAME_BY_FRAME_ANALYSIS.md`.

1. **My Auctions** dashboard with status tabs (All, Registered, Live, Ready, Draft, Done, Deleted), auction cards (teams, players, purse, date) and **Clone** (copies config, teams and players into a new draft) — 0:00–0:12.
2. **Auction setup hub**: sidebar *Admin Overview, Teams, Player Grades, Players (All / Retained / Player Card), Registration, WhatsApp, Team Access, Live Console*; header chips (slug, date, currency, schedule, player and team counts, plan) — 0:15.
3. **Teams**: cards with logo, name, owner names, remaining purse, spent, squad; *Manage Team* opens a sheet with Spent / Purse remaining / Budget used, actions *Edit Team, Adjust Purse, Regenerate (credentials), Delete*, and **Team Owner Access** (magic link + access code) — 0:18–0:36.
4. **Edit Team**: logo upload, team name, short name, theme colour, optional owner name/email/phone — 0:39–0:48.
5. **Players**: registration-link banner, data export, registration, template, import, add; status filters (All, In Pool, Sold, Unsold, Retained, Pending, Ineligible, DQ, Rejected); table with photo, name, role badge, description — 0:51–0:57.
6. **Player card / Edit player**: name, phone, role (Batsman, Bowler, All-Rounder, Wicket Keeper), photo upload or URL, email, location, age, date of birth, description; admin actions *Assign to Team, Return to Pool, Mark Ineligible, Disqualify, Delete* — 1:00–1:45.
7. **Player Display Fields**: per-field label, broadcast label, type, visibility (list/card), sort; **Broadcast Preview** — 1:54–3:09.
8. **Review & launch**: spectator link, *Final launch checkpoint*, configuration summary **Base price $1M · Team purse $25M · Squad size 3–9 · Timer 30s**, quick actions incl. *Set Pool Order* — 3:15–3:18.
9. **Setup checklist**: Basic setup → Player grades (optional) → Add teams (≥3 to launch) → Import players → Mark retained (optional) → **Lock configuration** → Invite team owners — 3:21–3:30.
10. **Live Console**: Go Live; status chips (LIVE, Round, pool, sold, unsold); *Pause, Next Player / Skip, Disqualify*; *Admin Bidding* mode with **TAP TEAM TO BID** grid, staged bid with −/+ (step $1M), *Enter Custom Amount* (quick chips Base / Next / +50% / 2× / 3× / 5×), **SOLD**, **UNSOLD**, **UNDO BID**, **END AUCTION**, announcement box, *Pick Player* — 3:36–5:12, 7:54–8:57.
11. **Broadcast (public screen)**: ON AIR badge, event title, round/pool/sold counters, player photo card with number, role, name, description, **Current bid** and multiple of base, team table **Max bid · Purse · Squad** with the leading team floated to the top, scrolling ticker (new player, current bid, top sold, top bidder, auction overview), SOLD overlay "Acquired by …" — 3:45–8:45.

### 5.3 Max-bid rule (observed numerically)
With purse $25M, base $1M and minimum squad 3, an empty team shows **Max bid $23M**; after Delhi bought one player for $2M the row showed purse $23M, squad 1, **max bid $22M**. Both values equal `remaining purse − base price × (min squad − players owned − 1)`, i.e. money is reserved at base price for every *other* mandatory slot still to be filled.

## 6. Limits of this research
- Bidding-timer behaviour (30 s configured) was not exercised in the video: the console showed **"Auctioneer — No Timer"** during admin bidding, so timer semantics are not observable here.
- Team-owner bidding (magic link) was not demonstrated; only admin bidding on behalf of teams was.
- Trades, registration form, WhatsApp, player grades and retention were visible as menu items only.
