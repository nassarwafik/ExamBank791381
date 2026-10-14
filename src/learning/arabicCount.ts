// Arabic count phrases for Learning Materials labels. Arabic number agreement depends on the count (1 → singular,
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
