// Class gradebook GB3 — the scheme builder's editable draft (docs/enterprise-class-gradebook-gb.md §4.2, §4.6). PURE.
//
// The draft keeps every weight as the text the teacher typed, so a half-typed value («12.» or «٣») never jumps. `summarize` mirrors the
// server's rules to guide the teacher BEFORE saving; the server stays the authority and validates again (lib/gradebook/scheme.js):
//   - a structural problem (empty title, invalid weight, a column without a source, too many parts) blocks the save;
//   - sums that are not 100 do NOT block it: the scheme is saved as a draft, with no final mark, and the page says so.
// Weights are never changed silently: «توزيع بالتساوي» is a button the teacher presses.
import type { GbAiProposal, GbCategory, GbCopyProposal, GbScheme, GbSource } from "./types";

export const LIMITS = { categories: 10, itemsPerCategory: 40, categoryTitle: 80, manualTitle: 120, manualMaxScore: 1000 } as const;
const SUM_TOLERANCE = 0.01;

export type DraftItem = { key: string; itemId: string; weightText: string; source: GbSource };
export type DraftCategory = { key: string; categoryId: string; title: string; weightText: string; items: DraftItem[] };
export type Draft = { categories: DraftCategory[] };

let seq = 0;
/** A new id in the server's safe-id alphabet ([A-Za-z0-9_-]), unique enough for one class's scheme. */
export function newId(prefix: "c" | "i"): string {
  seq = (seq + 1) % 1296;
  return prefix + "_" + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
}
let keySeq = 0;
const newKey = () => "k" + (++keySeq);

/** Western digits for Arabic-Indic / Extended Arabic-Indic ones, and «٫» or «,» as the decimal point. */
export function normalizeDigits(text: string): string {
  return String(text)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".")
    .trim();
}

/** A weight: a number in (0, 100] with at most two decimals; else null (never coerced). */
export function parseWeight(text: string): number | null {
  const t = normalizeDigits(text);
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100 ? n : null;
}

/** The text a stored weight is shown as. */
export const weightText = (n: number) => String(Math.round(n * 100) / 100);

export function emptyDraft(): Draft { return { categories: [] }; }

export function fromScheme(scheme: GbScheme | null): Draft {
  if (!scheme) return emptyDraft();
  return {
    categories: scheme.categories.map(c => ({
      key: newKey(), categoryId: c.categoryId, title: c.title, weightText: weightText(c.weight),
      items: c.items.map(i => ({ key: newKey(), itemId: i.itemId, weightText: weightText(i.weight), source: i.source }))
    }))
  };
}

/** GB8 — a draft from another class's proposal: every part and column gets a NEW id (a copied column never inherits marks stored
 *  under an id of this class's older scheme); the weights are kept as they are (a part that lost a column stays a draft). */
export function fromCopy(p: GbCopyProposal): Draft {
  return {
    categories: p.categories.map(c => ({
      key: newKey(), categoryId: newId("c"), title: c.title, weightText: weightText(c.weight),
      items: c.items.map(i => ({ key: newKey(), itemId: newId("i"), weightText: weightText(i.weight), source: i.source }))
    }))
  };
}

/** GB10 — a draft from the AI's proposal: like a copy, every part and column gets a NEW id; a weight the teacher still has to type
 *  (null) is an empty field, which the builder then asks for — never a number filled in by the page. */
export function fromAiProposal(p: GbAiProposal): Draft {
  const text = (w: number | null) => (w === null ? "" : weightText(w));
  return {
    categories: p.categories.map(c => ({
      key: newKey(), categoryId: newId("c"), title: c.title, weightText: text(c.weight),
      items: c.items.map(i => ({ key: newKey(), itemId: newId("i"), weightText: text(i.weight), source: i.source }))
    }))
  };
}

/** GB10 — what the AI built, in words: the summary, the server's notes and the model's assumptions, and each mention not built, with why. */
export function aiReport(p: GbAiProposal): { summary: string; notes: string[]; missing: string[] } {
  const summary = "بنى الذكاء الاصطناعي " + p.categories.length + " من الأقسام و" + p.built + " من العناصر."
    + (p.unmatched.length ? " لم يُبنَ " + p.unmatched.length + "، أضفه بنفسك ثم احفظ:" : " راجعه ثم احفظ.");
  const missing = p.unmatched.map(u => (u.category ? "«" + u.category + "» · " : "") + (u.title || "عنصر") + (u.weight === null ? "" : " (" + weightText(u.weight) + "%)") + " — " + u.reason
    + (u.candidates && u.candidates.length ? " ربما تقصد: " + u.candidates.map(c => "«" + c + "»").join("، ") + "." : ""));
  return { summary, notes: [...p.notes, ...p.assumptions], missing };
}

const mapCategory = (d: Draft, key: string, fn: (c: DraftCategory) => DraftCategory): Draft => ({ categories: d.categories.map(c => (c.key === key ? fn(c) : c)) });

export function addCategory(d: Draft, title = ""): Draft {
  return { categories: [...d.categories, { key: newKey(), categoryId: newId("c"), title, weightText: "", items: [] }] };
}
export const removeCategory = (d: Draft, key: string): Draft => ({ categories: d.categories.filter(c => c.key !== key) });
export const setCategoryTitle = (d: Draft, key: string, title: string): Draft => mapCategory(d, key, c => ({ ...c, title }));
export const setCategoryWeight = (d: Draft, key: string, text: string): Draft => mapCategory(d, key, c => ({ ...c, weightText: text }));
export function addItem(d: Draft, categoryKey: string, source: GbSource): Draft {
  return mapCategory(d, categoryKey, c => ({ ...c, items: [...c.items, { key: newKey(), itemId: newId("i"), weightText: "", source }] }));
}
export const removeItem = (d: Draft, categoryKey: string, itemKey: string): Draft => mapCategory(d, categoryKey, c => ({ ...c, items: c.items.filter(i => i.key !== itemKey) }));
export const setItemWeight = (d: Draft, categoryKey: string, itemKey: string, text: string): Draft =>
  mapCategory(d, categoryKey, c => ({ ...c, items: c.items.map(i => (i.key === itemKey ? { ...i, weightText: text } : i)) }));
export function moveItem(d: Draft, categoryKey: string, itemKey: string, delta: -1 | 1): Draft {
  return mapCategory(d, categoryKey, c => {
    const i = c.items.findIndex(x => x.key === itemKey), j = i + delta;
    if (i < 0 || j < 0 || j >= c.items.length) return c;
    const items = [...c.items];
    [items[i], items[j]] = [items[j], items[i]];
    return { ...c, items };
  });
}

/** n weights in hundredths that add up to exactly 100: the remainder goes to the first ones (3 → 33.34, 33.33, 33.33). */
export function equalWeights(n: number): string[] {
  if (n <= 0) return [];
  const base = Math.floor(10000 / n), rest = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => weightText((base + (i < rest ? 1 : 0)) / 100));
}
export function equalizeCategories(d: Draft): Draft {
  const w = equalWeights(d.categories.length);
  return { categories: d.categories.map((c, i) => ({ ...c, weightText: w[i] })) };
}
export function equalizeItems(d: Draft, categoryKey: string): Draft {
  return mapCategory(d, categoryKey, c => { const w = equalWeights(c.items.length); return { ...c, items: c.items.map((x, i) => ({ ...x, weightText: w[i] })) }; });
}

/** The key that identifies a class-bound source (an assignment or project may be used once); null for a manual column. */
export function sourceKey(s: GbSource): string | null {
  if (s.kind === "assignment") return "assignment:" + s.assignmentId;
  if (s.kind === "project") return "project:" + s.projectCode;
  return null;
}

export type DraftIssue = { at: string; message: string };
export type DraftSummary = {
  categoryTotal: number | null;
  categoriesOk: boolean;
  perCategory: Record<string, { total: number | null; ok: boolean }>;
  /** Problems that block saving. */
  blocking: DraftIssue[];
  /** True when every sum is 100: the saved scheme will be active (with a final mark), not a draft. */
  complete: boolean;
  usedSources: Set<string>;
};

const sumOf = (texts: string[]): number | null => {
  let total = 0;
  for (const t of texts) { const w = parseWeight(t); if (w === null) return null; total += w; }
  return Math.round(total * 100) / 100;
};
const near100 = (n: number | null) => n !== null && Math.abs(n - 100) <= SUM_TOLERANCE;

export function summarize(d: Draft): DraftSummary {
  const blocking: DraftIssue[] = [];
  const usedSources = new Set<string>();
  const perCategory: DraftSummary["perCategory"] = {};
  if (!d.categories.length) blocking.push({ at: "scheme", message: "أضف قسمًا واحدًا على الأقل." });
  if (d.categories.length > LIMITS.categories) blocking.push({ at: "scheme", message: "الحد الأعلى " + LIMITS.categories + " أقسام." });
  for (const c of d.categories) {
    const name = c.title.trim() || "قسم بلا عنوان";
    if (!c.title.trim()) blocking.push({ at: c.key, message: "اكتب عنوان القسم." });
    else if (Array.from(c.title.trim()).length > LIMITS.categoryTitle) blocking.push({ at: c.key, message: "عنوان «" + name + "» أطول من " + LIMITS.categoryTitle + " حرفًا." });
    if (parseWeight(c.weightText) === null) blocking.push({ at: c.key, message: "نسبة «" + name + "» من العلامة النهائية يجب أن تكون رقمًا أكبر من 0 وحتى 100، بمنزلتين عشريتين على الأكثر." });
    if (!c.items.length) blocking.push({ at: c.key, message: "أضف عنصرًا واحدًا على الأقل إلى «" + name + "»." });
    if (c.items.length > LIMITS.itemsPerCategory) blocking.push({ at: c.key, message: "الحد الأعلى " + LIMITS.itemsPerCategory + " عنصرًا في القسم." });
    for (const i of c.items) {
      if (parseWeight(i.weightText) === null) blocking.push({ at: i.key, message: "وزن كل عنصر في «" + name + "» يجب أن يكون رقمًا أكبر من 0 وحتى 100." });
      const k = sourceKey(i.source);
      if (k && usedSources.has(k)) blocking.push({ at: i.key, message: "هذا المصدر مستخدم مرة أخرى في المخطط." });
      if (k) usedSources.add(k);
      if (i.source.kind === "manual") {
        const t = i.source.title.trim();
        if (!t || Array.from(t).length > LIMITS.manualTitle) blocking.push({ at: i.key, message: "عنوان العلامة التي يرصدها المعلم مطلوب، و" + LIMITS.manualTitle + " حرفًا على الأكثر." });
        if (!Number.isInteger(i.source.maxScore) || i.source.maxScore < 1 || i.source.maxScore > LIMITS.manualMaxScore) blocking.push({ at: i.key, message: "العلامة القصوى للعلامة التي يرصدها المعلم رقم صحيح من 1 إلى " + LIMITS.manualMaxScore + "." });
      }
    }
    const total = sumOf(c.items.map(i => i.weightText));
    perCategory[c.key] = { total, ok: c.items.length > 0 && near100(total) };
  }
  const categoryTotal = d.categories.length ? sumOf(d.categories.map(c => c.weightText)) : null;
  const categoriesOk = near100(categoryTotal);
  const complete = categoriesOk && d.categories.every(c => perCategory[c.key].ok);
  return { categoryTotal, categoriesOk, perCategory, blocking, complete, usedSources };
}

/** The scheme the server receives. Call only when summarize(d).blocking is empty. */
export function toPayload(d: Draft): { categories: GbCategory[] } {
  return {
    categories: d.categories.map(c => ({
      categoryId: c.categoryId, title: c.title.trim(), weight: parseWeight(c.weightText) as number,
      items: c.items.map(i => ({ itemId: i.itemId, weight: parseWeight(i.weightText) as number, source: i.source.kind === "manual" ? { ...i.source, title: i.source.title.trim() } : i.source }))
    }))
  };
}

/** Whether the draft differs from what it was opened from (the comparison the save bar and the leave guard use). */
export function isDirty(d: Draft, original: Draft): boolean {
  const shape = (x: Draft) => JSON.stringify(x.categories.map(c => [c.categoryId, c.title, c.weightText, c.items.map(i => [i.itemId, i.weightText, i.source])]));
  return shape(d) !== shape(original);
}

/** What the copy did, in words: how many columns were copied, and each one that was not, with why (and the candidates, if several). */
export function copyReport(p: GbCopyProposal): { summary: string; missing: string[] } {
  const summary = "نُسخ مخطط «" + p.from.name + "»: " + p.copied + " من الأعمدة." + (p.unmatched.length ? " لم يُنسخ " + p.unmatched.length + "، أضف بديلها ثم احفظ:" : " راجعه ثم احفظ.");
  const missing = p.unmatched.map(u => "«" + u.category + "» · " + (u.title || (u.kind === "project" ? "مشروع" : "واجب")) + " (" + u.weight + "%) — " + u.reason
    + (u.candidates && u.candidates.length ? " المرشحون: " + u.candidates.map(c => "«" + c + "»").join("، ") + "." : ""));
  return { summary, missing };
}
