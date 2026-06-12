import { hashString, seededRandom, clamp } from "@/lib/utils";
import { scoreToSeverity } from "@/lib/risk/colors";
import type {
  RiskAssessmentResult,
  DocSummaryResult,
  NegotiationReportResult,
  NegotiationItemResult,
  RiskCategory,
  SegmentationResult,
  Perspective,
  Bilingual,
  AssistantResponse,
  PolicyComplianceResult,
  PolicyStatus,
} from "@/lib/ai/schemas";

/**
 * Deterministic mock AI engine.
 * Produces schema-valid, *contextual*, bilingual results derived from the clause
 * text — so the whole product is demoable with no API key, and tests are stable.
 * Keyword detection (fa + en) drives realistic legal categories and language.
 */

type Template = {
  category: RiskCategory;
  weight: number; // baseline risk contribution 0-100
  match: RegExp;
  explanation: Bilingual;
  reasoning: Bilingual;
  fix: Bilingual;
  alternative: string;
};

const TEMPLATES: Template[] = [
  {
    category: "termination",
    weight: 78,
    match: /فسخ|خاتمه|اخراج|terminat|notice period|at[-\s]?will/i,
    explanation: {
      fa: "این بند فسخ به‌صورت یک‌طرفه به نفع طرف قوی‌تر تنظیم شده و دوره‌ی اطلاع‌رسانی کوتاه یا نامتقارن است.",
      en: "The termination clause is one-sided in favor of the stronger party, with a short or asymmetric notice period.",
    },
    reasoning: {
      fa: "نبود تقارن در حق فسخ و کوتاه بودن notice period، طرف ضعیف‌تر را در معرض خاتمه‌ی ناگهانی بدون جبران قرار می‌دهد.",
      en: "The asymmetric right to terminate and the short notice period expose the weaker party to abrupt termination without remedy.",
    },
    fix: {
      fa: "دوره‌ی اطلاع‌رسانی متقابل حداقل ۳۰ روز و الزام به ذکر دلیل موجه برای فسخ اضافه شود.",
      en: "Add a mutual minimum 30-day notice period and require just cause for termination.",
    },
    alternative:
      "هر یک از طرفین می‌تواند با اطلاع کتبی سی (۳۰) روزهٔ قبلی، این قرارداد را خاتمه دهد. فسخ به دلیل تخلف، مستلزم اعلام کتبیِ علت و اعطای مهلت پانزده (۱۵) روزه برای رفع تخلف است.",
  },
  {
    category: "liability",
    weight: 82,
    match: /مسئولیت|خسارت|غرامت|indemnif|liabilit|hold harmless|damages/i,
    explanation: {
      fa: "سقف مسئولیت و غرامت نامتوازن است و یک طرف بار جبران خسارت نامحدود را می‌پذیرد.",
      en: "The liability and indemnification allocation is unbalanced; one party assumes uncapped damages exposure.",
    },
    reasoning: {
      fa: "نبود سقف مسئولیت (liability cap) و شمول خسارات تبعی، ریسک مالی نامحدودی ایجاد می‌کند.",
      en: "The absence of a liability cap and inclusion of consequential damages creates unbounded financial risk.",
    },
    fix: {
      fa: "سقف مسئولیت معادل مبلغ قرارداد تعیین و خسارات تبعی صراحتاً مستثنا شود.",
      en: "Cap aggregate liability at the contract value and expressly exclude consequential damages.",
    },
    alternative:
      "در هیچ حالتی مسئولیت تجمعیِ هیچ‌یک از طرفین از مجموع مبالغ پرداخت‌شده به‌موجب این قرارداد فراتر نخواهد رفت؛ و هیچ‌یک از طرفین مسئول خسارات غیرمستقیم، اتفاقی یا تبعی نخواهد بود.",
  },
  {
    category: "payment",
    weight: 64,
    match: /پرداخت|حقوق|دستمزد|مبلغ|payment|salary|invoice|fee|compensation/i,
    explanation: {
      fa: "شرایط پرداخت مبهم است یا جریمه‌ی تأخیر/سررسید مشخصی ندارد.",
      en: "Payment terms are vague or lack defined due dates and late-payment remedies.",
    },
    reasoning: {
      fa: "نبود سررسید روشن و سازوکار جریمه‌ی تأخیر، وصول مطالبات را دشوار می‌کند.",
      en: "Without clear due dates and late-payment mechanics, collection becomes difficult to enforce.",
    },
    fix: {
      fa: "سررسید مشخص (مثلاً Net-15)، روش پرداخت و جریمه‌ی تأخیر روزشمار اضافه شود.",
      en: "Specify due dates (e.g., Net-15), payment method, and a daily late-payment penalty.",
    },
    alternative:
      "پرداخت باید ظرف پانزده (۱۵) روز از تاریخ صورت‌حساب انجام شود. مبالغ معوق تا تسویهٔ کامل، مشمول جریمهٔ تأخیر روزشمار طبق توافق طرفین خواهد بود.",
  },
  {
    category: "ip",
    weight: 70,
    match: /مالکیت فکری|مالکیت معنوی|اختراع|کپی‌رایت|intellectual property|\bip\b|copyright|invention|work product/i,
    explanation: {
      fa: "واگذاری مالکیت فکری بیش از حد گسترده است و آثار خارج از محدوده‌ی قرارداد را نیز در بر می‌گیرد.",
      en: "The IP assignment is overly broad and sweeps in work created outside the scope of the engagement.",
    },
    reasoning: {
      fa: "عبارات کلی مانند «کلیه‌ی آثار» بدون قید زمان و موضوع، حقوق پدیدآورنده را به‌طور نامتناسب محدود می‌کند.",
      en: "Catch-all language like 'all works' without temporal or subject-matter limits disproportionately restricts the creator's rights.",
    },
    fix: {
      fa: "دامنه‌ی واگذاری به آثار مرتبط با موضوع قرارداد و در زمان اجرای آن محدود شود.",
      en: "Limit the assignment to deliverables related to the engagement scope and created during its term.",
    },
    alternative:
      "واگذاری مالکیت فکری محدود به آثاری است که به‌طور خاص برای موضوع همین قرارداد و در زمان اجرای آن پدید آمده‌اند؛ آثار قبلی و نامرتبط در مالکیت پدیدآورندهٔ آن‌ها باقی می‌ماند.",
  },
  {
    category: "privacy",
    weight: 68,
    match: /حریم خصوصی|داده|اطلاعات شخصی|privacy|personal data|gdpr|data protection/i,
    explanation: {
      fa: "نحوه‌ی پردازش و نگهداری داده‌های شخصی و مدت نگهداری به‌روشنی تعیین نشده است.",
      en: "Processing, retention, and storage of personal data are not clearly defined.",
    },
    reasoning: {
      fa: "نبود محدودیت هدف و مدت نگهداری، ریسک عدم انطباق با مقررات حفاظت از داده را افزایش می‌دهد.",
      en: "Lack of purpose limitation and a retention period increases the risk of non-compliance with data-protection rules.",
    },
    fix: {
      fa: "محدودیت هدف، مدت نگهداری و حق حذف داده برای صاحب داده افزوده شود.",
      en: "Add purpose limitation, a defined retention period, and a data-subject deletion right.",
    },
    alternative:
      "داده‌های شخصی صرفاً برای اهداف مصرح در این قرارداد پردازش می‌شوند، بیش از مدت لازم نگهداری نمی‌شوند و با درخواست کتبیِ صاحب داده حذف خواهند شد.",
  },
  {
    category: "privacy",
    weight: 55,
    match: /محرمانه|عدم افشا|confidential|non[-\s]?disclosure|nda/i,
    explanation: {
      fa: "تعهد محرمانگی نامتقارن یا بدون محدودیت زمانی است.",
      en: "The confidentiality obligation is asymmetric or has no time limit.",
    },
    reasoning: {
      fa: "محرمانگی دائمی و یک‌طرفه، تعهد نامتناسبی بر یک طرف تحمیل می‌کند.",
      en: "Perpetual, one-way confidentiality imposes a disproportionate burden on one party.",
    },
    fix: {
      fa: "تعهد محرمانگی دوطرفه و با مدت معین (مثلاً ۳ سال) تنظیم شود.",
      en: "Make confidentiality mutual with a defined term (e.g., 3 years).",
    },
    alternative:
      "تعهدات محرمانگی موضوع این بند، دوطرفه است و تا سه (۳) سال پس از خاتمهٔ قرارداد به قوت خود باقی می‌ماند.",
  },
  {
    category: "jurisdiction",
    weight: 58,
    match: /صلاحیت|دادگاه|قانون حاکم|محل رسیدگی|jurisdiction|governing law|venue|arbitration/i,
    explanation: {
      fa: "قانون حاکم یا محل رسیدگی به نفع یک طرف انتخاب شده و دسترسی طرف دیگر به عدالت را دشوار می‌کند.",
      en: "Governing law or venue is chosen to favor one party, hindering the other's access to justice.",
    },
    reasoning: {
      fa: "انتخاب محل رسیدگی دور یا پرهزینه، عملاً حق دادخواهی طرف ضعیف‌تر را محدود می‌کند.",
      en: "A distant or costly venue effectively limits the weaker party's right to seek redress.",
    },
    fix: {
      fa: "محل رسیدگی بی‌طرف یا داوری با هزینه‌ی مشترک پیش‌بینی شود.",
      en: "Provide for a neutral venue or arbitration with shared costs.",
    },
    alternative:
      "اختلافات از طریق داوریِ الزام‌آور در یک مرجع بی‌طرفِ موردتوافق طرفین حل‌وفصل می‌شود و هزینه‌ها به‌طور مساوی میان طرفین تقسیم می‌گردد.",
  },
  {
    category: "compliance",
    weight: 60,
    match: /انطباق|مقررات|قانون کار|compliance|regulation|statute|labor law/i,
    explanation: {
      fa: "این بند ممکن است با مقررات آمره‌ی محلی مغایرت داشته باشد.",
      en: "This clause may conflict with mandatory local regulations.",
    },
    reasoning: {
      fa: "شرط خلاف قواعد آمره، در عمل غیرقابل اجرا و منشأ اختلاف است.",
      en: "A term contrary to mandatory rules is unenforceable in practice and a source of dispute.",
    },
    fix: {
      fa: "بند با ارجاع به حداقل‌های قانونی محلی هماهنگ شود.",
      en: "Align the clause with local statutory minimums.",
    },
    alternative:
      "علی‌رغم مفاد فوق، این بند در هیچ حالتی نمی‌تواند از حداقل‌های حمایتیِ آمرهٔ قوانین جمهوری اسلامی ایران که شامل طرفین می‌شود، عدول کند.",
  },
];

const DEFAULT_TEMPLATE: Template = {
  category: "legal",
  weight: 34,
  match: /.*/,
  explanation: {
    fa: "این بند استاندارد به‌نظر می‌رسد اما ابهاماتی دارد که می‌تواند منشأ تفسیر شود.",
    en: "This clause appears standard but contains ambiguities that could lead to interpretation disputes.",
  },
  reasoning: {
    fa: "عبارات کلی و نبود تعریف دقیق اصطلاحات، فضای تفسیر متفاوت ایجاد می‌کند.",
    en: "General wording and undefined terms create room for divergent interpretation.",
  },
  fix: {
    fa: "اصطلاحات کلیدی تعریف و عبارات مبهم شفاف شوند.",
    en: "Define key terms and clarify ambiguous wording.",
  },
  alternative:
    "برای رفع ابهام، اصطلاحات کلیدیِ به‌کاررفته در این بند، مطابق معانیِ تعریف‌شده در بخش «تعاریف» تفسیر می‌شوند.",
};

function pickTemplate(text: string): Template {
  return TEMPLATES.find((t) => t.match.test(text)) ?? DEFAULT_TEMPLATE;
}

export function mockRiskAssessment(text: string, title?: string | null): RiskAssessmentResult {
  const tpl = pickTemplate(`${title ?? ""} ${text}`);
  const rng = seededRandom(text + (title ?? ""));
  const jitter = Math.floor((rng() - 0.5) * 24);
  const score = clamp(tpl.weight + jitter);
  const severity = scoreToSeverity(score);
  const confidence = Number((0.72 + rng() * 0.26).toFixed(2));
  // Secondary category occasionally added for realism.
  const categories: RiskCategory[] = [tpl.category];
  if (rng() > 0.6 && tpl.category !== "legal") categories.push("legal");

  // Extract a short citation phrase from the clause text.
  const words = text.split(/\s+/).filter(Boolean);
  const start = Math.floor(rng() * Math.max(1, words.length - 6));
  const citation = words.slice(start, start + 6).join(" ") || null;

  return {
    riskScore: score,
    severity,
    confidence,
    categories,
    citation,
    explanation: tpl.explanation,
    reasoning: tpl.reasoning,
    suggestedFix: tpl.fix,
    alternativeClause: tpl.alternative,
  };
}

export function mockSegmentation(text: string): SegmentationResult {
  // Split on numbered headings or blank lines.
  const blocks = text
    .split(/\n(?=\s*(?:ماده|بند|Article|Section|Clause|\d+[.)])\s)/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const source = blocks.length > 1 ? blocks : text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return {
    clauses: source.map((t, i) => {
      const firstLine = t.split("\n")[0].slice(0, 60);
      return { index: i, title: firstLine, type: pickTemplate(t).category, text: t };
    }),
  };
}

export function mockDocSummary(
  clauses: { text: string; title?: string | null }[],
  assessments: RiskAssessmentResult[],
): DocSummaryResult {
  const overall = assessments.length
    ? Math.round(
        assessments.reduce((s, a) => s + a.riskScore * (0.5 + a.confidence / 2), 0) /
          assessments.reduce((s, a) => s + (0.5 + a.confidence / 2), 0),
      )
    : 0;

  return {
    overallRisk: overall,
    headline: {
      fa: overall >= 60 ? "این قرارداد ریسک بالایی دارد و نیازمند بازنگری جدی است." : "این قرارداد ریسک متوسطی دارد؛ چند بند نیازمند اصلاح است.",
      en: overall >= 60 ? "This contract carries high risk and needs serious revision." : "This contract carries moderate risk; a few clauses need revision.",
    },
    missingClauses: [
      {
        type: "force_majeure",
        importance: "high",
        rationale: { fa: "بند فورس ماژور برای پوشش رویدادهای خارج از کنترل وجود ندارد.", en: "بند فورس ماژور برای پوشش رویدادهای خارج از کنترل وجود ندارد." },
        suggestedText: "هیچ‌یک از طرفین در قبال قصور در انجام تعهد به‌دلیل رویدادهای خارج از کنترل متعارف خود، مسئول نخواهد بود.",
      },
      {
        type: "dispute_resolution",
        importance: "medium",
        rationale: { fa: "سازوکار حل اختلاف پیش از مراجعه به دادگاه مشخص نشده است.", en: "سازوکار حل اختلاف پیش از مراجعه به دادگاه مشخص نشده است." },
        suggestedText: "طرفین ابتدا تلاش می‌کنند اختلافات را از طریق مذاکرهٔ با حسن نیت و سپس میانجی‌گری حل کنند.",
      },
    ],
    complianceIssues: [
      {
        framework: "قانون کار ایران",
        severity: "high",
        description: { fa: "برخی شروط ممکن است با حداقل‌های آمرهٔ قانون کار جمهوری اسلامی ایران مغایرت داشته باشند.", en: "برخی شروط ممکن است با حداقل‌های آمرهٔ قانون کار جمهوری اسلامی ایران مغایرت داشته باشند." },
        remediation: { fa: "شروط با حداقل‌های قانونیِ قانون کار ایران هماهنگ شوند.", en: "شروط با حداقل‌های قانونیِ قانون کار ایران هماهنگ شوند." },
      },
    ],
    recommendations: [
      {
        priority: "high",
        title: { fa: "افزودن سقف مسئولیت", en: "Add a liability cap" },
        description: { fa: "برای محدودکردن ریسک مالی، سقف مسئولیت تعریف شود.", en: "Define a liability cap to bound financial exposure." },
      },
      {
        priority: "medium",
        title: { fa: "متقارن‌سازی حق فسخ", en: "Make termination symmetric" },
        description: { fa: "دوره‌ی اطلاع‌رسانی متقابل و دلیل موجه اضافه شود.", en: "Add mutual notice period and just-cause requirement." },
      },
    ],
  };
}

export function mockNegotiationReport(
  clauses: { index: number; text: string; title?: string | null }[],
  assessments: RiskAssessmentResult[],
  perspective: Perspective,
): NegotiationReportResult {
  const items: NegotiationItemResult[] = clauses
    .map((c, i) => ({ c, a: assessments[i] }))
    .filter(({ a }) => a && a.riskScore >= 45)
    .map(({ c, a }) => {
      const rng = seededRandom(c.text + perspective);
      const projected = clamp(a.riskScore - (25 + Math.floor(rng() * 30)));
      const win = Number((0.45 + rng() * 0.5).toFixed(2));
      const diff = win > 0.7 ? "easy" : win > 0.55 ? "moderate" : "hard";
      const tpl = pickTemplate(c.text);
      return {
        clauseIndex: c.index,
        title: { fa: c.title || `بند ${c.index + 1}`, en: c.title || `Clause ${c.index + 1}` },
        currentRisk: a.riskScore,
        projectedRisk: projected,
        oneSided: a.riskScore >= 65,
        unfair: a.riskScore >= 70,
        exploitable: a.riskScore >= 75,
        suggestedChange: tpl.fix,
        strategy: {
          fa: `با تکیه بر عرف بازار، پیشنهاد اصلاح را به‌عنوان «استانداردسازی» مطرح کنید نه امتیازخواهی؛ از منظر ${perspective} ریسک فعلی غیرقابل‌قبول است.`,
          en: `Frame the change as 'standardization' against market norms rather than a concession; from the ${perspective}'s view the current risk is unacceptable.`,
        },
        expectedCounterArgument: {
          fa: "طرف مقابل احتمالاً ادعا می‌کند این بند «استاندارد شرکت» است و قابل تغییر نیست.",
          en: "The counterparty will likely claim this is 'standard company language' and non-negotiable.",
        },
        suggestedResponse: {
          fa: "پاسخ دهید که استاندارد بازار تقارن را می‌طلبد و نمونه‌های مشابه را ارائه دهید؛ در صورت مقاومت، سقف یا دوره‌ی محدود را به‌عنوان میانه پیشنهاد کنید.",
          en: "Reply that market standard requires symmetry and cite comparable examples; if resisted, offer a cap or limited term as a middle ground.",
        },
        winProbability: win,
        difficulty: diff,
        businessImpact: a.riskScore >= 70 ? "high" : "medium",
        legalImpact: a.riskScore >= 65 ? "high" : "medium",
      };
    });

  const reduction = items.reduce((s, it) => s + (it.currentRisk - it.projectedRisk), 0);
  const opportunity = clamp(Math.round(40 + items.length * 8 + reduction / clauses.length));

  return {
    opportunityScore: opportunity,
    riskReductionPotential: clamp(Math.round(reduction / Math.max(1, clauses.length)) * 2),
    talkingPoints: [
      { fa: "تمرکز بر تقارن حقوق و تعهدات دو طرف.", en: "Anchor on symmetry of rights and obligations." },
      { fa: "استناد به عرف بازار و نمونه‌های مشابه.", en: "Cite market norms and comparable deals." },
      { fa: "اولویت‌بندی بندهای بحرانی پیش از بندهای کم‌اهمیت.", en: "Prioritize critical clauses before minor ones." },
    ],
    checklist: items.slice(0, 6).map((it, i) => ({
      label: { fa: `مذاکره درباره: ${it.title.fa}`, en: `Negotiate: ${it.title.en}` },
      priority: it.businessImpact === "high" ? 0 : i + 1,
    })),
    items,
  };
}

/** Deterministic document-aware assistant reply (Q&A / edit / insert / review). */
export function mockAssistant(document: string, message: string): AssistantResponse {
  const lines = document.split("\n");
  const findLine = (re: RegExp) => lines.find((l) => re.test(l)) ?? null;
  const base: AssistantResponse = {
    kind: "answer",
    message: { fa: "", en: "" },
    highlight: null,
    summary: null,
    edit: null,
    insert: null,
    findings: null,
  };

  // REVIEW
  if (/review|بررسی|ریسک|\brisk\b/i.test(message)) {
    const findings: NonNullable<AssistantResponse["findings"]> = [];
    const term = findLine(/فسخ|terminat/i);
    if (term)
      findings.push({
        clause: term.trim(),
        risk: { fa: "حق فسخ یک‌طرفه به نفع کارفرما.", en: "One-sided termination right favoring the employer." },
        remediation: { fa: "دوره‌ی اطلاع متقابل ۳۰ روزه اضافه شود.", en: "Add a mutual 30-day notice period." },
      });
    const liab = findLine(/مسئولیت|liabilit|خسارت/i);
    if (liab)
      findings.push({
        clause: liab.trim(),
        risk: { fa: "مسئولیت بدون سقف.", en: "Uncapped liability." },
        remediation: { fa: "سقف معادل مبلغ قرارداد تعیین شود.", en: "Cap liability at the contract value." },
      });
    return {
      ...base,
      kind: "review",
      message: { fa: `بررسی انجام شد؛ ${findings.length || "۰"} ریسک کلیدی شناسایی شد.`, en: `Review complete; identified ${findings.length} key risks.` },
      findings: findings.length
        ? findings
        : [{ clause: "—", risk: { fa: "ریسک قابل‌توجهی یافت نشد.", en: "No material risk found." }, remediation: { fa: "—", en: "—" } }],
    };
  }

  // EDIT
  if (/mutual|متقابل|دوطرفه|متوازن|make.*termination|termination.*mutual|فسخ/i.test(message) && /mutual|متقابل|دوطرفه|متوازن|change|make|تغییر|کن|اصلاح|fix/i.test(message)) {
    const term = findLine(/فسخ|terminat/i);
    if (term) {
      const replacement =
        "ماده ۴ - فسخ قرارداد\nهر یک از طرفین می‌تواند با اطلاع کتبی سی روزه قرارداد را خاتمه دهد. فسخ به دلیل تخلف، مستلزم اخطار کتبی و مهلت پانزده روزه برای رفع تخلف است.";
      const findText = term.trim().startsWith("ماده ۴") ? `${term.trim()}\n${lines[lines.indexOf(term) + 1] ?? ""}`.trim() : term.trim();
      return {
        ...base,
        kind: "edit",
        message: { fa: "بند فسخ را متقارن می‌کنم (اطلاع ۳۰ روزه‌ی دوطرفه). diff را بررسی و تأیید کنید.", en: "I'll make the termination clause mutual (30-day notice both ways). Review the diff and approve." },
        summary: { fa: "متقارن‌سازی بند فسخ", en: "Make termination mutual" },
        edit: { find: findText, replacement },
      };
    }
  }

  // INSERT
  if (/add|insert|اضافه|درج|بنویس|limitation of liability|سقف مسئولیت|محدودیت مسئولیت|force majeure|فورس ماژور/i.test(message)) {
    const clause =
      "\n\nماده جدید - محدودیت مسئولیت\nمسئولیت کل هر یک از طرفین تحت این قرارداد از مجموع مبالغ پرداخت‌شده فراتر نخواهد رفت و هیچ‌یک از طرفین مسئول خسارات غیرمستقیم یا تبعی نخواهد بود.";
    return {
      ...base,
      kind: "insert",
      message: { fa: "یک بند «محدودیت مسئولیت» پیش‌نویس کردم تا در انتهای سند درج شود. تأیید می‌کنید؟", en: "I drafted a 'Limitation of Liability' clause to insert at the end. Approve?" },
      summary: { fa: "درج بند محدودیت مسئولیت", en: "Insert limitation of liability" },
      insert: { afterHeading: null, clause },
    };
  }

  // Q&A
  const qMatch = message.match(/non[-\s]?solicitation|عدم جذب|محرمانه|confidential|فسخ|terminat|پرداخت|payment|مسئولیت|liabilit|مالکیت فکری|\bip\b/i);
  const hit = qMatch ? findLine(new RegExp(qMatch[0], "i")) : null;
  return {
    ...base,
    kind: "answer",
    message: hit
      ? { fa: "بله، بندی مرتبط در سند یافت و برجسته شد.", en: "Yes — I found a related provision in the document and highlighted it." }
      : { fa: "موردی صریح در این باره در سند پیدا نکردم؛ احتمالاً این بند جا افتاده است.", en: "I couldn't find an explicit provision on that; it may be a missing clause." },
    highlight: hit ? hit.trim().slice(0, 50) : null,
  };
}

/**
 * Deterministic org-policy compliance check.
 * Each non-empty line of `policies` is matched against the document by shared
 * keywords; a deterministic seeded jitter occasionally flags a violation so the
 * demo shows all three states.
 */
export function mockPolicyCompliance(document: string, policies: string): PolicyComplianceResult {
  const doc = document.toLowerCase();
  const lines = policies
    .split("\n")
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 2);

  const findings = lines.map((policy) => {
    const rng = seededRandom(policy + document.length);
    const keywords = policy
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const hits = keywords.filter((w) => doc.includes(w)).length;
    const ratio = keywords.length ? hits / keywords.length : 0;

    let status: PolicyStatus;
    if (ratio >= 0.5) status = rng() > 0.7 ? "violation" : "compliant";
    else if (ratio > 0) status = rng() > 0.5 ? "unclear" : "violation";
    else status = "unclear";

    const matchLine =
      keywords.map((w) => document.split("\n").find((l) => l.toLowerCase().includes(w))).find(Boolean) ?? null;

    const detail: Bilingual =
      status === "compliant"
        ? { fa: "قرارداد با این سیاست سازمان منطبق است.", en: "قرارداد با این سیاست سازمان منطبق است." }
        : status === "violation"
          ? { fa: "بندی در قرارداد یافت شد که با این سیاست مغایرت دارد و باید اصلاح شود.", en: "بندی در قرارداد یافت شد که با این سیاست مغایرت دارد و باید اصلاح شود." }
          : { fa: "قرارداد در این مورد ساکت است؛ افزودن بندی صریح توصیه می‌شود.", en: "قرارداد در این مورد ساکت است؛ افزودن بندی صریح توصیه می‌شود." };

    return { policy, status, detail, clause: status === "compliant" || status === "violation" ? matchLine?.trim() ?? null : null };
  });

  const violations = findings.filter((f) => f.status === "violation").length;
  const overall = violations === 0 ? (findings.every((f) => f.status === "compliant") ? "compliant" : "partial") : "violation";

  return {
    overall: overall as PolicyComplianceResult["overall"],
    summary: {
      fa:
        violations > 0
          ? `${toFa(violations)} مغایرت با سیاست‌های سازمان شناسایی شد.`
          : "مغایرت آشکاری با سیاست‌های سازمان یافت نشد.",
      en:
        violations > 0
          ? `${toFa(violations)} مغایرت با سیاست‌های سازمان شناسایی شد.`
          : "مغایرت آشکاری با سیاست‌های سازمان یافت نشد.",
    },
    findings,
  };
}

function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** Deterministic counterparty reply for the war-game chat. */
export function mockWargameReply(history: { role: string; content: string }[], perspective: Perspective): string {
  const last = history[history.length - 1]?.content ?? "";
  const rng = seededRandom(last + history.length);
  const stances = [
    "این بند استاندارد شرکت ماست و در قراردادهای مشابه هم آمده؛ تغییر آن برای ما دشوار است.",
    "می‌توانیم درباره‌ی جزئیات صحبت کنیم، اما حذف کامل این شرط امکان‌پذیر نیست.",
    "اگر بخواهید این تغییر را اعمال کنیم، انتظار داریم در ازای آن امتیازی در بخش پرداخت بدهید.",
    "پیشنهاد شما منطقی است؛ شاید بتوانیم یک نسخه‌ی محدودتر از این تعهد را بپذیریم.",
  ];
  const pick = stances[Math.floor(rng() * stances.length)];
  return `${pick} (${perspective === "employee" ? "از دید کارفرما" : "از دید طرف مقابل"})`;
}
