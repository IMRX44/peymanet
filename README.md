# پیمان‌نت · Peymanet — LegalAI

> هوش قراردادی: نقشه‌ی حرارتی ریسک، خط‌زمانی نسخه‌ها (Git-مانند) و دستیار مذاکره.
> Contract intelligence: AI Risk Heatmap, Git-style Contract Timeline, and an AI Negotiation Assistant.

پلتفرمی با **Next.js 15** که قرارداد را بند به بند تحلیل می‌کند، ریسک را روی متن رنگ‌آمیزی می‌کند، تاریخچه‌ی تغییرات را مثل Git مدیریت می‌کند و مثل یک وکیل کنار شما مذاکره را راهبری می‌کند. کاملاً **دوزبانه (فارسی/انگلیسی، RTL-first)**.

Built with **Next.js 15**. Runs fully **without an API key** (deterministic mock AI) and connects to **OpenAI** with one env var. See `DESIGN.md` for the full product & engineering design.

---

## Quick start · شروع سریع

```bash
npm install
cp .env.example .env          # defaults are fine for a local demo
npm run db:push               # create the SQLite dev database
npm run db:seed               # seed a bilingual sample employment contract
npm run dev                   # http://localhost:3000
```

Open `/` → **Open sample contract** → explore the three features (Risk / Timeline / Negotiation).

---

## AI mode · حالت هوش مصنوعی

Controlled by `AI_MODE` in `.env`:

| `AI_MODE` | Behavior |
|-----------|----------|
| `mock` (default) | Deterministic, contextual, bilingual results from `lib/ai/mock.ts`. No API key, no network. Ideal for demos, tests, offline. |
| `openai` | Live OpenAI via the Vercel AI SDK (`generateObject`). Requires `OPENAI_API_KEY`. Models: `OPENAI_MODEL` (deep), `OPENAI_MODEL_FAST` (segmentation). |

The same code path and the same Zod schemas (`lib/ai/schemas.ts`) serve both modes — switching is a one-line env change.

---

## Switching to PostgreSQL (production) · سوییچ به Postgres

The schema is Postgres-ready. In `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Set `DATABASE_URL="postgresql://user:pass@host:5432/peymanet?schema=public"`, then `npm run db:push && npm run db:seed`. No model changes needed — enums are `String` (validated by Zod) and JSON lives in String columns (`lib/db/json.ts`).

---

## Scripts · اسکریپت‌ها

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (merge, diff, risk aggregation, simulator, mock schema validity) |
| `npm run db:push` / `db:seed` / `db:reset` | Prisma schema push / seed / reset+seed |

---

## Project structure · ساختار پروژه

```
app/                      routes (RSC), server actions (actions.ts), SSE analyze route
components/
  workspace/  heatmap/  timeline/  negotiation/  shared/  ui/
lib/
  ai/        providers · prompts · schemas (Zod) · mock · cache · models
  db/        prisma · queries (workspace loader) · json helpers
  events/    versions · branches · 3-way merge · recordEvent (event sourcing)
  diff/  risk/  negotiation/  i18n/  constants
prisma/      schema.prisma · seed.ts
messages/    fa.json · en.json (UI chrome; legal content is bilingual in-DB)
```

---

## Notes · نکات

- **Not legal advice.** Outputs are AI-generated guidance. · خروجی‌ها راهنمایی هوش مصنوعی هستند و مشاوره‌ی حقوقی نیستند.
- Auth is a seeded demo user (`lib/auth.ts`); designed to drop in Auth.js/SSO later.
- Locale toggles via a cookie (next-intl, no route prefixes); RTL/LTR handled by the root layout.
