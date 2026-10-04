import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { legacyTypeConversionInstruction } from "./legacyTypeConversionInstruction";

// Phase 19A bundle discipline — PIN (not fail-first): the legacy «convert question type» AI instruction moved verbatim from App.tsx
// into a lazy module. EXPECTED below was produced by evaluating the original inline array of App.tsx at baseline 91b1f3d for every
// legacy target type, so any wording / order / filtering drift in the move fails here.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = { multipleChoice: "أمريكي", fillBlank: "أكمل الناقص", wordBank: "مخزن كلمات", open: "مفتوح", matching: "طابق", ordering: "رتّب" } as const;
const EXPECTED: Record<keyof typeof NAMES, string> = {
  "multipleChoice": "حوّل طريقة عرض هذا السؤال فقط إلى \"أمريكي\".\nممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.\nحافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.\nغيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.\nلا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.\nعند التحويل إلى أمريكي: أنشئ أربعة بدائل معقولة مبنية على نفس السؤال، مع بديل صحيح واحد.",
  "fillBlank": "حوّل طريقة عرض هذا السؤال فقط إلى \"أكمل الناقص\".\nممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.\nحافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.\nغيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.\nلا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.\nعند التحويل إلى أكمل الناقص: أنشئ الفراغات من نفس محتوى السؤال دون إدخال موضوع جديد.",
  "wordBank": "حوّل طريقة عرض هذا السؤال فقط إلى \"مخزن كلمات\".\nممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.\nحافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.\nغيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.\nلا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.\nعند التحويل إلى مخزن كلمات: أنشئ الحقول والكلمات من نفس محتوى السؤال دون إدخال موضوع جديد.",
  "open": "حوّل طريقة عرض هذا السؤال فقط إلى \"مفتوح\".\nممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.\nحافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.\nغيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.\nلا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.\nعند التحويل إلى مفتوح: أزل بدائل الاختيار فقط، وحافظ على نفس المطلوب مع نموذج إجابة صحيح.",
  "matching": "حوّل طريقة عرض هذا السؤال فقط إلى \"طابق\".\nممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.\nحافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.\nغيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.\nلا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.\nعند التحويل إلى طابق: حوّل محتوى السؤال إلى مصطلحات يسارية (حقول) تُطابَق بقائمة يمينية مشتركة (نفس الخيارات لكل حقل)، دون إدخال موضوع جديد.",
  "ordering": "حوّل طريقة عرض هذا السؤال فقط إلى \"رتّب\".\nممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.\nحافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.\nغيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.\nلا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.\nعند التحويل إلى رتّب: حوّل محتوى السؤال إلى عناصر يجب ترتيبها بالتسلسل الصحيح، دون إدخال موضوع جديد."
};

describe("19A — legacy type-conversion instruction moved out of the initial graph, verbatim", () => {
  it("produces exactly the baseline instruction for every legacy target type", () => {
    for (const t of Object.keys(NAMES) as (keyof typeof NAMES)[]) expect(legacyTypeConversionInstruction(t, NAMES[t]), t).toBe(EXPECTED[t]);
  });
  it("App.tsx no longer carries the wording and loads it on demand inside the conversion try block", () => {
    const app = fs.readFileSync(path.join(repo, "src/App.tsx"), "utf8");
    expect(app).not.toContain("ممنوع استبدال السؤال بسؤال آخر");
    expect(app).toMatch(/try \{\s*\/\/[^\n]*\n\s*const instruction = \(await import\("\.\/legacyTypeConversionInstruction"\)\)\.legacyTypeConversionInstruction\(targetType, typeNames\[targetType\]\);/);
  });
});
