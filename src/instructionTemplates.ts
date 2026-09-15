// Roadmap #17 — built-in INSTRUCTION TEMPLATES. A template is only a STARTING POINT of plain text that
// fills the EXISTING instruction fields (exam/general, cover, section). No new schema, no persistence, no
// AI. The exam stores the resulting TEXT, never a template id, so an exam with no template metadata keeps
// working and the teacher can freely edit the text afterward. Instruction text is PRESENTATION ONLY — it
// never derives or changes any grading rule (gradingPolicy / requiredAnswers / maxMarks / answerUnit).

export type InstructionTemplate = { id: string; label: string; text: string };

// A. Exam-level / general (and cover) instruction sets. Multi-line: each line is one plain bullet.
export const GENERAL_INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
  { id: "general-exam", label: "امتحان عام", text: "اقرأ جميع الأسئلة جيدًا قبل الإجابة.\nأجب حسب التعليمات في كل قسم.\nراجع إجاباتك قبل التسليم." },
  { id: "computerized", label: "امتحان محوسب", text: "تأكد من حفظ إجاباتك قبل التسليم.\nلا تغلق صفحة الامتحان أثناء الحل.\nعند حدوث مشكلة في الاتصال انتظر عودة الاتصال." },
  { id: "training", label: "تدريب", text: "هذا النشاط للتدريب والمراجعة.\nيمكنك حل الأسئلة بالترتيب المناسب.\nراجع الإجابات قبل إنهاء التدريب." },
  { id: "open-material", label: "مواد مسموحة", text: "يسمح باستخدام المادة/الكتاب حسب تعليمات المعلم.\nيمنع التواصل مع طلاب آخرين أثناء الحل." },
  { id: "short-quiz", label: "اختبار قصير", text: "أجب عن جميع الأسئلة.\nانتبه للوقت المحدد." }
];

// C. Section-level instruction patterns (usually a single line). Presentation only — applying one MUST
// NOT touch the section's gradingPolicy/requiredAnswers/maxMarks/answerUnit.
export const SECTION_INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
  { id: "answer-all", label: "أجب عن الكل", text: "أجب عن جميع الأسئلة في هذا القسم." },
  { id: "answer-n", label: "أجب عن عدد", text: "أجب عن X أسئلة فقط." },
  { id: "choose-correct", label: "اختر الصحيح", text: "اختر الإجابة الصحيحة." },
  { id: "fill-blanks", label: "أكمل الفراغات", text: "أكمل الفراغات." },
  { id: "execute", label: "نفّذ الأوامر", text: "نفّذ الأوامر المطلوبة." }
];

export const findGeneralInstructionTemplate = (id: string): InstructionTemplate | undefined =>
  GENERAL_INSTRUCTION_TEMPLATES.find(t => t.id === id);
export const findSectionInstructionTemplate = (id: string): InstructionTemplate | undefined =>
  SECTION_INSTRUCTION_TEMPLATES.find(t => t.id === id);
