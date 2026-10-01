// Phase 16A — PRESENTATION text for the palette (descriptions, icons, capability chips). Kept out of the pure catalog so the
// initial graph carries only identity / capability metadata; loaded with the lazy palette. A plugin may still carry its own
// `description` / `icon` in its definition — these lookups fall back to them.
import type { QuestionTypeDefinition } from "../questionTypeCatalog";
import { GRADING_MODE_LABELS } from "../questionTypeAliases";

const DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  multipleChoice: "إجابة صحيحة واحدة من عدة خيارات.", trueFalse: "عبارة واحدة يحكم عليها الطالب.", multiTrueFalse: "عدة عبارات مستقلة، لكل منها حكم.",
  shortAnswer: "نص حر، مع إجابة نموذجية اختيارية أو مراجعة يدوية.", fillBlank: "فراغات تُكمَل من قائمة أو كتابة.", wordBank: "فراغات تُملأ من مخزن كلمات مشترك.",
  matching: "مطابقة كل عنصر بإجابته الصحيحة.", ordering: "ترتيب عناصر في تسلسل صحيح.", tableFill: "خلايا جدول قابلة للإجابة.", cliFill: "فراغات داخل أوامر سطر الأوامر.",
  compound: "بنود مستقلة بأنواع مختلفة ضمن سؤال واحد.", multipleSelect: "عدة إجابات صحيحة؛ تصحيح كامل أو جزئي مع أو بدون خصم.", numericResponse: "قيمة عددية بتسامح أو ضمن مدى، مع وحدة اختيارية.",
  matrix: "صفوف وأعمدة؛ إجابة واحدة لكل صف مع علامة جزئية.", categorization: "إسناد كل عنصر إلى فئته الصحيحة مع علامة جزئية.",
  simulation: "محاكاة تفاعلية من حزمة .smartsim مرفوعة تعمل في بيئة معزولة؛ تُحفظ حالة الطالب وتُراجع يدويًا.",
  coding: "يكتب الطالب برنامجًا كاملًا بلغة يحددها المعلم؛ كود ابتدائي وأمثلة ظاهرة واختبارات مخفية، ومراجعة يدوية حاليًا."
});
const ICONS: Readonly<Record<string, string>> = Object.freeze({ multipleChoice: "◉", trueFalse: "✓", multiTrueFalse: "☑", shortAnswer: "✎", fillBlank: "▭", wordBank: "▤", matching: "⇄", ordering: "↕", tableFill: "▦", cliFill: ">_", compound: "▣", multipleSelect: "☑☑", numericResponse: "#", matrix: "⊞", categorization: "⊟", simulation: "⚙", coding: "</>" });
// Phase 17A — factual chips that replace the generic grading-mode chip where the CURRENT behaviour differs from the type's
// designed mode: coding@1 is designed hybrid but grades manually until a trusted executor exists — never «تصحيح تلقائي».
const GRADING_CHIP_OVERRIDES: Readonly<Record<string, readonly string[]>> = Object.freeze({ coding: Object.freeze(["تصحيح يدوي حاليًا", "إجابة برمجية"]) });

export const typeDescription = (d: QuestionTypeDefinition): string => d.description || DESCRIPTIONS[d.key] || "";
export const typeIcon = (d: QuestionTypeDefinition): string => d.icon || ICONS[d.key] || "▫";
export function chipsFor(d: QuestionTypeDefinition): string[] {
  const chips = [...(GRADING_CHIP_OVERRIDES[d.key] ?? [GRADING_MODE_LABELS[d.gradingMode]])];
  if (d.capabilities.partialCredit) chips.push("علامة جزئية");
  if (d.capabilities.compoundPart) chips.push("يدعم السؤال المركب");
  if (d.capabilities.interactive) chips.push("تفاعلي");
  if (d.capabilities.requiresImage) chips.push("يحتاج صورة");
  if (!d.capabilities.offline) chips.push("يحتاج اتصالًا");
  return chips;
}
