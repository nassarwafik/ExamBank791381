// Phase 21I — MULTI-SUBJECT EXAM REQUEST ROUTING. The builder's free prompt («ماذا تريد في الامتحان؟») used to have ONE destination:
// the classified question bank, whose topics and sections (BASIC / INFRASTRUCTURE) are the 791381 networking curriculum. A request for a
// programming, physics, chemistry or mathematics exam therefore came back as a networking exam. This module decides, in code, WHERE a
// request is built:
//
//   • "bank"     — the classified bank (791381 networking + the teacher's own questions classified against the same topics): unchanged flow;
//   • "composer" — the AI Full Exam Composer (Phase 20F): a NEW structured exam authored for any subject, opened in the Builder with its form
//                  pre-filled from the request. Nothing is generated before the teacher presses «توليد» there, and nothing is saved,
//                  published or assigned before the teacher does it.
//
// The AI's classification is UNTRUSTED input: it is re-checked against a deterministic multilingual keyword detector, every value is
// bounded and enum-checked here, a disagreement is surfaced to the teacher (`needsConfirmation`) and the teacher can always switch route.
// The bank route is offered only where the bank can actually serve the request (it never builds a networking exam for a physics request).
// Pure and dependency-light (a leaf: only the composer's numeric limits) so the App's initial bundle stays small; compiled to CommonJS for
// the API by scripts/build-shared-finalization.mjs (drift-guarded), so the server and the browser route with byte-identical rules.
import { COMPOSER_LIMITS } from "./aiComposer/composerLimits";

export const EXAM_ROUTING_VERSION = "EXAM_ROUTING_V1";
export const EXAM_SUBJECT_DOMAINS = Object.freeze(["networking", "programming", "physics", "chemistry", "mathematics", "mixed", "other"] as const);
export type ExamSubjectDomain = (typeof EXAM_SUBJECT_DOMAINS)[number];
export const EXAM_SOURCE_PREFERENCES = Object.freeze(["bank", "newQuestions", "unspecified"] as const);
export type ExamSourcePreference = (typeof EXAM_SOURCE_PREFERENCES)[number];
export const EXAM_ROUTES = Object.freeze(["bank", "composer"] as const);
export type ExamRoute = (typeof EXAM_ROUTES)[number];
export const EXAM_REQUEST_LANGUAGES = Object.freeze(["ar", "en", "he"] as const);
export type ExamRequestLanguage = (typeof EXAM_REQUEST_LANGUAGES)[number];
export type DetectionConfidence = "high" | "low" | "none";

/** The ONE subject the classified question bank covers. Every other subject is authored by the composer. */
export const BANK_SUBJECT_DOMAIN: ExamSubjectDomain = "networking";

export const EXAM_SUBJECT_LABELS: Readonly<Record<ExamSubjectDomain, string>> = Object.freeze({
  networking: "شبكات الاتصال",
  programming: "البرمجة",
  physics: "الفيزياء",
  chemistry: "الكيمياء",
  mathematics: "الرياضيات",
  mixed: "مواضيع متعددة",
  other: "موضوع آخر"
});

// ── deterministic multilingual lexicon (Arabic / English / Hebrew). Each entry counts once per request (distinct evidence). Latin terms
//    match on token boundaries; Arabic / Hebrew terms match as substrings of the normalized text (so prefixes like ال / و / ب / ה / ו still
//    match). Ambiguous everyday words (speed, function, traffic…) are deliberately left out: the detector is a cross-check, not the judge.
const LEXICON: Readonly<Record<Exclude<ExamSubjectDomain, "mixed" | "other">, readonly string[]>> = Object.freeze({
  networking: [
    "شبكات", "شبكه", "راوتر", "سويتش", "مبدل", "عنونه", "بروتوكول", "طوبولوجيا", "791381", "791367",
    "network", "networking", "router", "switch", "ipv4", "ipv6", "subnet", "subnetting", "cidr", "vlan", "trunk", "ospf", "rip", "eigrp",
    "dhcp", "dns", "osi", "tcp/ip", "tcp", "udp", "mac address", "ethernet", "wifi", "wireless", "packet tracer", "cisco",
    "infrastructure", "nat", "acl", "apipa", "vtp", "port security", "inter-vlan",
    "רשת", "רשתות", "נתב", "מתג", "כתובת ip", "פרוטוקול"
  ],
  programming: [
    "برمجه", "بايثون", "جافا", "سي شارب", "خوارزميه", "خوارزميات", "كود", "شيفره", "مصفوفه", "مصفوفات", "حلقه تكرار", "حلقات التكرار", "متغيرات",
    "كائنيه", "برنامج يطبع", "اكتب برنامج",
    "programming", "python", "java", "c#", "csharp", "javascript", "algorithm", "algorithms", "code", "coding", "loop", "loops",
    "array", "arrays", "recursion", "oop", "variables", "compile", "debug",
    "תכנות", "פייתון", "ג'אווה", "אלגוריתם", "לולאה", "מערך"
  ],
  physics: [
    "فيزياء", "سقوط حر", "مقذوف", "قذيفه", "تسارع", "نيوتن", "قوه الجاذبيه", "جاذبيه", "بندول", "نابض", "زنبرك", "طاقه حركيه", "طاقه وضع",
    "دائره كهربائيه", "تيار كهربائي", "مقاومه كهربائيه", "قانون اوم", "مستوى مائل", "احتكاك", "زخم", "سرعه ابتدائيه",
    "physics", "free fall", "projectile", "acceleration", "newton", "gravity", "pendulum", "spring", "kinetic energy", "potential energy",
    "momentum", "friction", "inclined plane", "ohm", "velocity", "circuit",
    "פיזיקה", "תאוצה", "נפילה חופשית", "מטוטלת", "קפיץ", "תנע", "חיכוך", "מעגל חשמלי"
  ],
  chemistry: [
    "كيمياء", "عنصر كيميائي", "عناصر كيميائيه", "ذره", "ذرات", "جزيء", "جزيئات", "تفاعل كيميائي", "تفاعلات", "معادله كيميائيه", "موازنه المعادلات", "معايره",
    "حمض", "حموض", "مولاريه", "عدد المولات", "محلول", "محاليل", "الكترونات", "توزيع الكتروني", "جدول دوري",
    "رابطه تساهميه", "رابطه ايونيه", "تاكسد",
    "chemistry", "chemical", "atom", "atoms", "molecule", "molecules", "reaction", "reactions", "titration", "acid",
    "acids", "moles", "molarity", "electron configuration", "periodic table", "covalent", "ionic", "oxidation", "ph",
    "כימיה", "אטום", "מולקולה", "תגובה כימית", "חומצה", "טיטרציה", "טבלה מחזורית"
  ],
  mathematics: [
    "رياضيات", "داله", "دوال", "اقتران", "اقترانات", "معادله", "معادلات", "تفاضل", "تكامل", "مشتقه", "مشتقات", "نهايات",
    "الجبر", "احتمالات", "احصاء", "مثلثات", "متتاليات", "خط تقارب", "قيم قصوى", "مصفوفات رياضيه", "لوغاريتم",
    "math", "maths", "mathematics", "function", "functions", "equation", "equations", "derivative", "integral", "calculus", "algebra",
    "geometry", "probability", "statistics", "trigonometry", "asymptote", "logarithm", "polynomial",
    "מתמטיקה", "פונקציה", "משוואה", "נגזרת", "אינטגרל", "גאומטריה", "הסתברות"
  ]
});

const BANK_SOURCE_TERMS = ["من المخزن", "من بنك الاسئله", "من البنك", "من مخزن الاسئله", "اسئله المخزن", "from the bank", "question bank", "from the question bank", "מהמאגר", "ממאגר השאלות"];
const NEW_SOURCE_TERMS = ["اسئله جديده", "الف اسئله", "الف امتحان", "تاليف اسئله", "ولد اسئله", "توليد اسئله", "اسئله غير موجوده في المخزن", "new questions", "generate questions", "write new questions", "author new", "שאלות חדשות", "חבר שאלות"];

/** Lower-case, strip Arabic diacritics / tatweel, unify alef / yaa / taa marbuta forms, collapse whitespace. */
export function normalizeRequestText(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ְ-ׇ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The normalized text with each Arabic word's article / proclitic removed (الشبكات، والشبكات، بالشبكات، للشبكات → شبكات), so a
 *  multi-word term such as «سقوط حر» also matches «السقوط الحر». Only a prefix followed by «ال» is removed (never a word's own letter). */
export function stripArabicArticles(normalized: string): string {
  return normalized.split(" ").map(w => w.replace(/^(?:[وف]?(?:[بك]?ال|لل))(?=[\u0621-\u064A]{2})/, "")).join(" ");
}

const LATIN = /^[\x20-\x7e]+$/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type TermMatcher = (t: string, stemmed: string) => boolean;
const TERM_MATCHERS = new Map<string, TermMatcher>();
function termMatcher(rawTerm: string): TermMatcher {
  const cached = TERM_MATCHERS.get(rawTerm);
  if (cached) return cached;
  const term = normalizeRequestText(rawTerm);
  let fn: TermMatcher;
  if (LATIN.test(term)) {
    const re = new RegExp("(^|[^a-z0-9#+/])" + escapeRe(term) + "($|[^a-z0-9#+/])");
    fn = t => re.test(t);
  } else {
    const stem = stripArabicArticles(term);
    fn = (t, stemmed) => t.includes(term) || stemmed.includes(stem);
  }
  TERM_MATCHERS.set(rawTerm, fn);
  return fn;
}

export type SubjectDetection = {
  domain: ExamSubjectDomain;
  confidence: DetectionConfidence;
  scores: Record<Exclude<ExamSubjectDomain, "mixed" | "other">, number>;
  evidence: string[];
};

/** Deterministic subject detection: distinct lexicon hits per subject. Two or more subjects with ≥ 2 hits each → "mixed". */
export function detectExamSubject(prompt: unknown): SubjectDetection {
  const text = normalizeRequestText(prompt);
  const stemmed = stripArabicArticles(text);
  const scores = { networking: 0, programming: 0, physics: 0, chemistry: 0, mathematics: 0 };
  const hits: Record<string, string[]> = { networking: [], programming: [], physics: [], chemistry: [], mathematics: [] };
  for (const domain of Object.keys(LEXICON) as (keyof typeof LEXICON)[]) {
    for (const term of LEXICON[domain]) {
      if (termMatcher(term)(text, stemmed)) { scores[domain] += 1; hits[domain].push(term); }
    }
  }
  const ranked = (Object.keys(scores) as (keyof typeof scores)[]).sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0], second = ranked[1];
  if (scores[top] === 0) return { domain: "other", confidence: "none", scores, evidence: [] };
  const strong = ranked.filter(d => scores[d] >= 2);
  if (strong.length >= 2 && scores[second] * 2 >= scores[top]) {
    return { domain: "mixed", confidence: "low", scores, evidence: strong.flatMap(d => hits[d].slice(0, 3)).slice(0, 8) };
  }
  const confidence: DetectionConfidence = scores[top] >= 2 && scores[top] >= 2 * scores[second] ? "high" : "low";
  return { domain: top, confidence, scores, evidence: hits[top].slice(0, 6) };
}

/** The language a request is written in (ar / he by script; en when Latin clearly dominates or no Arabic / Hebrew letter exists). */
export function detectRequestLanguage(prompt: unknown): ExamRequestLanguage {
  const s = String(prompt ?? "");
  const ar = (s.match(/[؀-ۿ]/g) || []).length;
  const he = (s.match(/[֐-׿]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (ar + he === 0) return "en";
  if (latin > 4 * (ar + he)) return "en";
  return ar >= he ? "ar" : "he";
}

/** Whether the request asks for bank questions, newly authored questions, or does not say. */
export function detectSourcePreference(prompt: unknown): ExamSourcePreference {
  const text = normalizeRequestText(prompt);
  const stemmed = stripArabicArticles(text);
  const bank = BANK_SOURCE_TERMS.some(t => termMatcher(t)(text, stemmed));
  const fresh = NEW_SOURCE_TERMS.some(t => termMatcher(t)(text, stemmed));
  if (bank === fresh) return "unspecified";
  return bank ? "bank" : "newQuestions";
}

// ── the AI's subject classification (untrusted; every field optional — a non-strict provider may omit or garble it) ──────────────────
export type AiSubjectClassification = {
  domain: ExamSubjectDomain | null;
  label: string;
  language: ExamRequestLanguage | null;
  sourcePreference: ExamSourcePreference | null;
  questionCountExplicit: boolean;
  durationMinutes: number | null;
  topics: string[];
  course: string;
  grade: string;
};

const isEnumOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const cleanShort = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\p{Cc}<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Bounded, enum-checked view of whatever the model returned as `subject` (never throws; unknown values become null / empty). */
export function normalizeAiSubject(raw: unknown): AiSubjectClassification {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const duration = Number(r.durationMinutes);
  const topics = Array.isArray(r.topics)
    ? [...new Set(r.topics.map(t => cleanShort(t, COMPOSER_LIMITS.topicChars)).filter(Boolean))].slice(0, COMPOSER_LIMITS.topics)
    : [];
  return {
    domain: isEnumOf(r.domain, EXAM_SUBJECT_DOMAINS) ? r.domain : null,
    label: cleanShort(r.label, COMPOSER_LIMITS.shortText),
    language: isEnumOf(r.language, EXAM_REQUEST_LANGUAGES) ? r.language : null,
    sourcePreference: isEnumOf(r.sourcePreference, EXAM_SOURCE_PREFERENCES) ? r.sourcePreference : null,
    questionCountExplicit: r.questionCountExplicit === true,
    durationMinutes: Number.isInteger(duration) && duration >= 1 && duration <= COMPOSER_LIMITS.durationMax ? duration : null,
    topics,
    course: cleanShort(r.course, COMPOSER_LIMITS.shortText),
    grade: cleanShort(r.grade, COMPOSER_LIMITS.shortText)
  };
}

export type ExamRouteDecision = {
  v: 1;
  route: ExamRoute;
  /** Routes the teacher may switch to from the result card (always contains `route`). */
  allowedRoutes: ExamRoute[];
  domain: ExamSubjectDomain;
  domainLabel: string;
  /** What the teacher sees as the subject (the model's label when usable, else the domain label). */
  subjectLabel: string;
  language: ExamRequestLanguage;
  sourcePreference: ExamSourcePreference;
  confidence: "high" | "low";
  /** The AI and the deterministic detector disagree (or neither is sure): the teacher should confirm the route before building. */
  needsConfirmation: boolean;
  /** Short Arabic explanations shown on the route card, in order. */
  reasons: string[];
  evidence: string[];
};

/**
 * Decide where a request is built. Rules (code-owned; the model only proposes):
 *  1. The subject is the model's domain when valid, else the detector's. When the detector is SURE of another subject and found no evidence
 *     at all for the model's domain, the detector wins and the teacher is asked to confirm (the networking-heavy analysis prompt must never
 *     drag a physics request into the networking bank).
 *  2. Only a networking request may use the bank — and only when the teacher did not ask for new questions. Everything else is composed.
 *  3. The bank is offered as an alternative only when it can plausibly serve the request (networking, mixed, or an uncertain subject).
 */
export function resolveExamRoute(input: { ai?: unknown; prompt: unknown }): ExamRouteDecision {
  const ai = normalizeAiSubject(input.ai);
  const det = detectExamSubject(input.prompt);
  const reasons: string[] = [];
  let domain: ExamSubjectDomain;
  let needsConfirmation = false;
  let confidence: "high" | "low";
  const detScore = (d: ExamSubjectDomain) => (d in det.scores ? det.scores[d as keyof SubjectDetection["scores"]] : 0);

  if (ai.domain) {
    domain = ai.domain;
    const contradicted = det.confidence === "high" && det.domain !== ai.domain && (ai.domain === "other" || (ai.domain !== "mixed" && detScore(ai.domain) === 0));
    if (contradicted) {
      domain = det.domain;
      needsConfirmation = true;
      confidence = "low";
      reasons.push("صنّف الذكاء الاصطناعي الطلب «" + EXAM_SUBJECT_LABELS[ai.domain] + "»، لكن كلمات الطلب تدل على «" + EXAM_SUBJECT_LABELS[det.domain] + "»؛ اعتمدنا الثاني — تأكد قبل المتابعة.");
    } else {
      confidence = det.confidence !== "none" && (det.domain === ai.domain || detScore(ai.domain) > 0) ? "high" : "low";
    }
  } else {
    domain = det.confidence === "none" ? "other" : det.domain;
    confidence = det.confidence === "high" ? "high" : "low";
    needsConfirmation = det.confidence !== "high";
    reasons.push("لم يُرجع الذكاء الاصطناعي تصنيفًا صالحًا للموضوع؛ حُدّد الموضوع من كلمات الطلب.");
  }

  const sourcePreference = ai.sourcePreference && ai.sourcePreference !== "unspecified" ? ai.sourcePreference : detectSourcePreference(input.prompt);
  let route: ExamRoute;
  if (domain === BANK_SUBJECT_DOMAIN) {
    if (sourcePreference === "newQuestions") {
      route = "composer";
      reasons.push("طلبت أسئلة جديدة؛ سيؤلفها المؤلف الذكي بدل الاختيار من مخزن الأسئلة.");
    } else {
      route = "bank";
      reasons.push("موضوع الطلب شبكات الاتصال: تُختار الأسئلة من مخزن الأسئلة المصنف (791381 وأسئلتك الخاصة).");
    }
  } else {
    route = "composer";
    reasons.push(domain === "mixed"
      ? "الطلب يجمع أكثر من موضوع؛ سيبنيه المؤلف الذكي كامتحان منظّم واحد."
      : "مخزن الأسئلة المصنف يغطي شبكات الاتصال فقط؛ سيؤلف المؤلف الذكي امتحان «" + EXAM_SUBJECT_LABELS[domain] + "» كامتحان منظّم قابل للتعديل.");
    if (sourcePreference === "bank") reasons.push("طلبت أسئلة من المخزن، لكن المخزن لا يحتوي أسئلة لهذا الموضوع.");
  }
  const bankPlausible = domain === BANK_SUBJECT_DOMAIN || domain === "mixed" || needsConfirmation || (domain === "other" && det.scores.networking > 0);
  const allowedRoutes: ExamRoute[] = bankPlausible ? ["bank", "composer"] : ["composer"];
  if (!allowedRoutes.includes(route)) allowedRoutes.unshift(route);

  return {
    v: 1,
    route,
    allowedRoutes,
    domain,
    domainLabel: EXAM_SUBJECT_LABELS[domain],
    subjectLabel: ai.label && (ai.domain === domain || !ai.domain) ? ai.label : EXAM_SUBJECT_LABELS[domain],
    language: ai.language ?? detectRequestLanguage(input.prompt),
    sourcePreference,
    confidence,
    needsConfirmation,
    reasons,
    evidence: det.evidence
  };
}

// ── composer pre-fill: the request mapped onto the composer's STRUCTURED controls (the dialog shows them; the teacher reviews and edits;
//    the server's normalizeComposerIntent re-validates everything on «توليد»). Capability keys mirror COMPOSER_CAPABILITY_FLAGS (a test
//    pins every key to that list).
export const PREFILL_CAPABILITY_KEYS = Object.freeze(["coding", "smartSim", "parametric", "charts"] as const);
export type PrefillCapabilityKey = (typeof PREFILL_CAPABILITY_KEYS)[number];
export type ComposerDifficulty = "easy" | "medium" | "hard" | "mixed";
export type ComposerPrefill = {
  v: 1;
  subject: string;
  course: string;
  grade: string;
  language: ExamRequestLanguage;
  totalMarks: number;
  durationMinutes: number | null;
  difficulty: ComposerDifficulty;
  questionTarget: number | null;
  requiredTopics: string[];
  capabilities: Partial<Record<PrefillCapabilityKey, boolean>>;
  instruction: string;
  /** Short Arabic notes about adjustments the teacher should know (clamped counts, an over-long request…). */
  notes: string[];
};

/** easy / medium / hard / mixed from a 1–5 difficulty distribution (counts): a clear majority wins, otherwise "mixed". */
export function composerDifficultyFromTargets(targets: unknown): ComposerDifficulty {
  const t = targets && typeof targets === "object" ? (targets as Record<string, unknown>) : {};
  const n = (k: string) => Math.max(0, Number(t[k]) || 0);
  const easy = n("1") + n("2"), medium = n("3"), hard = n("4") + n("5");
  const total = easy + medium + hard;
  if (total <= 0) return "mixed";
  if (easy / total >= 0.6) return "easy";
  if (hard / total >= 0.5) return "hard";
  if (medium / total >= 0.6) return "medium";
  return "mixed";
}

const DOMAIN_CAPABILITIES: Readonly<Record<ExamSubjectDomain, Partial<Record<PrefillCapabilityKey, boolean>>>> = Object.freeze({
  networking: { coding: false, smartSim: true },
  programming: { coding: true, smartSim: false },
  physics: { coding: false, smartSim: true, parametric: true },
  // the composer catalog has no chemistry SmartSim yet: chemistry simulations are added by the teacher in the Builder
  chemistry: { coding: false, smartSim: false, parametric: true },
  mathematics: { coding: false, smartSim: true, parametric: true, charts: true },
  mixed: {},
  other: { coding: false }
});

/** The composer form pre-fill for a request (built on the server from the normalized plan; re-validated by the composer on «توليد»). */
export function buildComposerPrefill(input: {
  decision: ExamRouteDecision;
  ai?: unknown;
  prompt: unknown;
  plan?: { title?: unknown; totalMarks?: unknown; requestedQuestionCount?: unknown; totalQuestions?: unknown; difficultyTargets?: unknown } | null;
}): ComposerPrefill {
  const ai = normalizeAiSubject(input.ai);
  const plan = input.plan || {};
  const notes: string[] = [];
  const marks = Number(plan.totalMarks);
  const totalMarks = Number.isInteger(marks) && marks >= 1 && marks <= COMPOSER_LIMITS.totalMarksMax ? marks : 100;
  let questionTarget: number | null = null;
  if (ai.questionCountExplicit) {
    const requested = Number(plan.requestedQuestionCount) || Number(plan.totalQuestions) || 0;
    if (Number.isInteger(requested) && requested >= 1) {
      questionTarget = Math.min(requested, COMPOSER_LIMITS.items);
      if (requested > COMPOSER_LIMITS.items) notes.push("طلبت " + requested + " سؤالًا؛ الحد الأقصى للمؤلف الذكي " + COMPOSER_LIMITS.items + "، فاعتُمد " + COMPOSER_LIMITS.items + ".");
    }
  }
  const instruction = String(input.prompt ?? "").trim();
  if (instruction.length > COMPOSER_LIMITS.instructionChars) {
    notes.push("وصف الطلب أطول من " + COMPOSER_LIMITS.instructionChars + " حرف (حد المؤلف الذكي)؛ اختصره قبل التوليد.");
  }
  const det = detectExamSubject(input.prompt);
  const capabilities: Partial<Record<PrefillCapabilityKey, boolean>> = { ...DOMAIN_CAPABILITIES[input.decision.domain] };
  // explicit signals in the request itself turn a feature ON (never off): code in a physics exam, a simulation in a chemistry exam…
  if (det.scores.programming > 0) capabilities.coding = true;
  if (/محاكا|simulat|סימולצ/.test(normalizeRequestText(input.prompt))) capabilities.smartSim = true;
  if (input.decision.domain === "chemistry" && capabilities.smartSim) notes.push("لا توجد محاكاة كيمياء ضمن المؤلف الذكي بعد؛ أضف محاكاة الكيمياء من الباني بعد التوليد.");
  return {
    v: 1,
    subject: input.decision.subjectLabel.slice(0, COMPOSER_LIMITS.shortText),
    course: ai.course,
    grade: ai.grade,
    language: input.decision.language,
    totalMarks,
    durationMinutes: ai.durationMinutes,
    difficulty: composerDifficultyFromTargets(plan.difficultyTargets),
    questionTarget,
    requiredTopics: ai.topics,
    capabilities,
    instruction,
    notes
  };
}

/** Strict client-side re-check of a pre-fill received from the server (bounded strings / numbers / enums; anything else → null). */
export function parseComposerPrefill(raw: unknown): ComposerPrefill | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
  const subject = str(r.subject, COMPOSER_LIMITS.shortText).trim();
  const totalMarks = int(r.totalMarks, 1, COMPOSER_LIMITS.totalMarksMax);
  if (!subject || totalMarks === null) return null;
  const caps: Partial<Record<PrefillCapabilityKey, boolean>> = {};
  const rc = r.capabilities && typeof r.capabilities === "object" ? (r.capabilities as Record<string, unknown>) : {};
  for (const k of PREFILL_CAPABILITY_KEYS) if (typeof rc[k] === "boolean") caps[k] = rc[k] as boolean;
  return {
    v: 1,
    subject,
    course: str(r.course, COMPOSER_LIMITS.shortText),
    grade: str(r.grade, COMPOSER_LIMITS.shortText),
    language: isEnumOf(r.language, EXAM_REQUEST_LANGUAGES) ? r.language : "ar",
    totalMarks,
    durationMinutes: int(r.durationMinutes, 1, COMPOSER_LIMITS.durationMax),
    difficulty: isEnumOf(r.difficulty, ["easy", "medium", "hard", "mixed"] as const) ? r.difficulty : "mixed",
    questionTarget: int(r.questionTarget, 1, COMPOSER_LIMITS.items),
    requiredTopics: Array.isArray(r.requiredTopics) ? r.requiredTopics.filter((t): t is string => typeof t === "string" && !!t.trim()).map(t => t.slice(0, COMPOSER_LIMITS.topicChars)).slice(0, COMPOSER_LIMITS.topics) : [],
    capabilities: caps,
    instruction: typeof r.instruction === "string" ? r.instruction : "",
    notes: Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === "string").map(n => n.slice(0, 300)).slice(0, 6) : []
  };
}

/** Strict client-side re-check of a route decision received from the server (null when malformed: the UI then falls back to the bank flow
 *  exactly as before this phase — never to a silent composer run). */
export function parseExamRouteDecision(raw: unknown): ExamRouteDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !isEnumOf(r.route, EXAM_ROUTES) || !isEnumOf(r.domain, EXAM_SUBJECT_DOMAINS)) return null;
  const allowed = Array.isArray(r.allowedRoutes) ? [...new Set(r.allowedRoutes.filter((x): x is ExamRoute => isEnumOf(x, EXAM_ROUTES)))] : [];
  if (!allowed.includes(r.route)) allowed.unshift(r.route);
  const strings = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(x => x.slice(0, 300)).slice(0, n) : []);
  return {
    v: 1,
    route: r.route,
    allowedRoutes: allowed,
    domain: r.domain,
    domainLabel: EXAM_SUBJECT_LABELS[r.domain],
    subjectLabel: typeof r.subjectLabel === "string" && r.subjectLabel.trim() ? r.subjectLabel.slice(0, COMPOSER_LIMITS.shortText) : EXAM_SUBJECT_LABELS[r.domain],
    language: isEnumOf(r.language, EXAM_REQUEST_LANGUAGES) ? r.language : "ar",
    sourcePreference: isEnumOf(r.sourcePreference, EXAM_SOURCE_PREFERENCES) ? r.sourcePreference : "unspecified",
    confidence: r.confidence === "high" ? "high" : "low",
    needsConfirmation: r.needsConfirmation === true,
    reasons: strings(r.reasons, 6),
    evidence: strings(r.evidence, 8)
  };
}
