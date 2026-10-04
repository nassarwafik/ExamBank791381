// Phase 19B bundle discipline — the legacy «ExamBank AI Export» instruction list, moved VERBATIM out of App.tsx into a lazy module:
// it is needed only when a teacher downloads the AI export file, so it no longer ships in the initial graph. Wording and order are
// unchanged (pinned by legacyExportInstructions.test.ts); a fresh array is returned for every export document.
const INSTRUCTIONS: readonly string[] = Object.freeze([
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
]);
export function legacyExportInstructionsForAI(): string[] {
  return [...INSTRUCTIONS];
}
