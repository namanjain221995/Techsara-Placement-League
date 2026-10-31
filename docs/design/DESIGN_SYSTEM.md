# Design System — "Night Stadium"

An original identity for a premium live-event feel: deep navy stadium night, trophy gold for money and winners, electric blue for live/system cues, each team's own colour as its accent. No third-party brand assets.

## Tokens (`src/app/globals.css` `@theme`)
| Token | Value | Use |
|---|---|---|
| `ink-950 … ink-50` | #04060d → #f4f6fc | Backgrounds (950/900), panels (800/750), borders (600/500), text (300 muted → 100 primary) |
| `gold-300/400/500/600` | #ffe08a / #ffd05a / #f5b83d / #d9951b | Money, max bid, primary buttons, "SOLD" stamp, gradient title text (`.text-gold`) |
| `volt-400/500/600` | #6aa8ff / #3b82f6 / #2563eb | Roles, links, display/system actions |
| `win-400/500` | #4ade80 / #22c55e | SOLD button, qualified, synced |
| `loss-400/500` | #fb7185 / #ef4444 | ON AIR, danger, disqualified, too-high |
| `warn-500` + amber-300 | #f59e0b | Paused, unsold, below minimum |
| Team colour | organizer-chosen hex | Logo badge gradient, leader glow (`--glow`), SOLD card tint, confetti |
| `--radius-card` | 1.25rem | Panels |

Readable text on any team colour is chosen automatically (`onColor()` luminance check).

## Typography
| Role | Face | Notes |
|---|---|---|
| Display (titles, names, money, counters) | **Oswald Variable** (SIL OFL), uppercase, tabular numbers | Condensed sports-broadcast feel; fits long names |
| UI & descriptions | **Inter Variable** (SIL OFL) | High legibility on projectors |
| Fluid sizing on the live screen | `clamp(min rem, n vw, max rem)` | Same layout from a phone to a 4K LED wall |

Projector minimums (1920×1080): candidate name ≈ 69 px, current bid ≈ 104 px, team rows ≈ 26 px, description 12–46 px auto-fitted (always complete).

## Surfaces
- `.stage-bg` — layered radial gradients (blue top-left, gold top-right, violet bottom) over a navy ramp.
- `.grid-lines` — faint 56 px grid with a radial mask (stadium floor).
- `.panel` — glassy card: gradient fill, 1 px ink border, inner top highlight, deep shadow.
- `.description-text` — `white-space: pre-wrap` + `overflow-wrap: anywhere` (R-PLAYER-04).

## Components (`src/components`)
Button (primary/secondary/ghost/outline/success/danger/volt; sm→xl), Input, MoneyInput (symbol + "M" suffix), Textarea (auto-grow), Select, Switch, Field (auto-linked label, hint, error), Dialog + ConfirmProvider (Radix), Badge/StatusBadges, Stat, Kbd, EmptyState, Spinner, TeamLogo (logo or monogram), PlayerPhoto (photo or generated portrait), Description, AutoFitDescription, Wordmark/LogoMark.

## Accessibility
- Colour is never the only signal: status badges carry text ("Too high", "Leading", "Disqualified").
- All inputs have linked labels; dialogs trap focus (Radix); icon buttons have `aria-label`s; live connection state is a `role=status` region.
- `prefers-reduced-motion`: CSS animations collapse to near-zero duration, `motion` honours it, confetti is disabled, GSAP stamp is skipped.
- Keyboard: the live console is fully operable from the keyboard (N, 1–9, +/−, C, S, Z, P/R).
