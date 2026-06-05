# Peymanet (پیمانت) — LegalAI
# Single-stage image that runs the app out of the box in MOCK mode (no API key)
# on SQLite. For OpenAI: pass AI_MODE=openai and OPENAI_API_KEY at runtime.
# For PostgreSQL: switch the datasource provider in prisma/schema.prisma and set
# DATABASE_URL (see README).

FROM node:22-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    AI_MODE=mock \
    DATABASE_URL="file:./dev.db" \
    OPENAI_MODEL="gpt-4o" \
    OPENAI_MODEL_FAST="gpt-4o-mini" \
    DEFAULT_LOCALE="fa"

# Prisma needs openssl present at build + runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies (incl. dev deps — needed for build, prisma CLI and the seed).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build (prisma generate runs via the build script).
COPY . .
RUN npm run build

EXPOSE 3000

# On start: create/refresh the SQLite schema, seed the demo contract, then serve.
CMD ["sh", "-lc", "npx prisma db push --skip-generate && npx tsx prisma/seed.ts && NODE_ENV=production npx next start -H 0.0.0.0 -p 3000"]
