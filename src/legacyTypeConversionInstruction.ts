import type { ExamQuestion } from "./App";

// Phase 19A bundle discipline — the legacy builder's «convert question type» AI instruction, moved VERBATIM out of App.tsx into
// a lazy module: the text is needed only when a teacher clicks a conversion button, so it no longer ships in the initial graph.
// The wording, order and filtering are unchanged (pinned by legacyTypeConversionInstruction.test.ts).
export function legacyTypeConversionInstruction(targetType: ExamQuestion["presentationType"], targetName: string): string {
  return [
    `حوّل طريقة عرض هذا السؤال فقط إلى "${targetName}".`,
    "ممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.",
    "حافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.",
    "غيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.",
    "لا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.",
    targetType === "open"
      ? "عند التحويل إلى مفتوح: أزل بدائل الاختيار فقط، وحافظ على نفس المطلوب مع نموذج إجابة صحيح."
      : "",
    targetType === "multipleChoice"
      ? "عند التحويل إلى أمريكي: أنشئ أربعة بدائل معقولة مبنية على نفس السؤال، مع بديل صحيح واحد."
      : "",
    targetType === "fillBlank"
      ? "عند التحويل إلى أكمل الناقص: أنشئ الفراغات من نفس محتوى السؤال دون إدخال موضوع جديد."
      : "",
    targetType === "wordBank"
      ? "عند التحويل إلى مخزن كلمات: أنشئ الحقول والكلمات من نفس محتوى السؤال دون إدخال موضوع جديد."
      : "",
    targetType === "matching"
      ? "عند التحويل إلى طابق: حوّل محتوى السؤال إلى مصطلحات يسارية (حقول) تُطابَق بقائمة يمينية مشتركة (نفس الخيارات لكل حقل)، دون إدخال موضوع جديد."
      : "",
    targetType === "ordering"
      ? "عند التحويل إلى رتّب: حوّل محتوى السؤال إلى عناصر يجب ترتيبها بالتسلسل الصحيح، دون إدخال موضوع جديد."
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}
