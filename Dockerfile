# TechSara Placement League — production image: UI + API + WebSocket on port 3000.
# Used by docker-compose.yml (which adds PostgreSQL). Build: docker compose build

# ---- build: install everything, compile the Next.js app -------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: production dependencies + compiled app ------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/app/storage/uploads
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/.next ./.next
COPY public ./public
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY tsconfig.json next.config.ts ./
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
