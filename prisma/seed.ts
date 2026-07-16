import { PrismaClient } from "@prisma/client";
import {
  mockRiskAssessment,
  mockDocSummary,
  mockNegotiationReport,
} from "../lib/ai/mock";
import { createVersion, commitEdit } from "../lib/events/versions";
import { createBranch } from "../lib/events/branches";
import { recordEvent } from "../lib/events/events";
import { hashPassword } from "../lib/crypto";
import { estimateCost } from "../lib/ai/models";

const prisma = new PrismaClient();

// ───────────────────── Sample contract (Persian employment agreement) ─────────

const CLAUSES = [
  {
    title: "ماده ۱ - موضوع قرارداد",
    type: "subject",
    text: "موضوع این قرارداد، استخدام کارمند جهت انجام وظایف مربوط به سمت توسعه‌دهنده‌ی نرم‌افزار است. کارمند موظف است وظایف محوله را مطابق دستورالعمل‌های کارفرما انجام دهد.",
  },
  {
    title: "ماده ۲ - مدت و دوره آزمایشی",
    type: "term",
    text: "مدت این قرارداد یک سال شمسی است. سه ماه ابتدای قرارداد به‌عنوان دوره آزمایشی تلقی می‌شود و در این مدت کارفرما می‌تواند بدون اطلاع قبلی قرارداد را خاتمه دهد.",
  },
  {
    title: "ماده ۳ - حقوق و مزایا",
    type: "payment",
    text: "حقوق ماهیانه کارمند مبلغ توافق‌شده است که در پایان هر ماه پرداخت می‌شود. کارفرما می‌تواند زمان پرداخت حقوق را در صورت بروز مشکلات مالی تا سی روز به تعویق بیندازد.",
  },
  {
    title: "ماده ۴ - فسخ قرارداد",
    type: "termination",
    text: "کارفرما این حق را دارد که در هر زمان و با اطلاع هفت روزه قرارداد را فسخ نماید. کارمند تنها با اطلاع سی روزه و جلب موافقت کتبی کارفرما می‌تواند قرارداد را فسخ کند.",
  },
  {
    title: "ماده ۵ - مسئولیت و جبران خسارت",
    type: "liability",
    text: "کارمند مسئول جبران کلیه خسارات وارده به کارفرما اعم از مستقیم و غیرمستقیم بوده و این مسئولیت سقف مشخصی ندارد. کارفرما در قبال خسارات وارده به کارمند مسئولیتی نخواهد داشت.",
  },
  {
    title: "ماده ۶ - مالکیت فکری",
    type: "ip",
    text: "کلیه آثار، اختراعات و دارایی‌های فکری که کارمند در طول مدت قرارداد یا خارج از ساعات کاری ایجاد کند، به‌طور کامل و دائمی متعلق به کارفرما خواهد بود.",
  },
  {
    title: "ماده ۷ - محرمانگی",
    type: "privacy",
    text: "کارمند متعهد است کلیه اطلاعات محرمانه کارفرما را به‌صورت دائمی و بدون محدودیت زمانی حفظ نماید. این تعهد پس از خاتمه قرارداد نیز برای همیشه ادامه خواهد داشت.",
  },
  {
    title: "ماده ۸ - حل اختلاف و صلاحیت قضایی",
    type: "jurisdiction",
    text: "کلیه اختلافات ناشی از این قرارداد منحصراً در دادگاه‌های محل اقامت کارفرما رسیدگی خواهد شد و قانون حاکم بر تفسیر آن، مقررات داخلی شرکت است.",
  },
];

function buildContent(clauses: typeof CLAUSES) {
  let contentText = "";
  const blocks = clauses.map((c, i) => {
    const block = `${c.title}\n${c.text}`;
    const start = contentText.length;
    contentText += block + (i < clauses.length - 1 ? "\n\n" : "");
    return { ...c, index: i, startOffset: start, endOffset: start + block.length };
  });
  const contentJson = JSON.stringify({
    type: "doc",
    content: clauses.flatMap((c) => [
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: c.title }] },
      { type: "paragraph", content: [{ type: "text", text: c.text }] },
    ]),
  });
  return { contentText, contentJson, blocks };
}

async function main() {
  console.log("🌱 Seeding Peymanet…");

  // Idempotent boot (Docker): when SEED_ONLY_IF_EMPTY=1, skip if the database
  // already has data — so restarts on a persistent volume never wipe user data.
  // Local `npm run db:seed` / `db:reset` don't set this flag and always reseed.
  if (process.env.SEED_ONLY_IF_EMPTY === "1") {
    const existingUsers = await prisma.user.count().catch(() => 0);
    if (existingUsers > 0) {
      console.log(`↩︎  Database already has ${existingUsers} user(s) — skipping seed.`);
      return;
    }
  }

  // Clean slate (respect FK order).
  await prisma.aiCall.deleteMany();
  await prisma.aiCache.deleteMany();
  await prisma.negotiationItem.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.negotiationSession.deleteMany();
  await prisma.negotiationReport.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.missingClause.deleteMany();
  await prisma.complianceIssue.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.analysisRun.deleteMany();
  await prisma.timelineEvent.deleteMany();
  await prisma.clause.deleteMany();
  await prisma.$transaction([
    prisma.contract.updateMany({ data: { headVersionId: null } }),
  ]);
  await prisma.contractVersion.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "دفتر حقوقی پیمانت", slug: "peymanet" },
  });

  // Admin (demo login): sees every contract + the per-user cost view + approves users.
  const owner = await prisma.user.create({
    data: {
      email: "demo@peymanet.app",
      name: "سارا رحیمی",
      role: "admin",
      approved: true,
      orgId: org.id,
      passwordHash: hashPassword("demo1234"), // demo admin login: demo@peymanet.app / demo1234
    },
  });
  // Approved member: owns their own contract and can only see it.
  const lawyer = await prisma.user.create({
    data: {
      email: "lawyer@peymanet.app",
      name: "علی محمدی",
      role: "member",
      approved: true,
      orgId: org.id,
      passwordHash: hashPassword("lawyer1234"), // member login: lawyer@peymanet.app / lawyer1234
    },
  });
  // Pending member: awaits admin approval (shown in the admin panel queue).
  await prisma.user.create({
    data: {
      email: "reza@peymanet.app",
      name: "رضا کریمی",
      role: "member",
      approved: false,
      orgId: org.id,
      passwordHash: hashPassword("reza1234"), // pending login: reza@peymanet.app / reza1234
    },
  });

  // Contract + initial version.
  const contract = await prisma.contract.create({
    data: {
      orgId: org.id,
      ownerId: owner.id,
      title: "قرارداد استخدام توسعه‌دهنده نرم‌افزار",
      type: "employment",
      jurisdiction: "Iran",
      language: "fa",
      status: "negotiation",
    },
  });

  const { contentText, contentJson, blocks } = buildContent(CLAUSES);
  const v1 = await createVersion({
    contractId: contract.id,
    contentJson,
    contentText,
    source: "human",
    authorId: owner.id,
    message: "پیش‌نویس اولیه قرارداد",
  });

  // Clauses for v1.
  const clauseRows = [];
  for (const b of blocks) {
    const row = await prisma.clause.create({
      data: {
        versionId: v1.id,
        index: b.index,
        title: b.title,
        type: b.type,
        text: b.text,
        startOffset: b.startOffset,
        endOffset: b.endOffset,
      },
    });
    clauseRows.push(row);
  }

  await recordEvent({
    contractId: contract.id,
    type: "created",
    source: "human",
    actorId: owner.id,
    summary: "قرارداد ایجاد شد",
    why: "بارگذاری پیش‌نویس اولیه برای تحلیل.",
    versionId: v1.id,
  });

  // ── Risk analysis (mock engine) ──
  const assessments = clauseRows.map((c) => mockRiskAssessment(c.text, c.title));
  const summary = mockDocSummary(
    clauseRows.map((c) => ({ text: c.text, title: c.title })),
    assessments,
  );

  const run = await prisma.analysisRun.create({
    data: {
      contractId: contract.id,
      versionId: v1.id,
      status: "completed",
      model: "mock",
      overallRisk: summary.overallRisk,
      summaryJson: JSON.stringify(summary),
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  for (let i = 0; i < clauseRows.length; i++) {
    const a = assessments[i];
    await prisma.riskAssessment.create({
      data: {
        runId: run.id,
        clauseId: clauseRows[i].id,
        riskScore: a.riskScore,
        severity: a.severity,
        confidence: a.confidence,
        categoriesJson: JSON.stringify(a.categories),
        citation: a.citation,
        explanation: JSON.stringify(a.explanation),
        reasoning: JSON.stringify(a.reasoning),
        suggestedFix: a.suggestedFix ? JSON.stringify(a.suggestedFix) : null,
        alternativeClause: a.alternativeClause,
      },
    });
  }
  for (const m of summary.missingClauses) {
    await prisma.missingClause.create({
      data: { runId: run.id, type: m.type, importance: m.importance, rationale: JSON.stringify(m.rationale), suggestedText: m.suggestedText },
    });
  }
  for (const c of summary.complianceIssues) {
    await prisma.complianceIssue.create({
      data: { runId: run.id, framework: c.framework, severity: c.severity, description: JSON.stringify(c.description), remediation: c.remediation ? JSON.stringify(c.remediation) : null },
    });
  }
  for (const r of summary.recommendations) {
    await prisma.recommendation.create({
      data: { runId: run.id, priority: r.priority, title: JSON.stringify(r.title), description: JSON.stringify(r.description) },
    });
  }

  await recordEvent({
    contractId: contract.id,
    type: "risk_scan_completed",
    source: "ai",
    summary: `اسکن ریسک کامل شد — ریسک کلی ${summary.overallRisk}/100`,
    why: "تحلیل خودکار تمام بندها توسط موتور هوش مصنوعی.",
    versionId: v1.id,
    metadata: { overallRisk: summary.overallRisk, clauses: clauseRows.length },
  });

  // ── Branch + AI rewrite of the termination clause ──
  const branch = await createBranch({
    contractId: contract.id,
    name: "client-redlines",
    baseVersionId: v1.id,
    createdById: lawyer.id,
  });

  const improvedTermination =
    "هر یک از طرفین می‌تواند با اطلاع کتبی سی روزه قرارداد را خاتمه دهد. فسخ به دلیل تخلف، مستلزم اخطار کتبی و مهلت پانزده روزه برای رفع تخلف است.";
  const newContentText = contentText.replace(CLAUSES[3].text, improvedTermination);
  const newContentJson = contentJson.replace(JSON.stringify(CLAUSES[3].text).slice(1, -1), improvedTermination);

  await commitEdit({
    contractId: contract.id,
    parentVersionId: v1.id,
    branchId: branch.id,
    newContentJson,
    newContentText,
    eventType: "ai_rewrote_section",
    source: "ai",
    summary: "بازنویسی بند فسخ برای متقارن‌سازی حق فسخ",
    why: "کاهش ریسک یک‌طرفه بودن بند فسخ از طریق برابرسازی دوره اطلاع‌رسانی.",
    authorId: lawyer.id,
    metadata: { clauseIndex: 3, clauseTitle: CLAUSES[3].title },
  });

  await recordEvent({
    contractId: contract.id,
    type: "user_approved",
    source: "human",
    actorId: lawyer.id,
    summary: "تأیید پیش‌نویس بازنگری‌شده توسط مشاور حقوقی",
    branchId: branch.id,
  });

  // ── Negotiation report (employee perspective) ──
  const negResult = mockNegotiationReport(
    clauseRows.map((c) => ({ index: c.index, text: c.text, title: c.title })),
    assessments,
    "employee",
  );
  const report = await prisma.negotiationReport.create({
    data: {
      contractId: contract.id,
      versionId: v1.id,
      perspective: "employee",
      counterparty: "employer",
      opportunityScore: negResult.opportunityScore,
      riskReductionPotential: negResult.riskReductionPotential,
      model: "mock",
      talkingPointsJson: JSON.stringify(negResult.talkingPoints),
    },
  });
  for (const it of negResult.items) {
    const clause = clauseRows.find((c) => c.index === it.clauseIndex);
    await prisma.negotiationItem.create({
      data: {
        reportId: report.id,
        clauseId: clause?.id ?? null,
        title: JSON.stringify(it.title),
        currentRisk: it.currentRisk,
        projectedRisk: it.projectedRisk,
        oneSided: it.oneSided,
        unfair: it.unfair,
        exploitable: it.exploitable,
        suggestedChange: JSON.stringify(it.suggestedChange),
        strategy: JSON.stringify(it.strategy),
        expectedCounterArgument: JSON.stringify(it.expectedCounterArgument),
        suggestedResponse: JSON.stringify(it.suggestedResponse),
        winProbability: it.winProbability,
        difficulty: it.difficulty,
        businessImpact: it.businessImpact,
        legalImpact: it.legalImpact,
      },
    });
  }
  for (const ch of negResult.checklist) {
    await prisma.checklistItem.create({
      data: { reportId: report.id, label: JSON.stringify(ch.label), priority: ch.priority },
    });
  }

  // ── A second contract owned by the member (so an admin sees >1 owner) ──
  const MEMBER_CLAUSES = [
    { title: "ماده ۱ - موضوع قرارداد", type: "subject", text: "موضوع این قرارداد ارائهٔ خدمات مشاورهٔ نرم‌افزاری توسط مشاور به کارفرما است." },
    { title: "ماده ۲ - حق‌الزحمه", type: "payment", text: "حق‌الزحمه به‌صورت ماهیانه و ظرف پانزده روز از تاریخ صورت‌حساب پرداخت می‌شود." },
    { title: "ماده ۳ - محرمانگی", type: "privacy", text: "طرفین متعهد به حفظ اطلاعات محرمانهٔ یکدیگر به‌صورت دوطرفه و تا سه سال پس از خاتمه قرارداد هستند." },
  ];
  const memberBuild = buildContent(MEMBER_CLAUSES);
  const memberContract = await prisma.contract.create({
    data: {
      orgId: org.id,
      ownerId: lawyer.id,
      title: "قرارداد خدمات مشاوره نرم‌افزاری",
      type: "service",
      jurisdiction: "Iran",
      language: "fa",
      status: "draft",
    },
  });
  const mv1 = await createVersion({
    contractId: memberContract.id,
    contentJson: memberBuild.contentJson,
    contentText: memberBuild.contentText,
    source: "human",
    authorId: lawyer.id,
    message: "پیش‌نویس اولیه قرارداد",
  });
  for (const b of memberBuild.blocks) {
    await prisma.clause.create({
      data: { versionId: mv1.id, index: b.index, title: b.title, type: b.type, text: b.text, startOffset: b.startOffset, endOffset: b.endOffset },
    });
  }
  await recordEvent({
    contractId: memberContract.id,
    type: "created",
    source: "human",
    actorId: lawyer.id,
    summary: "قرارداد ایجاد شد",
    why: "بارگذاری پیش‌نویس اولیه.",
    versionId: mv1.id,
  });

  // ── Seed per-user AI usage so the admin cost view is populated on first load ──
  // (Represents prior live-model usage; mock-mode runs would log $0.)
  const usageSeed: { user: typeof owner; contractId: string; rows: [string, string, number, number][] }[] = [
    {
      user: owner,
      contractId: contract.id,
      rows: [
        // task, model, promptTokens, completionTokens
        ["risk", "gpt-4o", 1200, 640],
        ["risk", "gpt-4o", 1100, 590],
        ["docSummary", "gpt-4o", 2400, 820],
        ["negotiation", "gpt-4o", 2600, 1500],
        ["assistant", "gpt-4o", 1800, 500],
        ["segment", "gpt-4o-mini", 1600, 300],
      ],
    },
    {
      user: lawyer,
      contractId: memberContract.id,
      rows: [
        ["risk", "gpt-4o", 800, 420],
        ["assistant", "gpt-4o", 1400, 360],
        ["segment", "gpt-4o-mini", 900, 180],
      ],
    },
  ];
  for (const u of usageSeed) {
    for (const [task, model, pt, ct] of u.rows) {
      await prisma.aiCall.create({
        data: {
          contractId: u.contractId,
          userId: u.user.id,
          task,
          model,
          promptTokens: pt,
          completionTokens: ct,
          costUsd: estimateCost(model, pt, ct),
          latencyMs: 400 + Math.floor(Math.random() * 1200),
          ok: true,
        },
      });
    }
  }

  console.log(`✅ Seeded contract ${contract.id} with ${clauseRows.length} clauses, 1 analysis run, 1 branch, 1 negotiation report.`);
  console.log(`   + member contract ${memberContract.id} (owner: lawyer@peymanet.app) and per-user AI cost rows.`);
  console.log(`   Logins — admin: demo@peymanet.app/demo1234 · member: lawyer@peymanet.app/lawyer1234 · pending: reza@peymanet.app/reza1234`);
  console.log(`   Open: /contracts/${contract.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
