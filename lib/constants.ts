import type {
  RiskCategory,
  Severity,
  Difficulty,
  Impact,
  Perspective,
  ContractType,
  EventType,
} from "@/lib/ai/schemas";

type Label = { fa: string; en: string };

export const RISK_CATEGORY_LABELS: Record<RiskCategory, Label> = {
  legal: { fa: "حقوقی", en: "Legal" },
  financial: { fa: "مالی", en: "Financial" },
  compliance: { fa: "انطباق", en: "Compliance" },
  liability: { fa: "مسئولیت", en: "Liability" },
  termination: { fa: "فسخ", en: "Termination" },
  privacy: { fa: "حریم خصوصی", en: "Privacy" },
  security: { fa: "امنیت", en: "Security" },
  payment: { fa: "پرداخت", en: "Payment" },
  ip: { fa: "مالکیت فکری", en: "Intellectual Property" },
  jurisdiction: { fa: "صلاحیت قضایی", en: "Jurisdiction" },
};

export const SEVERITY_LABELS: Record<Severity, Label> = {
  safe: { fa: "امن", en: "Safe" },
  medium: { fa: "متوسط", en: "Medium" },
  high: { fa: "بالا", en: "High" },
  critical: { fa: "بحرانی", en: "Critical" },
};

export const DIFFICULTY_LABELS: Record<Difficulty, Label> = {
  easy: { fa: "آسان", en: "Easy" },
  moderate: { fa: "متوسط", en: "Moderate" },
  hard: { fa: "دشوار", en: "Hard" },
};

export const IMPACT_LABELS: Record<Impact, Label> = {
  low: { fa: "کم", en: "Low" },
  medium: { fa: "متوسط", en: "Medium" },
  high: { fa: "زیاد", en: "High" },
};

export const PERSPECTIVE_LABELS: Record<Perspective, Label> = {
  employee: { fa: "کارمند", en: "Employee" },
  employer: { fa: "کارفرما", en: "Employer" },
  buyer: { fa: "خریدار", en: "Buyer" },
  seller: { fa: "فروشنده", en: "Seller" },
  contractor: { fa: "پیمانکار", en: "Contractor" },
  client: { fa: "کارفرما/مشتری", en: "Client" },
  landlord: { fa: "موجر", en: "Landlord" },
  tenant: { fa: "مستأجر", en: "Tenant" },
};

/** Default counterpart for a given perspective, per contract type. */
export const PERSPECTIVE_PAIRS: Partial<Record<ContractType, [Perspective, Perspective]>> = {
  employment: ["employee", "employer"],
  sale: ["buyer", "seller"],
  service: ["client", "contractor"],
  lease: ["tenant", "landlord"],
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, Label> = {
  employment: { fa: "قرارداد کار", en: "Employment" },
  sale: { fa: "بیع / فروش", en: "Sale" },
  service: { fa: "خدمات", en: "Service" },
  nda: { fa: "عدم افشا (NDA)", en: "NDA" },
  lease: { fa: "اجاره", en: "Lease" },
  loan: { fa: "وام / قرض", en: "Loan" },
  partnership: { fa: "مشارکت", en: "Partnership" },
  other: { fa: "سایر", en: "Other" },
};

export const EVENT_TYPE_LABELS: Record<EventType, Label> = {
  created: { fa: "ایجاد قرارداد", en: "Contract created" },
  ai_added_clause: { fa: "افزودن بند توسط AI", en: "AI added clause" },
  user_deleted_text: { fa: "حذف متن توسط کاربر", en: "User deleted text" },
  user_edited: { fa: "ویرایش توسط کاربر", en: "User edited document" },
  ai_rewrote_section: { fa: "بازنویسی بخش توسط AI", en: "AI rewrote section" },
  ai_suggestion_rejected: { fa: "رد پیشنهاد AI", en: "AI suggestion rejected" },
  user_approved: { fa: "تأیید کاربر", en: "User approved changes" },
  contract_signed: { fa: "امضای قرارداد", en: "Contract signed" },
  risk_scan_completed: { fa: "اتمام اسکن ریسک", en: "Risk scan completed" },
  branch_created: { fa: "ایجاد شاخه", en: "Branch created" },
  merged: { fa: "ادغام شاخه", en: "Branch merged" },
  restored: { fa: "بازگردانی نسخه", en: "Version restored" },
  negotiation_accepted: { fa: "پذیرش پیشنهاد مذاکره", en: "Negotiation accepted" },
  fix_applied: { fa: "اعمال اصلاح", en: "Fix applied" },
};

/** Persistent disclaimer shown across the product. */
export const DISCLAIMER: Label = {
  fa: "این تحلیل راهنمایی مبتنی بر هوش مصنوعی است و مشاوره‌ی حقوقی محسوب نمی‌شود.",
  en: "This is AI-generated guidance and does not constitute legal advice.",
};

export type { Label };
