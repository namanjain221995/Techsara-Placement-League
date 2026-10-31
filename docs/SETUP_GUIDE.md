# Setup Guide

## 1. Install
1. Install **Node.js 22 LTS** (or ≥ 20.11) from nodejs.org.
2. Open a terminal (PowerShell on Windows) in the project folder:
   ```bash
   npm install
   npm run setup
   ```
   `setup` will:
   - create `.env` from `.env.example` with a **random organizer password** (printed once),
   - start the bundled PostgreSQL (no installation, no Docker) and create the schema,
   - create the organizer account.

## 2. Run
| Situation | Command |
|---|---|
| Event / normal use | `npm run build` once, then `npm start` |
| Development (hot reload) | `npm run dev` |

Open `http://localhost:3000`. The console prints the network address for other devices.

### Run with Docker instead
With Docker Desktop installed, no Node.js is needed: double-click `start-with-docker.cmd` (Windows) or run `docker compose up -d --build`, then open `http://localhost:3000/admin`. The first organizer password appears in `docker compose logs app` (or set `ADMIN_PASSWORD` in `.env` before the first start). See `DEPLOYMENT_GUIDE.md` → Option C.

## 3. Where data lives
| Data | Default location | Override |
|---|---|---|
| Database (embedded) | Windows: `%LOCALAPPDATA%\techsara-placement-league\postgres` · macOS/Linux: `./.data/postgres` | `EMBEDDED_PG_DIR` |
| Uploaded logos/photos | `./storage/uploads` | `UPLOAD_DIR` |
| External PostgreSQL instead | — | `DATABASE_URL=postgres://user:pass@host:5432/db` |

The embedded database listens only on `127.0.0.1:5433` (`EMBEDDED_PG_PORT`).

## 4. Configuration (`.env`)
| Key | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | 3000 / 0.0.0.0 | Web server (0.0.0.0 lets the projector PC and phones connect) |
| `DATABASE_URL` | empty | Empty = embedded PostgreSQL |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | admin / random (from `npm run setup`) | First organizer, created only if no organizer exists. There is no built-in default: if the password is empty or shorter than 10 characters, a random one is generated and printed once in the server console. |
| `SESSION_TTL_HOURS` | 12 | Login lifetime |
| `UPLOAD_DIR` | ./storage/uploads | Images |
| `COOKIE_SECURE` | false | Set `true` when served over HTTPS |

## 5. Network & projector checklist
- Laptop and projector PC/phones on the **same network**; on Windows allow "Node.js" on **private networks** when the firewall asks.
- Projector: open `http://<laptop-ip>:3000/display/<code>` in Chrome/Edge, press the ⛶ button (or F11) for full screen.
- Keep the laptop plugged in and disable sleep during the event.

## 6. Tests (optional)
```bash
npm test                     # unit + integration (starts its own PostgreSQL on port 5434)
npm run build
npx playwright install chromium   # first time only
npm run test:e2e             # end-to-end on port 3100 with its own PostgreSQL (5435)
```

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| `EADDRINUSE :3000` | Another app uses port 3000 → set `PORT=3001` in `.env` |
| Embedded DB fails to start after a crash | Stop all `node` processes and retry; if it persists delete the `postmaster.pid` file in the DB folder |
| Forgot the organizer password | `npm run create-admin -- admin <new-password>` |
| Display shows "Reconnecting…" | Check Wi-Fi; it resyncs automatically when the connection returns |
