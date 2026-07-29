# Verdict API + audit worker.
# Playwright needs a real container (never serverless). Works on Railway,
# Fly.io, Render (paid tier), or any VPS with Docker.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
  && npx playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DEV_MODE=false \
    FREE_AUDIT_CREDITS=1

# Persistence — pick ONE:
#   a) Mount a disk and point DATA_DIR + STORAGE_DIR at it (Fly volume at
#      /data with DATA_DIR=/data/state STORAGE_DIR=/data/screens). Recommended
#      on paid hosts — see fly.toml.
#   b) Set SUPABASE_URL + SUPABASE_SERVICE_KEY (free tier) — state and
#      screenshots are mirrored to Supabase Storage; no disk needed (for
#      ephemeral-disk free hosts like Render free / Cloud Run).

EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
