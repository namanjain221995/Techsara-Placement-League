# Asset Licenses

## What the application ships
| Asset | Source | License |
|---|---|---|
| Inter Variable font | `@fontsource-variable/inter` (npm) | SIL Open Font License 1.1 |
| Oswald Variable font | `@fontsource-variable/oswald` (npm) | SIL Open Font License 1.1 |
| Icons | `lucide-react` | ISC |
| TPL shield/gavel mark, favicon | Original SVG drawn for this project (`src/components/brand.tsx`, `public/favicon.svg`) | Project-owned |
| Candidate portrait placeholder (silhouette + initials) | Original SVG generated in code (`src/components/media.tsx`) | Project-owned |
| Team monogram badges | Generated in code from the team's short name and colour | Project-owned |
| Backgrounds, stadium grid, glows | CSS gradients (`globals.css`) | Project-owned |
| Gavel / tick sounds | Synthesized at runtime with the Web Audio API | Project-owned (no files) |
| Confetti | `canvas-confetti` library (code, no images) | ISC |

**No photographs or third-party images are bundled.** Stock-photo sites (Unsplash, Pexels, Wikimedia) were unreachable from the build environment's network allow-list, and none were needed: every visual is drawn in code, so there is nothing to license or attribute. Organizers upload their own team logos and candidate photos; they are responsible for having the right to use them.

## Not used (deliberately)
- CricSmart branding, layouts, illustrations or code.
- IPL/franchise names and logos (visible in the client's reference event). Test and screenshot data use invented names (Code Crusaders, Hire Hawks, Offer Owls, Pipeline Panthers, Recruit Rockets); see open question Q-03 before using real franchise names on a public screen.

## Evidence images in the documentation
`docs/video-analysis/frames/*.jpg` are downscaled frames from the client's own screen recording, kept only as requirement evidence (internal documentation). They show the third-party reference product and should not be published.

## Open-source dependencies
All runtime dependencies are permissively licensed (MIT/ISC/Apache-2.0/BSD); PostgreSQL binaries via `embedded-postgres` are under the PostgreSQL License. Run `npx license-checker --summary` for a full list.
