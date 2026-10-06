// Phase 20D.1 — ExamPresentationV1: the versioned, data-only, CODE-OWNED presentation contract. JSON only selects vocabulary: a preset id,
// strict #RRGGBB colours, token words, slot variants and type variants. It never carries CSS, HTML, selectors, class / component / module
// names, URLs or lengths. Everything here is pure and server-safe (shared finalization build): validation (exact keys, closed vocabularies,
// WCAG contrast — every violation BLOCKS finalization, nothing is repaired), the resolver (preset → exam → section → question → type
// variant; a malformed stored value falls back to the safe default preset at runtime, never breaking the exam), the CSS-variable map
// (ONLY known --xp-* names with values from code-owned tables or validated colours) and the strict student projections.
// Presentation is ACADEMICALLY INERT: no grader, identity, fingerprint, seed or marks function reads anything defined here.
import { QUESTION_TYPE_CATALOG } from "../questionTypeCatalog";

export const PRESENTATION_SCHEMA_VERSION = 1 as const;
export const COLOR_TOKENS = Object.freeze(["primary", "accent", "background", "surface", "surfaceAlt", "text", "muted", "border", "success", "warning", "danger"] as const);
export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Palette = Record<ColorToken, string>;
const SLOTS = Object.freeze({
  examHeader: Object.freeze(["plain", "hero", "banded", "minimal"]),
  sectionHeader: Object.freeze(["plain", "band", "underline", "card"]),
  questionCard: Object.freeze(["flat", "outlined", "elevated", "paper"]),
  questionNumber: Object.freeze(["plain", "badge", "circle", "square"]),
  marksBadge: Object.freeze(["text", "pill", "outline", "corner"]),
  questionStem: Object.freeze(["compact", "normal", "comfortable"]),
  table: Object.freeze(["plain", "striped", "bordered", "minimal"]),
  callout: Object.freeze(["soft", "solid", "outline"]),
  answerArea: Object.freeze(["plain", "contained", "lined"]),
  navigation: Object.freeze(["standard", "modern", "minimal"]),
  figure: Object.freeze(["plain", "framed"]),
  code: Object.freeze(["light", "dark"])
});
export type Slot = keyof typeof SLOTS;
export const TYPE_VARIANTS = Object.freeze(["standard", "writingPaper", "developerWorkspace", "laboratory", "networkWorkspace", "storyWorkspace", "visualWorkspace"] as const);
export type TypeVariant = (typeof TYPE_VARIANTS)[number];
const FAMILIES = Object.freeze(["systemArabic", "systemSans", "academicSerif", "developerMono"] as const);
const SCALES = Object.freeze(["compact", "normal", "comfortable", "large"] as const);
const LINE_HEIGHTS = Object.freeze(["tight", "normal", "relaxed"] as const);
const WEIGHTS = Object.freeze(["regular", "medium", "bold"] as const);
const SPACINGS = Object.freeze(["compact", "normal", "comfortable", "spacious"] as const);
const RADII = Object.freeze(["none", "sm", "md", "lg", "xl"] as const);
const SHADOWS = Object.freeze(["none", "subtle", "medium", "strong"] as const);
const PAGE_WIDTHS = Object.freeze(["narrow", "normal", "wide", "full"] as const);
const SECTION_SPACINGS = Object.freeze(["compact", "normal", "large"] as const);
const SCENARIO_PLACEMENTS = Object.freeze(["inline", "responsiveSide"] as const);
const MOTION = Object.freeze(["none", "subtle"] as const);
const PRINT_MODES = Object.freeze(["academic", "compact"] as const);
const DIRECTIONS = Object.freeze(["rtl", "ltr"] as const);
const APPEARANCES = Object.freeze(["light"] as const);
const QUESTION_WIDTHS = Object.freeze(["normal", "wide", "full"] as const);
const TYPE_KEYS: readonly string[] = Object.freeze(QUESTION_TYPE_CATALOG.map(d => d.key));

/** Discoverable, frozen vocabulary (authoring UI, documentation, future safe generation). Data only. */
export const PRESENTATION_VOCABULARY = Object.freeze({
  schemaVersion: PRESENTATION_SCHEMA_VERSION, colorTokens: COLOR_TOKENS, slots: SLOTS, typeVariants: TYPE_VARIANTS, families: FAMILIES, scales: SCALES,
  lineHeights: LINE_HEIGHTS, questionWeights: WEIGHTS, spacings: SPACINGS, radii: RADII, shadows: SHADOWS, pageWidths: PAGE_WIDTHS,
  sectionSpacings: SECTION_SPACINGS, scenarioPlacements: SCENARIO_PLACEMENTS, motion: MOTION, printModes: PRINT_MODES, directions: DIRECTIONS,
  appearances: APPEARANCES, questionWidths: QUESTION_WIDTHS, questionTypes: TYPE_KEYS,
  sectionOverrideSlots: Object.freeze(["sectionHeader", "questionCard", "questionNumber", "marksBadge", "answerArea"] as const)
});

export type Typography = { family: (typeof FAMILIES)[number]; scale: (typeof SCALES)[number]; lineHeight: (typeof LINE_HEIGHTS)[number]; questionWeight: (typeof WEIGHTS)[number] };
export type Layout = { pageWidth: (typeof PAGE_WIDTHS)[number]; questionSpacing: (typeof SPACINGS)[number]; sectionSpacing: (typeof SECTION_SPACINGS)[number]; scenarioPlacement: (typeof SCENARIO_PLACEMENTS)[number] };
export type ResolvedPresentation = {
  preset: PresetId; fallback: boolean; direction: "rtl" | "ltr"; appearance: "light";
  tokens: { colors: Palette; typography: Typography; spacing: (typeof SPACINGS)[number]; radius: (typeof RADII)[number]; shadow: (typeof SHADOWS)[number] };
  layout: Layout; components: Record<Slot, string>; typeVariants: Record<string, TypeVariant>; motion: (typeof MOTION)[number]; print: (typeof PRINT_MODES)[number];
};
export type ResolvedQuestionPresentation = { variant: TypeVariant; width: (typeof QUESTION_WIDTHS)[number]; answerArea: string; card: string };

type PresetDef = { label: string; description: string; colors: Palette; typography: Typography; spacing: ResolvedPresentation["tokens"]["spacing"]; radius: ResolvedPresentation["tokens"]["radius"]; shadow: ResolvedPresentation["tokens"]["shadow"]; layout: Layout; components: Record<Slot, string>; typeVariants: Record<string, TypeVariant>; motion: ResolvedPresentation["motion"] };
const STD_TYPES: Record<string, TypeVariant> = { coding: "developerWorkspace", smartSim: "laboratory", simulation: "laboratory", composite: "storyWorkspace", openResponse: "writingPaper", networkCli: "networkWorkspace", hotspot: "visualWorkspace", labelDiagram: "visualWorkspace" };
const COMPONENTS: Record<Slot, string> = { examHeader: "plain", sectionHeader: "plain", questionCard: "outlined", questionNumber: "badge", marksBadge: "pill", questionStem: "normal", table: "striped", callout: "soft", answerArea: "contained", navigation: "standard", figure: "framed", code: "light" };
const LAYOUT: Layout = { pageWidth: "normal", questionSpacing: "normal", sectionSpacing: "normal", scenarioPlacement: "responsiveSide" };
const TYPO: Typography = { family: "systemArabic", scale: "normal", lineHeight: "normal", questionWeight: "medium" };
type PresetOver = { typography?: Typography; spacing?: PresetDef["spacing"]; radius?: PresetDef["radius"]; shadow?: PresetDef["shadow"]; layout?: Layout; components?: Partial<Record<Slot, string>>; typeVariants?: Record<string, TypeVariant>; motion?: PresetDef["motion"] };
const def = (label: string, description: string, colors: Palette, over: PresetOver = {}): PresetDef => ({
  label, description, colors, typography: { ...TYPO, ...(over.typography || {}) }, spacing: over.spacing || "normal", radius: over.radius || "md", shadow: over.shadow || "subtle",
  layout: { ...LAYOUT, ...(over.layout || {}) }, components: { ...COMPONENTS, ...(over.components || {}) } as Record<Slot, string>, typeVariants: { ...STD_TYPES, ...(over.typeVariants || {}) }, motion: over.motion || "subtle"
});
const SLATE = { success: "#15803D", warning: "#A16207", danger: "#B91C1C" };
/** The code-owned production presets. Each passes the WCAG policy below (pinned by tests). */
export const PRESENTATION_PRESETS = Object.freeze({
  default: def("الافتراضي المؤسسي", "تصميم متوازن وواضح يناسب معظم الامتحانات", { primary: "#1D4ED8", accent: "#0369A1", background: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#0F172A", muted: "#475569", border: "#CBD5E1", ...SLATE }),
  classicPaper: def("ورقة امتحان رسمية", "شكل ورقي رسمي بخط أكاديمي وحدود هادئة", { primary: "#1F2937", accent: "#7C2D12", background: "#F7F3E8", surface: "#FFFDF7", surfaceAlt: "#F3EEE0", text: "#1C1917", muted: "#57534E", border: "#D6CFC0", ...SLATE },
    { typography: { family: "academicSerif", scale: "normal", lineHeight: "relaxed", questionWeight: "medium" }, radius: "none", shadow: "none", components: { examHeader: "banded", sectionHeader: "underline", questionCard: "paper", questionNumber: "plain", marksBadge: "text", table: "bordered", callout: "outline", answerArea: "lined", navigation: "minimal" }, motion: "none" }),
  modernAcademic: def("أكاديمي حديث", "واجهة عصرية مريحة مع تمييز واضح للعلامات", { primary: "#1D4ED8", accent: "#0EA5E9", background: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#172033", muted: "#64748B", border: "#CBD5E1", ...SLATE },
    { typography: { family: "systemArabic", scale: "comfortable", lineHeight: "relaxed", questionWeight: "medium" }, spacing: "comfortable", radius: "lg", shadow: "medium", layout: { pageWidth: "wide", questionSpacing: "comfortable", sectionSpacing: "large", scenarioPlacement: "responsiveSide" }, components: { examHeader: "hero", sectionHeader: "band", questionCard: "elevated", navigation: "modern" } }),
  cards: def("بطاقات", "كل سؤال في بطاقة مستقلة مرتفعة", { primary: "#4338CA", accent: "#7C3AED", background: "#EEF2FF", surface: "#FFFFFF", surfaceAlt: "#F5F7FF", text: "#1E1B4B", muted: "#4B5563", border: "#C7D2FE", ...SLATE },
    { radius: "xl", shadow: "medium", components: { questionCard: "elevated", sectionHeader: "card", questionNumber: "circle" } }),
  focus: def("تركيز", "تصميم هادئ بأقل قدر من المشتتات", { primary: "#0F766E", accent: "#0E7490", background: "#F8FAFA", surface: "#FFFFFF", surfaceAlt: "#F0F5F5", text: "#132A2A", muted: "#4B5F5F", border: "#CFDCDC", ...SLATE },
    { typography: { family: "systemArabic", scale: "comfortable", lineHeight: "relaxed", questionWeight: "regular" }, spacing: "spacious", shadow: "none", layout: { pageWidth: "narrow", questionSpacing: "spacious", sectionSpacing: "large", scenarioPlacement: "inline" }, components: { questionCard: "flat", sectionHeader: "plain", navigation: "minimal" }, motion: "none" }),
  compact: def("مدمج", "مسافات أقل لرؤية محتوى أكثر", { primary: "#1D4ED8", accent: "#0369A1", background: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#0F172A", muted: "#475569", border: "#CBD5E1", ...SLATE },
    { typography: { family: "systemSans", scale: "compact", lineHeight: "tight", questionWeight: "medium" }, spacing: "compact", radius: "sm", layout: { pageWidth: "wide", questionSpacing: "compact", sectionSpacing: "compact", scenarioPlacement: "responsiveSide" }, components: { questionStem: "compact", questionCard: "flat" } }),
  scienceLab: def("مختبر العلوم", "تصميم علمي للصيغ والجداول والمحاكاة", { primary: "#0E7490", accent: "#16A34A", background: "#F0F9FF", surface: "#FFFFFF", surfaceAlt: "#ECFEFF", text: "#0C2A3A", muted: "#3F5966", border: "#BAE6FD", ...SLATE },
    { radius: "lg", shadow: "subtle", layout: { pageWidth: "wide", questionSpacing: "comfortable", sectionSpacing: "normal", scenarioPlacement: "responsiveSide" }, components: { sectionHeader: "band", questionCard: "elevated", callout: "solid" } }),
  networkLab: def("مختبر الشبكات", "مساحة عمل شبكية بجداول أجهزة وأوامر CLI", { primary: "#0F4C81", accent: "#0284C7", background: "#F5F8FC", surface: "#FFFFFF", surfaceAlt: "#EEF4FB", text: "#172033", muted: "#4A5B70", border: "#C9D7E8", ...SLATE },
    { radius: "lg", shadow: "medium", spacing: "comfortable", layout: { pageWidth: "wide", questionSpacing: "comfortable", sectionSpacing: "large", scenarioPlacement: "responsiveSide" }, components: { sectionHeader: "band", questionCard: "elevated", table: "striped", code: "dark" }, typeVariants: { smartSim: "networkWorkspace" } }),
  developerWorkspace: def("بيئة المطوّر", "مساحة برمجة بخط أحادي وكتل كود واضحة", { primary: "#6D28D9", accent: "#0891B2", background: "#F6F7FB", surface: "#FFFFFF", surfaceAlt: "#F1F2F8", text: "#111827", muted: "#4B5563", border: "#D1D5E4", ...SLATE },
    { radius: "md", shadow: "subtle", layout: { pageWidth: "wide", questionSpacing: "normal", sectionSpacing: "normal", scenarioPlacement: "responsiveSide" }, components: { code: "dark", questionCard: "outlined", sectionHeader: "underline" } }),
  friendly: def("ودود", "ألوان دافئة وزوايا مستديرة للمراحل الأصغر", { primary: "#C2410C", accent: "#DB2777", background: "#FFF7ED", surface: "#FFFFFF", surfaceAlt: "#FFF1E6", text: "#1F2937", muted: "#57534E", border: "#FED7AA", ...SLATE },
    { typography: { family: "systemArabic", scale: "large", lineHeight: "relaxed", questionWeight: "bold" }, radius: "xl", shadow: "subtle", spacing: "comfortable", components: { questionNumber: "circle", sectionHeader: "card", questionCard: "elevated" } }),
  highContrast: def("تباين عالٍ", "أقصى وضوح بصري لإمكانية الوصول", { primary: "#000000", accent: "#0000CC", background: "#FFFFFF", surface: "#FFFFFF", surfaceAlt: "#F2F2F2", text: "#000000", muted: "#222222", border: "#000000", success: "#006400", warning: "#6B4E00", danger: "#8B0000" },
    { typography: { family: "systemSans", scale: "large", lineHeight: "relaxed", questionWeight: "bold" }, radius: "sm", shadow: "none", components: { questionCard: "outlined", sectionHeader: "underline", marksBadge: "outline", table: "bordered", callout: "outline", answerArea: "contained", code: "light" }, motion: "none" })
} satisfies Record<string, PresetDef>);
export type PresetId = keyof typeof PRESENTATION_PRESETS;
const PRESET_IDS: readonly string[] = Object.freeze(Object.keys(PRESENTATION_PRESETS));

// ── colour authority ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const HEX6 = /^#[0-9A-Fa-f]{6}$/, HEX3 = /^#[0-9A-Fa-f]{3}$/;
/** Strict #RRGGBB (uppercase) or #RGB (normalized) → canonical #RRGGBB, else null. No other CSS colour syntax is ever accepted. */
export function normalizeHexColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (HEX6.test(v)) return v.toUpperCase();
  if (HEX3.test(v)) return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
  return null;
}
const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
/** WCAG 2.x contrast ratio of two #RRGGBB colours (1 … 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(normalizeHexColor(a) || "#000000"), lb = luminance(normalizeHexColor(b) || "#FFFFFF");
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** The documented WCAG policy. Every rule is blocking at finalization; the Studio shows the same list as warnings while editing. */
export const CONTRAST_POLICY = Object.freeze([
  { fg: "text", bg: "background", min: 4.5, label: "النص على خلفية الصفحة" },
  { fg: "text", bg: "surface", min: 4.5, label: "النص على البطاقات" },
  { fg: "text", bg: "surfaceAlt", min: 4.5, label: "النص على الخلفية البديلة" },
  { fg: "muted", bg: "surface", min: 4.5, label: "النص الثانوي على البطاقات" },
  { fg: "#FFFFFF", bg: "primary", min: 4.5, label: "النص على الحالة المحددة / الأزرار الرئيسية" },
  { fg: "primary", bg: "surface", min: 3, label: "مؤشر التركيز والعناصر التفاعلية" }
] as const);
export type ContrastIssue = { fg: string; bg: string; ratio: number; min: number; label: string };
export function presentationContrastIssues(colors: Palette): ContrastIssue[] {
  const pick = (k: string) => (k.startsWith("#") ? k : colors[k as ColorToken]);
  return CONTRAST_POLICY.map(r => ({ fg: r.fg, bg: r.bg, ratio: contrastRatio(pick(r.fg), pick(r.bg)), min: r.min, label: r.label })).filter(r => r.ratio < r.min - 1e-9);
}

// ── validation ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PresentationIssue = { code: string; message: string; severity: "error"; path: string };
export type ExamPresentationV1 = {
  schemaVersion: 1; preset: PresetId; direction?: "rtl" | "ltr"; appearance?: "light";
  tokens?: { colors?: Partial<Palette>; typography?: Partial<Typography>; spacing?: string; radius?: string; shadow?: string };
  layout?: Partial<Layout>; components?: Partial<Record<Slot, { variant: string }>>; questionTypeVariants?: Partial<Record<string, TypeVariant>>;
  motion?: { level: string }; print?: { mode: string };
};
export type SectionPresentationV1 = { schemaVersion: 1; components?: Partial<Record<"sectionHeader" | "questionCard" | "questionNumber" | "marksBadge" | "answerArea", { variant: string }>>; layout?: { questionSpacing?: string } };
export type QuestionPresentationV1 = { schemaVersion: 1; variant?: TypeVariant; width?: "normal" | "wide" | "full"; answerArea?: string; card?: string };
type Result<T> = { ok: boolean; value?: T; issues: PresentationIssue[] };

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function makeValidator(rootCode: string) {
  const issues: PresentationIssue[] = [];
  const add = (code: string, message: string, path: string) => { if (issues.length < 40) issues.push({ code: rootCode && code !== "PRESENTATION_VERSION" && code !== "PRESENTATION_INVALID" ? rootCode : code, message, severity: "error", path }); };
  const keys = (o: Record<string, unknown>, allowed: readonly string[], path: string) => {
    for (const k of Object.keys(o)) if (FORBIDDEN.has(k) || !allowed.includes(k)) add("PRESENTATION_UNKNOWN_KEY", "حقل غير معروف في إعدادات العرض: " + k, path + "." + k);
  };
  const word = <T extends string>(v: unknown, allowed: readonly T[], path: string, code = "PRESENTATION_TOKEN"): T | undefined => {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
    add(code, "قيمة غير مسموحة في إعدادات العرض (" + path + ").", path);
    return undefined;
  };
  const variantObj = (v: unknown, slot: Slot, path: string): { variant: string } | undefined => {
    if (!isPlain(v)) { add("PRESENTATION_VARIANT", "نمط مكوّن غير صالح.", path); return undefined; }
    keys(v, ["variant"], path);
    const w = word(v.variant, SLOTS[slot], path + ".variant", "PRESENTATION_VARIANT");
    return w ? { variant: w } : undefined;
  };
  return { issues, add, keys, word, variantObj };
}

/** Strict validation of an exam-level ExamPresentationV1. Returns the canonical copy (exact input keys, colours normalized) only when valid. */
export function validatePresentation(raw: unknown, path = "presentation"): Result<ExamPresentationV1> {
  const V = makeValidator("");
  const { issues, add, keys, word, variantObj } = V;
  if (!isPlain(raw)) { add("PRESENTATION_INVALID", "إعدادات العرض يجب أن تكون كائنًا منظمًا.", path); return { ok: false, issues }; }
  if (raw.schemaVersion !== PRESENTATION_SCHEMA_VERSION) { add("PRESENTATION_VERSION", "إصدار إعدادات العرض غير مدعوم (المدعوم: 1).", path + ".schemaVersion"); return { ok: false, issues }; }
  keys(raw, ["schemaVersion", "preset", "direction", "appearance", "tokens", "layout", "components", "questionTypeVariants", "motion", "print"], path);
  const out: ExamPresentationV1 = { schemaVersion: 1, preset: "default" };
  if (typeof raw.preset !== "string" || !PRESET_IDS.includes(raw.preset)) add("PRESENTATION_PRESET", "قالب عرض غير معروف.", path + ".preset"); else out.preset = raw.preset as PresetId;
  if (own(raw, "direction")) { const d = word(raw.direction, DIRECTIONS, path + ".direction"); if (d) out.direction = d; }
  if (own(raw, "appearance")) { const a = word(raw.appearance, APPEARANCES, path + ".appearance"); if (a) out.appearance = a; }
  if (own(raw, "tokens")) {
    const t = raw.tokens, tp = path + ".tokens";
    if (!isPlain(t)) add("PRESENTATION_TOKEN", "رموز التصميم غير صالحة.", tp);
    else {
      keys(t, ["colors", "typography", "spacing", "radius", "shadow"], tp);
      const tok: NonNullable<ExamPresentationV1["tokens"]> = {};
      if (own(t, "colors")) {
        const c = t.colors;
        if (!isPlain(c)) add("PRESENTATION_COLOR", "ألوان غير صالحة.", tp + ".colors");
        else {
          keys(c, COLOR_TOKENS, tp + ".colors");
          const colors: Partial<Palette> = {};
          for (const k of COLOR_TOKENS) if (own(c, k)) { const ck = c[k], h = typeof ck === "string" && HEX6.test(ck) ? ck.toUpperCase() : null; if (!h) add("PRESENTATION_COLOR", "اللون يجب أن يكون بصيغة #RRGGBB فقط.", tp + ".colors." + k); else colors[k] = h; }
          tok.colors = colors;
        }
      }
      if (own(t, "typography")) {
        const ty = t.typography;
        if (!isPlain(ty)) add("PRESENTATION_TOKEN", "إعدادات الخط غير صالحة.", tp + ".typography");
        else {
          keys(ty, ["family", "scale", "lineHeight", "questionWeight"], tp + ".typography");
          const o: Partial<Typography> = {};
          if (own(ty, "family")) { const v = word(ty.family, FAMILIES, tp + ".typography.family"); if (v) o.family = v; }
          if (own(ty, "scale")) { const v = word(ty.scale, SCALES, tp + ".typography.scale"); if (v) o.scale = v; }
          if (own(ty, "lineHeight")) { const v = word(ty.lineHeight, LINE_HEIGHTS, tp + ".typography.lineHeight"); if (v) o.lineHeight = v; }
          if (own(ty, "questionWeight")) { const v = word(ty.questionWeight, WEIGHTS, tp + ".typography.questionWeight"); if (v) o.questionWeight = v; }
          tok.typography = o;
        }
      }
      if (own(t, "spacing")) { const v = word(t.spacing, SPACINGS, tp + ".spacing"); if (v) tok.spacing = v; }
      if (own(t, "radius")) { const v = word(t.radius, RADII, tp + ".radius"); if (v) tok.radius = v; }
      if (own(t, "shadow")) { const v = word(t.shadow, SHADOWS, tp + ".shadow"); if (v) tok.shadow = v; }
      out.tokens = tok;
    }
  }
  if (own(raw, "layout")) {
    const l = raw.layout, lp = path + ".layout";
    if (!isPlain(l)) add("PRESENTATION_TOKEN", "إعدادات التخطيط غير صالحة.", lp);
    else {
      keys(l, ["pageWidth", "questionSpacing", "sectionSpacing", "scenarioPlacement"], lp);   // the top bar is lifecycle chrome: never JSON-controlled (review fix 1)
      const o: Partial<Layout> = {};
      if (own(l, "pageWidth")) { const v = word(l.pageWidth, PAGE_WIDTHS, lp + ".pageWidth"); if (v) o.pageWidth = v; }
      if (own(l, "questionSpacing")) { const v = word(l.questionSpacing, SPACINGS, lp + ".questionSpacing"); if (v) o.questionSpacing = v; }
      if (own(l, "sectionSpacing")) { const v = word(l.sectionSpacing, SECTION_SPACINGS, lp + ".sectionSpacing"); if (v) o.sectionSpacing = v; }
      if (own(l, "scenarioPlacement")) { const v = word(l.scenarioPlacement, SCENARIO_PLACEMENTS, lp + ".scenarioPlacement"); if (v) o.scenarioPlacement = v; }
      out.layout = o;
    }
  }
  if (own(raw, "components")) {
    const c = raw.components, cp = path + ".components";
    if (!isPlain(c)) add("PRESENTATION_VARIANT", "أنماط المكوّنات غير صالحة.", cp);
    else {
      keys(c, Object.keys(SLOTS), cp);
      const o: Partial<Record<Slot, { variant: string }>> = {};
      for (const slot of Object.keys(SLOTS) as Slot[]) if (own(c, slot)) { const v = variantObj(c[slot], slot, cp + "." + slot); if (v) o[slot] = v; }
      out.components = o;
    }
  }
  if (own(raw, "questionTypeVariants")) {
    const q = raw.questionTypeVariants, qp = path + ".questionTypeVariants";
    if (!isPlain(q)) add("PRESENTATION_TYPE_VARIANT", "أنماط أنواع الأسئلة غير صالحة.", qp);
    else {
      const o: Partial<Record<string, TypeVariant>> = {};
      for (const k of Object.keys(q)) {
        if (FORBIDDEN.has(k) || !TYPE_KEYS.includes(k)) { add("PRESENTATION_TYPE_VARIANT", "نوع سؤال غير معروف في أنماط الأنواع: " + k, qp + "." + k); continue; }
        const v = word(q[k], TYPE_VARIANTS, qp + "." + k, "PRESENTATION_TYPE_VARIANT");
        if (v) o[k] = v;
      }
      out.questionTypeVariants = o;
    }
  }
  if (own(raw, "motion")) {
    const m = raw.motion;
    if (!isPlain(m)) add("PRESENTATION_TOKEN", "إعداد الحركة غير صالح.", path + ".motion");
    else { keys(m, ["level"], path + ".motion"); const v = word(m.level, MOTION, path + ".motion.level"); if (v) out.motion = { level: v }; }
  }
  if (own(raw, "print")) {
    const p = raw.print;
    if (!isPlain(p)) add("PRESENTATION_TOKEN", "إعداد الطباعة غير صالح.", path + ".print");
    else { keys(p, ["mode"], path + ".print"); const v = word(p.mode, PRINT_MODES, path + ".print.mode"); if (v) out.print = { mode: v }; }
  }
  if (!issues.length) {
    const palette: Palette = { ...PRESENTATION_PRESETS[out.preset].colors, ...(out.tokens?.colors || {}) };
    for (const c of presentationContrastIssues(palette)) add("PRESENTATION_CONTRAST", "تباين غير كافٍ: " + c.label + " (" + c.ratio.toFixed(2) + " < " + c.min + ").", path + ".tokens.colors");
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: out, issues };
}

const SECTION_SLOTS = PRESENTATION_VOCABULARY.sectionOverrideSlots;
/** A section override: bounded to a few slots and the question spacing (never tokens). */
export function validateSectionPresentation(raw: unknown, path = "section.presentation"): Result<SectionPresentationV1> {
  const { issues, add, keys, word, variantObj } = makeValidator("PRESENTATION_SECTION_OVERRIDE");
  if (!isPlain(raw)) { add("PRESENTATION_SECTION_OVERRIDE", "إعدادات عرض القسم غير صالحة.", path); return { ok: false, issues }; }
  if (raw.schemaVersion !== PRESENTATION_SCHEMA_VERSION) { add("PRESENTATION_SECTION_OVERRIDE", "إصدار إعدادات عرض القسم غير مدعوم.", path + ".schemaVersion"); return { ok: false, issues }; }
  keys(raw, ["schemaVersion", "components", "layout"], path);
  const out: SectionPresentationV1 = { schemaVersion: 1 };
  if (own(raw, "components")) {
    const c = raw.components;
    if (!isPlain(c)) add("PRESENTATION_SECTION_OVERRIDE", "أنماط مكوّنات القسم غير صالحة.", path + ".components");
    else { keys(c, SECTION_SLOTS, path + ".components"); const o: SectionPresentationV1["components"] = {}; for (const s of SECTION_SLOTS) if (own(c, s)) { const v = variantObj(c[s], s, path + ".components." + s); if (v) o[s] = v; } out.components = o; }
  }
  if (own(raw, "layout")) {
    const l = raw.layout;
    if (!isPlain(l)) add("PRESENTATION_SECTION_OVERRIDE", "تخطيط القسم غير صالح.", path + ".layout");
    else { keys(l, ["questionSpacing"], path + ".layout"); const o: NonNullable<SectionPresentationV1["layout"]> = {}; if (own(l, "questionSpacing")) { const v = word(l.questionSpacing, SPACINGS, path + ".layout.questionSpacing"); if (v) o.questionSpacing = v; } out.layout = o; }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: out, issues };
}
/** A question override: the narrowest surface (type variant, width, answer area, card). */
export function validateQuestionPresentation(raw: unknown, path = "question.presentation"): Result<QuestionPresentationV1> {
  const { issues, add, keys, word } = makeValidator("PRESENTATION_QUESTION_OVERRIDE");
  if (!isPlain(raw)) { add("PRESENTATION_QUESTION_OVERRIDE", "إعدادات عرض السؤال غير صالحة.", path); return { ok: false, issues }; }
  if (raw.schemaVersion !== PRESENTATION_SCHEMA_VERSION) { add("PRESENTATION_QUESTION_OVERRIDE", "إصدار إعدادات عرض السؤال غير مدعوم.", path + ".schemaVersion"); return { ok: false, issues }; }
  keys(raw, ["schemaVersion", "variant", "width", "answerArea", "card"], path);
  const out: QuestionPresentationV1 = { schemaVersion: 1 };
  if (own(raw, "variant")) { const v = word(raw.variant, TYPE_VARIANTS, path + ".variant"); if (v) out.variant = v; }
  if (own(raw, "width")) { const v = word(raw.width, QUESTION_WIDTHS, path + ".width"); if (v) out.width = v; }
  if (own(raw, "answerArea")) { const v = word(raw.answerArea, SLOTS.answerArea, path + ".answerArea"); if (v) out.answerArea = v; }
  if (own(raw, "card")) { const v = word(raw.card, SLOTS.questionCard, path + ".card"); if (v) out.card = v; }
  return issues.length ? { ok: false, issues } : { ok: true, value: out, issues };
}

// ── resolver ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function resolveFrom(id: PresetId, v: ExamPresentationV1 | undefined, fallback: boolean): ResolvedPresentation {
  const p = PRESENTATION_PRESETS[id];
  const t = v?.tokens || {};
  const comps = { ...p.components } as Record<Slot, string>;
  for (const [slot, val] of Object.entries(v?.components || {})) if (val) comps[slot as Slot] = val.variant;
  return {
    preset: id, fallback, direction: v?.direction || "rtl", appearance: "light",
    tokens: { colors: { ...p.colors, ...(t.colors || {}) } as Palette, typography: { ...p.typography, ...(t.typography || {}) } as Typography, spacing: (t.spacing || p.spacing) as ResolvedPresentation["tokens"]["spacing"], radius: (t.radius || p.radius) as ResolvedPresentation["tokens"]["radius"], shadow: (t.shadow || p.shadow) as ResolvedPresentation["tokens"]["shadow"] },
    layout: { ...p.layout, ...(v?.layout || {}) } as Layout,
    components: comps,
    typeVariants: { ...p.typeVariants, ...(v?.questionTypeVariants || {}) } as Record<string, TypeVariant>,
    motion: (v?.motion?.level || p.motion) as ResolvedPresentation["motion"],
    print: (v?.print?.mode || "academic") as ResolvedPresentation["print"]
  };
}
/** null when the exam has NO presentation object (the legacy presentationTheme path decides); otherwise the fully resolved presentation —
 *  a malformed stored value resolves to the safe default preset with fallback:true (it must never break or hide the exam). */
export function resolvePresentation(raw: unknown): ResolvedPresentation | null {
  if (raw === undefined || raw === null) return null;
  const r = validatePresentation(raw);
  return r.ok && r.value ? resolveFrom(r.value.preset, r.value, false) : resolveFrom("default", undefined, true);
}
/** The section's effective presentation (a malformed override is ignored at runtime). */
export function resolveSectionPresentation(exam: ResolvedPresentation, raw: unknown): ResolvedPresentation {
  if (raw === undefined || raw === null) return exam;
  const r = validateSectionPresentation(raw);
  if (!r.ok || !r.value) return exam;
  const comps = { ...exam.components };
  for (const [slot, val] of Object.entries(r.value.components || {})) if (val) comps[slot as Slot] = val.variant;
  return { ...exam, components: comps, layout: { ...exam.layout, ...(r.value.layout || {}) } as Layout };
}
/** The question shell's effective presentation: question override → exam type variant map → preset defaults → "standard". */
export function resolveQuestionPresentation(section: ResolvedPresentation, question: { presentationType?: unknown; type?: unknown; presentation?: unknown }): ResolvedQuestionPresentation {
  const type = String(question.presentationType ?? question.type ?? "");
  const r = question.presentation === undefined ? undefined : validateQuestionPresentation(question.presentation);
  const o = r && r.ok ? r.value : undefined;
  return {
    variant: o?.variant || (Object.prototype.hasOwnProperty.call(section.typeVariants, type) ? section.typeVariants[type] : "standard"),
    width: o?.width || "normal",
    answerArea: o?.answerArea || section.components.answerArea,
    card: o?.card || section.components.questionCard
  };
}

// ── CSS variables (values ONLY from validated colours or code-owned tables) ──────────────────────────────────────────────────────────
const FONT_STACKS: Record<Typography["family"], string> = {
  systemArabic: "\"Noto Naskh Arabic\", \"Segoe UI\", Tahoma, \"Geeza Pro\", Arial, sans-serif",
  systemSans: "system-ui, \"Segoe UI\", Tahoma, Arial, sans-serif",
  academicSerif: "\"Amiri\", \"Times New Roman\", Georgia, serif",
  developerMono: "\"Cascadia Code\", Consolas, \"DejaVu Sans Mono\", monospace"
};
const SCALE: Record<Typography["scale"], string> = { compact: "0.9375", normal: "1", comfortable: "1.0625", large: "1.125" };
const LINE: Record<Typography["lineHeight"], string> = { tight: "1.45", normal: "1.65", relaxed: "1.85" };
const WEIGHT: Record<Typography["questionWeight"], string> = { regular: "400", medium: "500", bold: "700" };
const SPACE: Record<string, string> = { compact: "0.75", normal: "1", comfortable: "1.25", spacious: "1.5" };
const RADIUS: Record<string, string> = { none: "0px", sm: "4px", md: "8px", lg: "12px", xl: "18px" };
const SHADOW: Record<string, string> = { none: "none", subtle: "0 1px 2px rgb(15 23 42 / 0.06)", medium: "0 4px 14px rgb(15 23 42 / 0.10)", strong: "0 10px 28px rgb(15 23 42 / 0.16)" };
const SECTION_GAP: Record<string, string> = { compact: "1", normal: "1.5", large: "2.25" };
const kebab = (s: string) => s.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
export function presentationCssVars(r: ResolvedPresentation): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of COLOR_TOKENS) out["--xp-" + kebab(k)] = normalizeHexColor(r.tokens.colors[k]) || PRESENTATION_PRESETS.default.colors[k];
  out["--xp-font"] = FONT_STACKS[r.tokens.typography.family];
  out["--xp-scale"] = SCALE[r.tokens.typography.scale];
  out["--xp-line"] = LINE[r.tokens.typography.lineHeight];
  out["--xp-q-weight"] = WEIGHT[r.tokens.typography.questionWeight];
  out["--xp-space"] = SPACE[r.tokens.spacing];
  out["--xp-q-gap"] = SPACE[r.layout.questionSpacing];
  out["--xp-section-gap"] = SECTION_GAP[r.layout.sectionSpacing];
  out["--xp-radius"] = RADIUS[r.tokens.radius];
  out["--xp-shadow"] = SHADOW[r.tokens.shadow];
  return out;
}
/** Root data attributes — code-owned names, vocabulary values only. CSS selects on them; nothing else is ever emitted. */
export function presentationRootAttributes(r: ResolvedPresentation): Record<string, string> {
  const a: Record<string, string> = {
    "data-xp-preset": r.preset, "data-xp-width": r.layout.pageWidth, "data-xp-density": r.tokens.spacing, "data-xp-motion": r.motion,
    "data-xp-print": r.print, "data-xp-direction": r.direction, "data-xp-scenario": r.layout.scenarioPlacement,
    "data-xp-family": r.tokens.typography.family, "data-xp-stem": r.components.questionStem
  };
  if (r.fallback) a["data-xp-fallback"] = "true";
  for (const slot of ["examHeader", "navigation", "table", "callout", "figure", "code", "questionNumber", "marksBadge"] as const) a["data-xp-" + kebab(slot)] = r.components[slot];
  return a;
}

// ── student projections (strict canonical rebuilds; malformed → omitted) ─────────────────────────────────────────────────────────────
export function projectPresentationForStudent(raw: unknown): ExamPresentationV1 | undefined { const r = validatePresentation(raw); return r.ok ? r.value : undefined; }
export function projectSectionPresentationForStudent(raw: unknown): SectionPresentationV1 | undefined { const r = validateSectionPresentation(raw); return r.ok ? r.value : undefined; }
export function projectQuestionPresentationForStudent(raw: unknown): QuestionPresentationV1 | undefined { const r = validateQuestionPresentation(raw); return r.ok ? r.value : undefined; }
