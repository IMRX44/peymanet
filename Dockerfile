# Peymanet - LegalAI
# Single-stage image. Runs out of the box in MOCK mode (no API key) on SQLite.
# To go live, pass provider env vars at runtime — OpenAI, any OpenAI-compatible
# endpoint, Azure OpenAI, Google Gemini, or Anthropic Claude (see README).

FROM node:22-slim
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV AI_MODE=mock
ENV AI_PROVIDER=openai
# SQLite lives under /app/data so a volume can persist it across rebuilds.
ENV DATABASE_URL=file:/app/data/dev.db
# Seed only when the database is empty, so restarts never wipe persisted data.
ENV SEED_ONLY_IF_EMPTY=1
ENV OPENAI_MODEL=gpt-4o
ENV OPENAI_MODEL_FAST=gpt-4o-mini
ENV DEFAULT_LOCALE=fa
ENV npm_config_audit=false
ENV npm_config_fund=false

# Prisma needs openssl at build + runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Data dir for the SQLite DB (mount a volume here to persist it — see compose).
RUN mkdir -p /app/data

# Copy the whole project first so the prisma schema is present for prisma generate.
COPY . .

# Install deps (skip package scripts to keep install lean), then generate + build.
RUN npm ci --ignore-scripts
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# On start: sync the schema, seed on FIRST boot only (SEED_ONLY_IF_EMPTY), then serve.
# Works for SQLite and Postgres alike (prisma db push targets whatever DATABASE_URL points at).
CMD ["sh", "-lc", "npx prisma db push --skip-generate && npx tsx prisma/seed.ts && NODE_ENV=production npx next start -H 0.0.0.0 -p 3000"]
