import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { legacyExportInstructionsForAI } from "./legacyExportInstructions";

// Phase 19B bundle discipline — PIN (not fail-first): the legacy «ExamBank AI Export» instruction list moved verbatim from App.tsx
// into a lazy module. EXPECTED below was extracted from the original inline array of App.tsx at baseline b8aa6ce, so any wording /
// order drift in the move fails here.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED: string[] = [
  "أنشئ مستند امتحان احترافيًا وجاهزًا للطباعة بصيغة PDF وحجم A4.",
  "لغة الامتحان العربية واتجاه الكتابة من اليمين إلى اليسار RTL.",
  "استخدم بيانات metadata في رأس الامتحان: المدرسة، الموضوع، الصف، الشعبة، المعلم، التاريخ، المدة والفصل الدراسي.",
  "أضف في رأس نسخة الطالب خانة فارغة لاسم الطالب وخانة لرقم الهوية.",
  "لا تغير نص الأسئلة أو القيم أو الخيارات أو الإجابات الصحيحة.",
  "صحح التنسيق فقط ولا تغير المحتوى العلمي.",
  "حافظ على المصطلحات التقنية الإنجليزية وعناوين IP وCLI كما هي.",
  "حوّل المعطيات التي تناسب الجداول إلى جداول واضحة ومنظمة.",
  "ضع كل قيمة في خلية مستقلة واترك خانات مناسبة لإجابة الطالب.",
  "في أسئلة مخزن الكلمات اعرض مخزن الكلمات في صندوق واضح ثم الفراغات تحته.",
  "في الاختيار من متعدد رتّب الخيارات بوضوح وبمسافات مريحة.",
  "استخدم الصور المرفقة مع السؤال نفسه ولا تنقل صورة إلى سؤال آخر.",
  "لا تكشف الإجابات في نسخة الطالب.",
  "أنشئ أولًا نسخة الطالب كاملة بدون الحلول.",
  "بعد انتهاء نسخة الطالب أنشئ قسمًا منفصلًا بعنوان نموذج الإجابة للمعلم.",
  "في نموذج الإجابة اذكر رقم السؤال والإجابة الصحيحة والعلامة.",
  "اجعل التصميم أكاديميًا بسيطًا وأنيقًا ومناسبًا لمدرسة ثانوية.",
  "لا تضف أسئلة جديدة ولا تحذف أي سؤال."
];

describe("19B — legacy AI-export instructions moved out of the initial graph, verbatim", () => {
  it("returns exactly the baseline list, as a fresh array each time", () => {
    expect(legacyExportInstructionsForAI()).toEqual(EXPECTED);
    const a = legacyExportInstructionsForAI(); a.push("x");
    expect(legacyExportInstructionsForAI()).toEqual(EXPECTED);
  });
  it("App.tsx no longer carries the wording and loads it on demand inside the export try block", () => {
    const app = fs.readFileSync(path.join(repo, "src/App.tsx"), "utf8");
    expect(app).not.toContain("أنشئ مستند امتحان احترافيًا وجاهزًا للطباعة");
    expect(app).toMatch(/const \{ legacyExportInstructionsForAI \} = await import\("\.\/legacyExportInstructions"\);/);
    expect(app).toContain("instructionsForAI: legacyExportInstructionsForAI(),");
  });
});
