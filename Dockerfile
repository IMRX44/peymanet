# Peymanet - LegalAI
# Single-stage image. Runs out of the box in MOCK mode (no API key) on SQLite.
# To go live, pass provider env vars at runtime — OpenAI, any OpenAI-compatible
# endpoint, Azure OpenAI, Google Gemini, or Anthropic Claude (see README).

FROM node:22-slim
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV AI_MODE=mock
ENV AI_PROVIDER=openai
ENV DATABASE_URL=file:./dev.db
ENV OPENAI_MODEL=gpt-4o
ENV OPENAI_MODEL_FAST=gpt-4o-mini
ENV DEFAULT_LOCALE=fa
ENV npm_config_audit=false
ENV npm_config_fund=false

# Prisma needs openssl at build + runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the whole project first so the prisma schema is present for prisma generate.
COPY . .

# Install deps (skip package scripts to keep install lean), then generate + build.
RUN npm ci --ignore-scripts
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# On start: create the SQLite schema, seed the demo contract, then serve.
CMD ["sh", "-lc", "npx prisma db push --skip-generate && npx tsx prisma/seed.ts && NODE_ENV=production npx next start -H 0.0.0.0 -p 3000"]
