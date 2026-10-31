# Deployment Guide

Nothing has been deployed publicly; this guide describes the options.

## Option A — Event laptop (recommended for a single event)
1. `npm install && npm run setup && npm run build`
2. `npm start` (production mode, port 3000, all interfaces).
3. Projector/phones on the same network open `http://<laptop-ip>:3000/display/<code>`.
4. Disable sleep; keep the charger in; rehearse once and **Reset**.
Capacity: one Node process comfortably serves the organizer consoles and dozens of screens (each update is a ~10 KB snapshot).

## Option B — Server / cloud (e.g. AWS)
| Component | Recommendation |
|---|---|
| Compute | One small VM/container (e.g. EC2 t3.small, 2 GB RAM) running `npm start` under a process manager (systemd, pm2) |
| Database | Managed PostgreSQL ≥ 14 (e.g. RDS); set `DATABASE_URL`; the app migrates on start |
| TLS & proxy | Caddy/Nginx/ALB terminating HTTPS, forwarding WebSocket upgrades for `/socket.io` (`Upgrade`/`Connection` headers, idle timeout ≥ 60 s); set `COOKIE_SECURE=true` |
| Files | Persistent volume for `UPLOAD_DIR` (or mount EFS); include in backups |
| Secrets | `ADMIN_PASSWORD` only for the first start (unset → a random password is generated and printed once); then manage accounts with `npm run create-admin` |
| Scaling | Run **one** instance per database. Commands are serialised in-process (and row-locked in PostgreSQL); multiple instances would need a Socket.IO adapter (e.g. Redis) to share broadcasts — not configured |

Example Nginx location:
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 75s;
}
```
Set `TRUST_PROXY` (e.g. `1`, or `loopback, uniquelocal`) so rate limiting and the audit log see client IPs behind the proxy.

## Option C — Docker Compose (app + PostgreSQL)
Requires Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin.

**Windows, one click:** `start-with-docker.cmd` (starts Docker Desktop if needed, builds, starts, waits until the app answers, opens the browser) and `stop-docker.cmd`.
```bash
docker compose up -d --build                 # first build: a few minutes
docker compose logs app                      # organizer password generated on first start (if ADMIN_PASSWORD is not set)
```
Open **http://localhost:3000/admin** (organizer) — the live-screen link is in the console; other devices use `http://<this computer's IP>:3000`.

| Setting (optional `.env` next to `docker-compose.yml`) | Default | Purpose |
|---|---|---|
| `APP_PORT` | 3000 | Host port for the app |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | admin / generated | First organizer (password printed in `docker compose logs app` when not set) |
| `POSTGRES_PASSWORD` | tpl | Database password — applied only when the `tpl_pg` volume is first created; the database is not published outside Docker |
| `COOKIE_SECURE` | false | `true` behind HTTPS |

- Data lives in the named volumes `tpl_pg` (database) and `tpl_uploads` (logos/photos); `docker compose down` keeps them, `docker compose down -v` deletes them.
- Update after changing the code: `docker compose up -d --build`.
- The image (`Dockerfile`) is a two-stage build on `node:22-bookworm-slim`: dependencies + `next build`, then production dependencies only, running as the unprivileged `node` user with a health check on `/api/health`.

## Option D — AWS EC2 + Cloudflare Tunnel + GitHub Actions (production)
How `https://tpl.techsarasolutions.com` is run. Every push to `main` is tested and then deployed by `.github/workflows/deploy.yml`.

```
GitHub Actions: typecheck · lint · unit · integration · build · end-to-end
      └─ SSH → /tmp/tpl-release.tgz + deploy/deploy.sh → sudo bash deploy.sh
              └─ docker compose -f docker-compose.prod.yml up -d --build
                   db (postgres:17) · app (port 3000 on 127.0.0.1 only) · cloudflared (tunnel)
Visitors: https://tpl.techsarasolutions.com → Cloudflare → tunnel → http://app:3000
```

**One-time setup**
1. **Server** — any Ubuntu 22.04+/24.04 or Amazon Linux 2023 instance (t2.medium or larger, ≥ 20 GB disk recommended). Security group: inbound **SSH (22)** reachable from GitHub Actions (GitHub-hosted runners use many addresses, so in practice 0.0.0.0/0 with key-only login). **No** inbound rule for 80/443/3000 is needed — the tunnel connects outwards. Prefer an **Elastic IP**: the auto-assigned public IP changes when the instance is stopped.
2. **GitHub → Settings → Secrets and variables → Actions → New repository secret**
   | Secret | Value |
   |---|---|
   | `EC2_HOST` | the server's public IP or DNS name |
   | `EC2_SSH_KEY` | the whole content of the instance's `.pem` key, including the `-----BEGIN …-----` / `-----END …-----` lines |
   | `CLOUDFLARE_TUNNEL_TOKEN` | the tunnel token (the long `eyJ…` value after `--token` in Cloudflare's "Run tunnel with Docker" command) |
   | `TPL_ADMIN_PASSWORD` *(optional)* | the first organizer password; if absent one is generated on the server |
   | `EC2_USER` *(optional)* | SSH user; `ubuntu` and `ec2-user` are tried automatically |
3. **Cloudflare Zero Trust → Networks → Tunnels → (your tunnel) → Public hostnames → Add**: subdomain `tpl`, domain `techsarasolutions.com`, service type **HTTP**, URL **`app:3000`**. Cloudflare creates the DNS record. The domain must be a zone in the same Cloudflare account.
4. **Actions → CI / Deploy → Run workflow** (or push to `main`). The first deploy installs Docker, adds a 2 GB swap file on small instances, writes `/opt/techsara-placement-league/shared/.env` (database password, organizer password, tunnel token — mode 600) and starts the three containers.

**Organizer login:** user `admin`, password = `TPL_ADMIN_PASSWORD`, or read the generated one on the server: `sudo grep ADMIN_PASSWORD /opt/techsara-placement-league/shared/.env`.

**Operating the server**
```bash
cd /opt/techsara-placement-league/current
C="sudo docker compose --env-file ../shared/.env -f docker-compose.prod.yml"
$C ps                     # status
$C logs -f app            # application log (cloudflared: logs -f cloudflared)
$C restart app            # restart
sudo docker exec techsara-placement-league-db-1 pg_dump -U tpl tpl > tpl-$(date +%F).sql   # database backup
```
- Data persists in the Docker volumes `tpl_pg` and `tpl_uploads` across deploys; the last 3 releases are kept in `releases/`.
- Rotating the tunnel token: update the GitHub secret and re-run the workflow (the new value replaces the old one in `shared/.env`).
- Change the organizer password: `$C exec app npm run create-admin -- admin '<new password>'`.
- Security notes: the repository is public, so the workflow never prints secrets, and pull requests from forks never reach the deploy job (it runs only for pushes to `main`). The SSH host key is trusted on first use.

## Backups
```bash
pg_dump "$DATABASE_URL" > tpl-$(date +%F).sql          # external DB
npm run db:start  # then: pg_dump postgres://tpl:tpl@127.0.0.1:5433/tpl > backup.sql   (embedded DB)
```
Copy `storage/uploads` alongside the dump.

## Readiness assessment
| Item | Status |
|---|---|
| Production build | Passes (`next build`) |
| Automated tests | Unit, integration and E2E suites pass (see TEST_REPORT.md) |
| Security headers, auth, CSRF, audit | In place; CSP disabled (see SECURITY_DESIGN.md) |
| HTTPS | Requires a reverse proxy |
| Horizontal scaling | Not supported without a Socket.IO adapter (not needed for one event) |
| Monitoring | `/api/health` endpoint; no metrics stack bundled |
