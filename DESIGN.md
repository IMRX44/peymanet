# Peymanet (پیمان‌نت) — Product & Engineering Design
### AI Contract Risk Heatmap · Contract Timeline · AI Negotiation Assistant

> سند دوزبانه · Bilingual document (فارسی / English). اصطلاحات فنی، نام فیلدها و کد به انگلیسی هستند.

این سند طراحی کامل سه قابلیت پرچم‌دار یک پلتفرم LegalAI و معماری پیاده‌سازی‌شده‌ی آن را پوشش می‌دهد. کل محصول به‌صورت end-to-end پیاده‌سازی شده و در **حالت mock بدون نیاز به کلید API** قابل اجراست و با تنظیم `AI_MODE=openai` به موتور واقعی OpenAI متصل می‌شود.

This document covers the complete design of three flagship LegalAI features and their implemented architecture. The product is built end-to-end, runs in **mock mode with no API key**, and switches to live **OpenAI** with `AI_MODE=openai`.

---

## 1. Complete Product Design · طراحی محصول

**فارسی:** پیمان‌نت یک «فضای کاری هوش قراردادی» است. کاربر قرارداد را باز می‌کند و در یک محیط سه‌ستونه کار می‌کند: ناوبری بندها (راست در RTL)، بوم سند با نقشه‌ی حرارتی ریسک (مرکز)، و ریل زمینه‌ای (چپ) که بین سه تب جابه‌جا می‌شود: داشبورد ریسک، خط‌زمانی، و مرکز مذاکره. نوآوری اصلی این است که سه قابلیت **یک ستون فقرات داده‌ی مشترک** دارند: نقشه‌ی ریسک ارزیابی‌های هر بند را تولید می‌کند، دستیار مذاکره از همان ارزیابی‌ها استراتژی می‌سازد، و هر تغییر (اعمال اصلاح، پذیرش پیشنهاد، ویرایش) یک رویداد در خط‌زمانی ثبت می‌کند — پس خط‌زمانی هم‌زمان لاگ حسابرسی است.

**English:** Peymanet is a contract-intelligence workspace. The user opens a contract and works in a three-pane environment: clause navigation, a document canvas with a live risk heatmap, and a contextual rail that switches between Risk Dashboard, Timeline, and Negotiation Center. The core innovation is a **shared data spine**: the heatmap produces per-clause `RiskAssessment`s, the negotiation assistant *consumes* them to build strategy, and every mutation emits a `TimelineEvent` — so the Timeline is also the audit log. Most tools bolt these on separately; here they reinforce each other.

Implemented surfaces: `app/page.tsx` (landing), `app/contracts/page.tsx` (list), `app/contracts/[id]/page.tsx` (workspace) → `components/workspace/workspace-shell.tsx`.

---

## 2. User Experience Flow · جریان تجربه‌ی کاربری

**Feature 1 — Risk Heatmap:** open contract → analysis (seeded, or re-scan via SSE) → clauses light up progressively → hover a clause → floating card (score, explanation, AI reasoning, suggested fix, alternative clause) → act (Apply fix / Send to negotiation) → right-rail Risk Dashboard summarizes (overall gauge, top-10, missing clauses, compliance, recommendations).

**Feature 2 — Timeline:** every change emits an event → view as graph or list → click an event for the diff preview (who/what/when/why + AI/Human source) → compare any two versions (redline) → restore (non-destructive) → branch → merge (3-way, conflict surfacing) → scrub through time (document morphs with crossfade).

**Feature 3 — Negotiation:** pick perspective (Employee/Employer, Buyer/Seller, …) → generate report → each item shows current→projected risk, the one-sided/unfair/exploitable flags, suggested change, strategy, expected counter-argument, suggested response + Win Probability / Difficulty / Business Impact / Legal Impact → Opportunity Score, Checklist, Talking Points → **what-if simulator** (toggle items, projected overall risk drops live) → **war-game** chat (AI plays the counterparty) → accept (applies projected risk to the clause + logs a timeline event).

**فارسی (خلاصه):** هر سه جریان از یک نقطه شروع می‌شوند (باز کردن قرارداد) و خروجی هرکدام ورودی دیگری است؛ «اعمال اصلاح» در نقشه‌ی ریسک و «پذیرش» در مذاکره هر دو ریسک بند را کاهش می‌دهند و رویداد خط‌زمانی می‌سازند.

---

## 3. UI Wireframe Description · توصیف وایرفریم

```
┌───────────────────────────────────────────────────────────────────────────┐
│ TopBar: logo · title · type/status · [demo-mode] [colorblind] [re-scan] FA/EN ☾│
├──────────────┬───────────────────────────────────┬────────────────────────┤
│ Clause Nav   │  Contract Canvas (heatmap)        │  Context Rail (Tabs)    │
│  • dot+title │   ┌ clause block (tinted by risk) ┐│  [Risk][Timeline][Nego] │
│  • jump      │   │ title           score-chip    ││                         │
│              │   │ clause text …                 ││  Risk: gauge, top-10,   │
│  (RTL: this  │   └ hover → Floating Risk Card ───┘│  missing, compliance,   │
│   rail sits  │   … more clauses …      ▓ minimap ││  recommendations        │
│   on right)  │                          ▓ strip   ││  Timeline: graph+diff   │
│              │   [streaming progress bar]         ││  Nego: score+simulator  │
├──────────────┴───────────────────────────────────┴────────────────────────┤
│ Disclaimer: AI guidance, not legal advice · راهنمایی هوش مصنوعی، نه مشاوره   │
└───────────────────────────────────────────────────────────────────────────┘
```

Floating Risk Card: severity badge + score, risk meter, category chips + confidence, citation, explanation, legal reasoning, green suggested-fix box, LTR alternative-clause block, [Apply fix] [Send to negotiation].

---

## 4. Database Schema · شمای پایگاه‌داده

Prisma, `prisma/schema.prisma`. Postgres-targeted for production; SQLite for dev (one-line `provider` switch). Enums modeled as `String` (TS unions + Zod) and JSON stored as String columns (`...Json`) for portability — see `lib/db/json.ts`.

Core models: `Organization`, `User`, `Contract`, `ContractVersion` (immutable DAG node, `parentId`), `Branch`, `Clause` (offsets into canonical text), `AnalysisRun`, `RiskAssessment`, `MissingClause`, `ComplianceIssue`, `Recommendation`, `TimelineEvent` (append-only event source = history + audit), `NegotiationReport`, `NegotiationItem`, `ChecklistItem`, `NegotiationSession` (war-game), `AiCall` (cost/latency observability), `AiCache` (content-hash dedupe).

Key relationships: a `Contract` has many `ContractVersion`s and one `headVersion`; versions form a DAG via `parentId` and optionally belong to a `Branch`; `Clause`s belong to a version and anchor both `RiskAssessment`s and `NegotiationItem`s — that anchoring is what lets a negotiation "accept" lower a heatmap score.

---

## 5. API Design · طراحی API

Mutations are **Server Actions** (`app/actions.ts`); streaming is an **SSE route**.

- `GET /api/contracts/[id]/analyze` — SSE; emits `start` → `clause` (per result) → `done`. Powers the progressive heatmap fill.
- `applyFixAction(clauseId)` — replace clause with alternative, lower risk, log `fix_applied`.
- `restoreVersionAction`, `createBranchAction`, `mergeBranchAction` — Timeline ops (merge returns conflicts).
- `generateNegotiationAction(contractId, perspective)`, `acceptNegotiationItemAction(itemId)`, `toggleChecklistAction`, `wargameAction`.
- `setLocaleAction(locale)` — cookie-based bilingual switch.

All payloads validated by the shared Zod schemas in `lib/ai/schemas.ts` (one definition for AI output **and** API I/O). Data loading is via RSC + `lib/db/queries.ts` (`getWorkspace` shapes + localizes everything into serializable props).

---

## 6. AI Architecture · معماری هوش مصنوعی

Unified provider layer (`lib/ai/providers.ts`) exposes `segmentContract`, `analyzeClauseRisk`, `summarizeDocument`, `generateNegotiationReport`, `wargameReply` — each switches between **mock** and **OpenAI** behind one interface, with content-hash caching (`lib/ai/cache.ts`) and per-call logging (`AiCall`).

- **OpenAI path:** Vercel AI SDK `generateObject` with a Zod schema → guaranteed typed JSON; models via `OPENAI_MODEL` (deep) / `OPENAI_MODEL_FAST` (segmentation).
- **Mock path:** `lib/ai/mock.ts` — deterministic, *contextual*, bilingual results derived from clause-text keyword detection (fa+en). Makes the whole app demoable with no key and makes tests deterministic.
- **Pipeline:** ingest → segment → per-clause risk (bounded concurrency, streamed) → doc summary → negotiation (reuses risk output) → war-game chat.
- **Confidence:** model-reported + heuristic; high-severity items can get a second-pass self-consistency check (production).

**فارسی:** همان مسیر کد هم mock و هم OpenAI را پوشش می‌دهد؛ تنها یک متغیر محیطی (`AI_MODE`) بین آن‌ها سوییچ می‌کند و خروجی هر دو با همان schemaهای Zod اعتبارسنجی می‌شود.

---

## 7. Prompt Engineering Strategy · استراتژی مهندسی پرامپت

`lib/ai/prompts.ts`. Principles: persona + scoring rubric + structured schema + jurisdiction/type awareness + guardrails + citation-to-clause. Every bilingual field must be returned in **both** `fa` and `en`.

- Risk rubric pins the 0–100 scale (0-25 safe · 26-50 medium · 51-75 high · 76-100 critical) so scores are consistent across runs.
- Guardrails: output only the structured object; cite the exact phrase; never invent statutes; "guidance, not legal advice".
- Negotiation: persona = strategist for the chosen perspective; Win Probability is explicitly a **heuristic** (fairness asymmetry × market norms × leverage), never a guarantee.
- War-game: system primes the model as the counterparty; replies kept to 2-4 sentences in the user's language.

---

## 8. System Architecture · معماری سیستم

Single Next.js 15 (App Router) monolith, layered: `app/` (RSC + actions + SSE), `lib/ai` (providers/prompts/schemas/mock/cache), `lib/db` (prisma/queries/json), `lib/events` (event-sourcing: versions, branches, 3-way merge), `lib/diff`, `lib/risk`, `lib/negotiation`, `components/*`.

- **Event sourcing** (`lib/events`): append-only `TimelineEvent` is the source of truth; `commitEdit` snapshots a version, computes the redline diff, and records the event in one flow; the integration hub for all features.
- **Async analysis:** SSE inline runner with bounded concurrency + cache; production upgrade path = Inngest/Trigger.dev or BullMQ (pipeline functions unchanged).
- **Security & trust:** org-scoped multi-tenancy, the Timeline as immutable audit trail, persistent disclaimers, AI cost/latency logging.

---

## 9. Modern SaaS UI Ideas · ایده‌های رابط مدرن

Three-pane workspace with a context right-rail; glassmorphism floating cards + ambient mesh gradient (`.mesh-bg`); **dark-mode default** with light toggle; **RTL-first** bidi-correct layout (logical `ms-/me-/start/end`); Vazirmatn (fa) + Inter (en); **risk minimap** strip; VSCode-style clause nav; colorblind-safe **texture toggle** (`SEVERITY_PATTERN`); skeleton/optimistic UI; toast-with-undo (sonner); Persian-digit formatting; accessible focus rings and ARIA on meters/gauges. (Command palette / inline-AI suggestions are designed as next steps.)

---

## 10. Framer Motion Animation Ideas · ایده‌های انیمیشن

- **Heatmap:** per-clause tint **ink-fill** as results stream in (`AnimatePresence`, opacity sweep); **breathing pulse** on critical clauses (`animate-risk-pulse`); floating card spring scale+fade; gauge = `useSpring` count-up + arc `pathLength` draw; minimap shimmer; staggered dashboard lists; streaming progress bar width animation.
- **Timeline:** graph nodes spring-in along the rail; event cards stagger; diff added-text greens-in / removed strikes; expand/collapse height; scrubber crossfade between versions.
- **Negotiation:** win-probability meter fill + number count-up (color by probability); opportunity radial sweep; simulator "after" value animates with a flying delta when items toggle; checklist satisfying check + strike; war-game messages slide-in.

Shared primitives: `components/shared/{animated-number,score-ring,meter}.tsx`.

---

## 11. Enterprise-Level Features · قابلیت‌های سازمانی

Built/foundational: multi-tenant orgs + roles, audit log (= Timeline), AI usage/cost logging, bilingual + RTL, deterministic mock for safe demos/evals, content-hash caching.

Designed (clear upgrade paths): SSO/SAML, RBAC enforcement, encryption at rest, e-signature + DocuSign hooks, clause library & templates, bulk analysis, public API + webhooks, PDF/DOCX redline export, approval workflows, comments/@mentions, Drive/SharePoint import, white-label, SOC2-oriented logging, data residency.

---

## 12. Competitive Advantages · مزیت‌های رقابتی

1. **Real-time progressive heatmap** inside the contract text (vs static PDF reports).
2. **Git-style branching/merge for contracts** — branch, 3-way merge, conflict surfacing.
3. **Dual-perspective negotiation** with quantified Win Probability + a **war-game simulator**.
4. **Unified event spine** — fixes and accepts automatically flow into history/audit.
5. **What-if risk-reduction simulation** — instant, no extra AI call.
6. **RTL / Persian-first + bilingual** — an underserved market, with English legal wording where it matters.
7. **Explainability** — reasoning + clause citations build trust; deterministic mock makes the product evaluable and demoable offline.

---

> سلب مسئولیت: خروجی‌های این محصول راهنمایی مبتنی بر هوش مصنوعی است و مشاوره‌ی حقوقی محسوب نمی‌شود.
> Disclaimer: outputs are AI-generated guidance and do not constitute legal advice.
