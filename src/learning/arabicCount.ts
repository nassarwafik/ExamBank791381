// Arabic count phrases, shared by the teacher and student screens. Arabic number agreement depends on the count (1 → singular,
// 2 → dual, 3–10 → plural, 11–99 → singular accusative, 100… → singular), which `Intl.PluralRules("ar")` already
// classifies; each caller supplies the phrase for every category, with `{n}` standing for the number.

export type ArabicCountForms = Record<Intl.LDMLPluralRule, string>;

const rules = new Intl.PluralRules("ar");

/** The phrase for `n` in the grammatically correct Arabic plural category. */
export function arabicCount(n: number, forms: ArabicCountForms): string {
  return forms[rules.select(n)].replace("{n}", String(n));
}

/** «كتاب متاح» agreed with its count (the library count pill). */
export const AVAILABLE_BOOKS: ArabicCountForms = {
  zero: "لا توجد كتب متاحة",
  one: "كتاب واحد متاح",
  two: "كتابان متاحان",
  few: "{n} كتب متاحة",
  many: "{n} كتابًا متاحًا",
  other: "{n} كتاب متاح",
};

/** «درس» agreed with its count (the course-home section details). */
export const LESSONS: ArabicCountForms = {
  zero: "لا دروس",
  one: "درس واحد",
  two: "درسان",
  few: "{n} دروس",
  many: "{n} درسًا",
  other: "{n} درس",
};

/** The phrase for `n` split around its number, so a caller can emphasise the digits («<strong>12</strong> وحدةً …»).
 *  Phrases without a number (one / two / zero: «وحدة واحدة …») come back whole in `before`, with `number` null. */
export function arabicCountParts(n: number, forms: ArabicCountForms): { before: string; number: string | null; after: string } {
  const phrase = forms[rules.select(n)];
  const at = phrase.indexOf("{n}");
  return at < 0 ? { before: phrase, number: null, after: "" } : { before: phrase.slice(0, at), number: String(n), after: phrase.slice(at + 3) };
}

/** «مادة تعليمية مضافة» agreed with its count (the class learning-materials summary). Phase L.0. */
export const ADDED_MATERIALS: ArabicCountForms = {
  zero: "لا مواد تعليمية مضافة",
  one: "مادة تعليمية واحدة مضافة",
  two: "مادتان تعليميتان مضافتان",
  few: "{n} مواد تعليمية مضافة",
  many: "{n} مادةً تعليميةً مضافةً",
  other: "{n} مادة تعليمية مضافة",
};

/** «وحدة منشورة للطلاب» agreed with its count. Phase L.0. */
export const PUBLISHED_MODULES: ArabicCountForms = {
  zero: "لا وحدات منشورة للطلاب",
  one: "وحدة واحدة منشورة للطلاب",
  two: "وحدتان منشورتان للطلاب",
  few: "{n} وحدات منشورة للطلاب",
  many: "{n} وحدةً منشورةً للطلاب",
  other: "{n} وحدة منشورة للطلاب",
};

/** «وحدة غير منشورة» agreed with its count. Phase L.0. */
export const HIDDEN_MODULES: ArabicCountForms = {
  zero: "لا وحدات غير منشورة",
  one: "وحدة واحدة غير منشورة",
  two: "وحدتان غير منشورتين",
  few: "{n} وحدات غير منشورة",
  many: "{n} وحدةً غيرَ منشورة",
  other: "{n} وحدة غير منشورة",
};

/** «صفحة» agreed with its count (the unit contents on a unit-opener page). Phase L.1. */
export const PAGES: ArabicCountForms = {
  zero: "لا صفحات",
  one: "صفحة واحدة",
  two: "صفحتان",
  few: "{n} صفحات",
  many: "{n} صفحةً",
  other: "{n} صفحة",
};

/** «طالب» agreed with its count (the teacher's class-reading panel). Phase L.4. */
export const STUDENTS: ArabicCountForms = {
  zero: "لا طلاب",
  one: "طالب واحد",
  two: "طالبان",
  few: "{n} طلاب",
  many: "{n} طالبًا",
  other: "{n} طالب",
};

/** «طالب» after a preposition or as the object of an action («على طالبَين»، «نقل 3 طلاب»): the dual is genitive. Phase U.2. */
export const STUDENTS_GENITIVE: ArabicCountForms = {
  zero: "لا طلاب",
  one: "طالب واحد",
  two: "طالبين",
  few: "{n} طلاب",
  many: "{n} طالبًا",
  other: "{n} طالب",
};

/** «طالب محدد» agreed with its count (the bulk-action bar). Phase U.2. */
export const SELECTED_STUDENTS: ArabicCountForms = {
  zero: "لا طلاب محددون",
  one: "طالب واحد محدد",
  two: "طالبان محددان",
  few: "{n} طلاب محددون",
  many: "{n} طالبًا محددًا",
  other: "{n} طالب محدد",
};

/** «طالب» after a number that is always shown as digits (a count chip: «3 طلاب»، «24 طالبًا»; 1 and 2 keep the digit). Phase U.2. */
export const STUDENTS_AFTER_DIGITS: ArabicCountForms = {
  zero: "{n} طالب",
  one: "{n} طالب",
  two: "{n} طالب",
  few: "{n} طلاب",
  many: "{n} طالبًا",
  other: "{n} طالب",
};
