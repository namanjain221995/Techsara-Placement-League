# Screen Blueprints

## Public
| Route | Purpose | Layout |
|---|---|---|
| `/` | Landing | Brand hero, "Open organizer console", "Open a live screen" (paste link/code), three value points |
| `/login` | Organizer sign-in | Centered panel: username, password, error, sign in |
| `/display/<code>` | **Live screen** (projector, LED wall, spectators' phones) | See below |

### Live screen (1920×1080 reference; fluid to 390 px phones and 4K)
```
┌ ON AIR ─────────────── EVENT TITLE (gold) ──────────── Round│Pool│Sold  🔈 ⛶ ┐
│ ┌────────────── Candidate stage (60%) ──────────────┐ ┌── Teams (40%) ──────┐│
│ │ [Photo 3:4 #19]  ROLE                ┌CURRENT BID┐│ │TEAM  MAXBID PURSE SQ││
│ │                  CANDIDATE NAME      │   $2M     ││ │▶ Leader (glow, BID) ││
│ │                  Base price $1M      │ 2.0× base ││ │  Team (most bought) ││
│ │                  ┌ BIDDING NOW: [logo] TEAM ───┐ ││ │  Team               ││
│ │ ┌ DESCRIPTION (auto-fit, never truncated) ──────┐││ │  Team               ││
│ │ │ • Experience: 5 years                          │││ │  Team               ││
│ │ │ • Niche: …                                     │││ │ min 3 · max 9       ││
│ └────────────────────────────────────────────────────┘ └─────────────────────┘│
└ ● TICKER  LIVE … · SOLD … · TOP SALE … · OVERVIEW Sold x · Unsold y · Pool z ┘
```
States: **Starting soon** (DRAFT/LOCKED: rules chips + team line-up), **Next candidate coming up** (live, nothing on the block: last sale + counters), **Candidate on the block** (above), **Paused** banner, **SOLD/UNSOLD overlay** (photo, name, "Acquired by [team]", price, multiple of base, stamp, confetti), **Final squads** (COMPLETED: one card per team, Qualified/Disqualified, spent, left, bought candidates with prices), "Reconnecting…" pill.
Phone (< 1024 px): stage above the team table; columns switch to rem widths; title wraps to two lines.

## Organizer (`/admin/**`, signed in)
| Route | Content |
|---|---|
| `/admin` | My auctions: status filter chips, cards (status, teams, candidates, sold, purse), Set up / Control room / Display / Duplicate / Delete, New auction dialog |
| `/admin/auctions/:id` | **Overview**: status + lock/unlock/reset, stats, 5-step setup checklist with blocking issues and warnings, live-screen link (copy/open), plain-language max-bid explanation |
| `…/teams` | Team cards (colour bar, logo, members, purse/spent/max bid/squad), add/edit dialog (logo upload, name, short name, colour swatches + picker, members chips, purse), reorder ↑↓, delete (setup only) |
| `…/players` | Candidates: search, status filter with counts, **list ⇄ card view**, full descriptions, add/edit dialog (photo upload/URL, name, role, auto-growing description + live preview "as on the live screen", base price), Excel import with row errors, template, corrections dialog (assign / return to pool / disqualify / reinstate) |
| `…/settings` | Event (name, currency, roles), money & squads (purse, base, step, min/max) with live max-bid preview, live flow (countdown switch + seconds, next-candidate order); locked fields disabled after lock |
| `…/live` | **Live console** — status bar (state, round, pool, sold, unsold, spent; Live screen, Go live, Pause/Resume, End auction); candidate on the block (photo, role, base, lot/round, countdown, name, current bid + multiple, leading team, full description); next-bid stepper; **Tap the team that bid** grid (purse, max, squad, Leading/Too high/Full); Custom amount; Sold / Unsold / Undo / Skip / Disqualify / Restart timer; idle state with last result, Next candidate, Pick candidate, Start next round; side: bid history, team squads (amber below minimum), announcement, shortcuts |
| `…/results` | Totals, Export Excel, tabs: Squads (team cards with bought candidates, Qualified/Disqualified), Bid history (per lot, undone bids struck through), Audit log |

Every organizer page subscribes to the same live connection, so lists refresh the instant anything changes (also when two organizers work at once).
