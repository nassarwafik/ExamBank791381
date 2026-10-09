// Phase 16A — PRESENTATION text for the palette (descriptions, icons, capability chips). Kept out of the pure catalog so the
// initial graph carries only identity / capability metadata; loaded with the lazy palette. A plugin may still carry its own
// `description` / `icon` in its definition — these lookups fall back to them.
import type { QuestionTypeDefinition } from "../questionTypeCatalog";
import { GRADING_MODE_LABELS } from "../questionTypeAliases";

const DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  multipleChoice: "إجابة صحيحة واحدة من عدة خيارات.", trueFalse: "عبارة واحدة يحكم عليها الطالب.", multiTrueFalse: "عدة عبارات مستقلة، لكل منها حكم.",
  shortAnswer: "نص حر، مع إجابة نموذجية اختيارية أو مراجعة يدوية.", fillBlank: "فراغات تُكمَل من قائمة أو كتابة.", wordBank: "فراغات تُملأ من مخزن كلمات مشترك.",
  matching: "مطابقة كل عنصر بإجابته الصحيحة.", ordering: "ترتيب عناصر في تسلسل صحيح.", tableFill: "خلايا جدول قابلة للإجابة.", cliFill: "فراغات داخل أوامر سطر الأوامر.",
  compound: "بنود مستقلة بأنواع مختلفة ضمن سؤال واحد.",
  composite: "سؤال مركّب متقدّم: مجموعات بنود من أنواع حديثة (برمجة، محاكاة، رقمي متغير، صور، إجابة مفتوحة…) مع نص أو كود أو محاكاة مشتركة واحدة تخدم عدة بنود، وقاعدة «أول عدد محدد» لكل مجموعة.", multipleSelect: "عدة إجابات صحيحة؛ تصحيح كامل أو جزئي مع أو بدون خصم.", numericResponse: "قيمة عددية بتسامح أو ضمن مدى، مع وحدة اختيارية.",
  matrix: "صفوف وأعمدة؛ إجابة واحدة لكل صف مع علامة جزئية.", categorization: "إسناد كل عنصر إلى فئته الصحيحة مع علامة جزئية.",
  simulation: "محاكاة تفاعلية من حزمة .smartsim مرفوعة تعمل في بيئة معزولة؛ تُحفظ حالة الطالب وتُراجع يدويًا.",
  coding: "يكتب الطالب برنامجًا كاملًا بلغة يحددها المعلم؛ كود ابتدائي وأمثلة ظاهرة واختبارات مخفية، ومراجعة يدوية حاليًا.",
  networkCli: "طرفية محاكاة لمبدّل شبكة بأوامر على نمط Cisco (VLAN، منافذ access/trunk، SVI)؛ تُصحَّح الحالة النهائية للجهاز تلقائيًا بعلامة جزئية.",
  inlineCloze: "فقرة بفراغات داخل النص نفسه: فراغ كتابة أو قائمة منسدلة بأي ترتيب؛ تصحيح تلقائي لكل فراغ مع علامة جزئية.",
  hotspot: "يرى الطالب صورة وينقر على الموضع أو المواضع المطلوبة؛ يرسم المعلم المناطق الصحيحة على الصورة، وتصحيح تلقائي بعلامة جزئية.",
  labelDiagram: "يضع الطالب تسميات من بنك على مناطق ظاهرة في الرسم (سحبًا أو اختيارًا)؛ تصحيح تلقائي لكل منطقة بعلامة جزئية.",
  chartSelection: "يختار الطالب من رسم بياني تفاعلي فئة أو سلسلة أو قيمة أو نقطة أو نطاقًا (بالنقر أو بلوحة المفاتيح)؛ تصحيح تلقائي على معنى البيانات لا على البكسلات.",
  functionGraphSelection: "رسم دالة رياضية من تعبير يكتبه المعلم (y = f(x)، دوال متعددة القواعد، منحنيات وسيطية)؛ يختار الطالب منحنى أو نقطة أو مستقيمًا أو مماسًا أو منطقة، وتصحيح تلقائي على العناصر لا على البكسلات.",
  scene3DSelection: "نموذج 3D قابل للدوران والتكبير مع اختيار دلالي وتصحيح تلقائي.",
  openResponse: "مقال أو شرح أو تعليل أو مقارنة أو تحليل: يكتب الطالب إجابة نصية، ويصحّحها المعلم بسلم تقييم (معايير ومستويات) ويحسب الخادم الدرجة.",
  smartSim: "محاكاة موثوقة من المنصة نفسها (أولها مخطط شبكة: راوتر وسويتش وحواسيب): يضبط الطالب الأجهزة داخل الامتحان، ويُعاد بناء الحالة على الخادم وتُصحَّح فحوص خاصة بأوزان مع علامة جزئية.",
  parametricNumeric: "سؤال رقمي بمعطيات متغيرة: قيم مختلفة لكل طالب ومحاولة من متغيرات وقيود، وتعبير إجابة خاص يُحسب على الخادم؛ تصحيح تلقائي بتسامح أو مدى."
});
const ICONS: Readonly<Record<string, string>> = Object.freeze({ chartSelection: "▥", functionGraphSelection: "∿", scene3DSelection: "◇3D", multipleChoice: "◉", trueFalse: "✓", multiTrueFalse: "☑", shortAnswer: "✎", fillBlank: "▭", wordBank: "▤", matching: "⇄", ordering: "↕", tableFill: "▦", cliFill: ">_", compound: "▣", composite: "▣▣", multipleSelect: "☑☑", numericResponse: "#", matrix: "⊞", categorization: "⊟", simulation: "⚙", coding: "</>", networkCli: ">#", inlineCloze: "▭▾", parametricNumeric: "ƒx", hotspot: "⌖", labelDiagram: "⊡", openResponse: "¶", smartSim: "⧉" });
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
