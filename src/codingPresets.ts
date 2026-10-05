// Phase 19F — ADVANCED CODING QUESTION MODES as AUTHORING PRESETS. A preset is not a question type and stores no marker: it is a
// factory that creates an EXISTING type at an EXISTING version with example content the teacher edits (the stored question is
// exactly what the canonical editors would produce by hand). Six modes:
//   writeProgram   → coding@2  (full program; the language's minimal starter shell)
//   fixBug         → coding@2  (a deliberately buggy program as the starter code)
//   completeCode   → coding@2  (a program with a marked part to complete; the whole source stays editable)
//   lockedTemplate → coding@3  (locked text + editable gaps; the server rebuilds the official program — the ONLY coding@3 path)
//   predictOutput  → multipleChoice or shortAnswer + a read-only code stimulus (auto-graded by the existing graders; no runner)
//   traceExecution → tableFill + a read-only code stimulus (one answer cell per traced value; partial credit; no runner)
// Hidden tests are NEVER created here: an official coding grade needs hidden tests the TEACHER writes and verifies (manual grading
// until then). Pure: no React, no DOM.
import type { BuilderQuestion } from "./examTypes";
import { newQuestion, newField } from "./examBuilderState";
import { codingStarterTemplate } from "./codingLanguages";
import type { CodingTemplateSegment } from "./codingTemplate";

export type CodingPresetKey = "writeProgram" | "fixBug" | "completeCode" | "lockedTemplate" | "predictOutput" | "traceExecution";
export type CodingPresetLanguage = "python" | "java" | "csharp";
export type CodingPresetOptions = { language?: CodingPresetLanguage; vehicle?: "multipleChoice" | "shortAnswer" };
export type CodingPresetDefinition = { key: CodingPresetKey; label: string; description: string; creates: string };

export const CODING_PRESET_LANGUAGES: readonly CodingPresetLanguage[] = Object.freeze(["python", "java", "csharp"]);
/** The six modes in the order the palette shows them; `creates` says EXACTLY what is stored. */
export const CODING_PRESETS: readonly CodingPresetDefinition[] = Object.freeze([
  { key: "writeProgram", label: "كتابة برنامج كامل", description: "يكتب الطالب البرنامج كاملًا من البداية.", creates: "سؤال برمجة (الإصدار 2) بكود ابتدائي أدنى للغة." },
  { key: "fixBug", label: "إصلاح خطأ", description: "برنامج فيه خطأ مقصود يجده الطالب ويصلحه.", creates: "سؤال برمجة (الإصدار 2) كوده الابتدائي برنامج فيه خطأ؛ الكود كله قابل للتعديل." },
  { key: "completeCode", label: "إكمال كود", description: "برنامج ناقص بجزء معلَّم يكمله الطالب.", creates: "سؤال برمجة (الإصدار 2) كوده الابتدائي برنامج ناقص؛ الكود كله قابل للتعديل." },
  { key: "lockedTemplate", label: "إكمال كود بأجزاء مقفلة", description: "أجزاء مقفلة لا تُعدَّل وفراغات يكتب فيها الطالب فقط.", creates: "سؤال برمجة (الإصدار 3 — قالب مقفل) بلغة واحدة؛ يعيد الخادم بناء البرنامج من القالب المنشور." },
  { key: "predictOutput", label: "توقع الناتج", description: "كود للقراءة فقط ويختار الطالب ناتجه أو يكتبه.", creates: "اختيار من متعدد (أو إجابة قصيرة) مع كود مرفق للقراءة فقط؛ لا يُشغَّل أي كود." },
  { key: "traceExecution", label: "تتبع التنفيذ", description: "كود للقراءة فقط وجدول يملؤه الطالب بقيم المتغيرات.", creates: "تعبئة جدول مع كود مرفق للقراءة فقط؛ لكل خلية إجابة صحيحة ودرجة جزئية." }
]);
export const isCodingPresetKey = (v: unknown): v is CodingPresetKey => typeof v === "string" && CODING_PRESETS.some(p => p.key === v);

// ── Example content (data, per language; the teacher edits all of it) ───────────────────────────────────────────────────────────
const SUM_BUGGY: Record<CodingPresetLanguage, string> = {
  python: "n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)\n",
  java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        int n = in.nextInt();\n        int total = 0;\n        for (int i = 1; i < n; i++) {\n            total += i;\n        }\n        System.out.println(total);\n    }\n}\n",
  csharp: "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        int total = 0;\n        for (int i = 1; i < n; i++)\n        {\n            total += i;\n        }\n        Console.WriteLine(total);\n    }\n}\n"
};
const SUM_INCOMPLETE: Record<CodingPresetLanguage, string> = {
  python: "n = int(input())\ntotal = 0\n# أكمل: أضف الأعداد من 1 إلى n إلى total\n\nprint(total)\n",
  java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        int n = in.nextInt();\n        int total = 0;\n        // أكمل: أضف الأعداد من 1 إلى n إلى total\n\n        System.out.println(total);\n    }\n}\n",
  csharp: "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        int total = 0;\n        // أكمل: أضف الأعداد من 1 إلى n إلى total\n\n        Console.WriteLine(total);\n    }\n}\n"
};
const SUM_TEMPLATE: Record<CodingPresetLanguage, CodingTemplateSegment[]> = {
  python: [
    { kind: "locked", text: "n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n" },
    { kind: "editable", id: "gap1", starter: "    pass\n" },
    { kind: "locked", text: "print(total)\n" }
  ],
  java: [
    { kind: "locked", text: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        int n = in.nextInt();\n        int total = 0;\n        for (int i = 1; i <= n; i++) {\n" },
    { kind: "editable", id: "gap1", starter: "            \n" },
    { kind: "locked", text: "        }\n        System.out.println(total);\n    }\n}\n" }
  ],
  csharp: [
    { kind: "locked", text: "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        int total = 0;\n        for (int i = 1; i <= n; i++)\n        {\n" },
    { kind: "editable", id: "gap1", starter: "            \n" },
    { kind: "locked", text: "        }\n        Console.WriteLine(total);\n    }\n}\n" }
  ]
};
// x starts at 3 and doubles twice → prints 12 (trace: after i = 0 → 6, after i = 1 → 12).
const DOUBLING: Record<CodingPresetLanguage, string> = {
  python: "x = 3\nfor i in range(2):\n    x = x * 2\nprint(x)\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        int x = 3;\n        for (int i = 0; i < 2; i++) {\n            x = x * 2;\n        }\n        System.out.println(x);\n    }\n}\n",
  csharp: "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        int x = 3;\n        for (int i = 0; i < 2; i++)\n        {\n            x = x * 2;\n        }\n        Console.WriteLine(x);\n    }\n}\n"
};

const coding = (language: CodingPresetLanguage, starter: string): Record<string, unknown> => ({
  allowedLanguages: [language], defaultLanguage: language, starterCode: starter === "" ? {} : { [language]: starter },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: []
});
const SUM_PUBLIC_TEST = { id: "sample1", title: "مثال", input: "4\n", sampleOutput: "10\n" };

/**
 * Builds the question a preset creates (a new identity each call). Unknown preset ⇒ null (never a guess). The language defaults to
 * Python; `vehicle` selects multipleChoice (default) or shortAnswer for predictOutput.
 */
export function buildCodingPreset(key: unknown, options: CodingPresetOptions = {}): BuilderQuestion | null {
  if (!isCodingPresetKey(key)) return null;
  const language: CodingPresetLanguage = options.language && CODING_PRESET_LANGUAGES.includes(options.language) ? options.language : "python";
  switch (key) {
    case "writeProgram":
      return newQuestion("coding", { questionTypeVersion: 2, marks: 10, text: "اكتب برنامجًا يقرأ عددًا صحيحًا n ثم يطبع مجموع الأعداد من 1 إلى n.", coding: { ...coding(language, codingStarterTemplate(language)), publicTests: [SUM_PUBLIC_TEST] } as never });
    case "fixBug":
      return newQuestion("coding", { questionTypeVersion: 2, marks: 10, text: "البرنامج التالي يجب أن يطبع مجموع الأعداد من 1 إلى n، لكنه يحتوي خطأً. جد الخطأ وأصلحه.", coding: { ...coding(language, SUM_BUGGY[language]), publicTests: [SUM_PUBLIC_TEST] } as never });
    case "completeCode":
      return newQuestion("coding", { questionTypeVersion: 2, marks: 10, text: "أكمل البرنامج التالي ليطبع مجموع الأعداد من 1 إلى n.", coding: { ...coding(language, SUM_INCOMPLETE[language]), publicTests: [SUM_PUBLIC_TEST] } as never });
    case "lockedTemplate":
      return newQuestion("coding", { questionTypeVersion: 3, marks: 10, text: "أكمل الفراغ في البرنامج التالي ليطبع مجموع الأعداد من 1 إلى n. الأجزاء المقفلة لا يمكن تعديلها.", coding: { ...coding(language, ""), publicTests: [SUM_PUBLIC_TEST], template: { language, segments: SUM_TEMPLATE[language].map(s => ({ ...s })) } } as never });
    case "predictOutput": {
      const codeStimulus = { language, source: DOUBLING[language], label: "البرنامج" };
      if (options.vehicle === "shortAnswer") return newQuestion("shortAnswer", { marks: 2, text: "ما الناتج الذي يطبعه البرنامج التالي؟", codeStimulus, answer: { text: "12" } });
      return newQuestion("multipleChoice", { marks: 2, text: "ما الناتج الذي يطبعه البرنامج التالي؟", codeStimulus, options: [{ text: "12" }, { text: "6" }, { text: "8" }, { text: "3" }], answer: { correctOptionIndex: 0 } });
    }
    case "traceExecution":
      return newQuestion("tableFill", {
        marks: 4, text: "تتبّع تنفيذ البرنامج التالي واكتب قيمة x بعد كل تكرار للحلقة.",
        codeStimulus: { language, source: DOUBLING[language], label: "البرنامج" },
        tableHeaders: ["التكرار (i)", "قيمة x بعد التكرار"], tableRows: [["0", ""], ["1", ""]],
        fields: [newField({ kind: "text", row: 0, column: 1, correct: "6" }), newField({ kind: "text", row: 1, column: 1, correct: "12" })]
      });
  }
}
