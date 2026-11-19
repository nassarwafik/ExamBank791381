// Phase T1 — display metadata for the student tools of StudentToolsSpecV1 (client only; no contract authority).
//
// The contract (ids, closed keys, validation) lives in studentToolsSpec.ts. This catalog only names and describes each tool for the
// teacher's settings panel and the student's tool bar, and records where a tool can answer a question on its own (the Builder turns
// that into a quality warning in a later phase). Every contract tool id must have exactly one entry (pinned by the T1 suite).

import { STUDENT_TOOL_IDS, type StudentToolId } from "./studentToolsSpec";

export type StudentToolCatalogEntry = {
  id: StudentToolId;
  label: string;
  description: string;
  /** Subjects the tool is usually allowed in (a hint for the teacher, never a restriction). */
  subjects: readonly string[];
  /** The kinds of question the tool can solve outright — shown to the teacher before enabling it. */
  answerRisk: string;
  /** Phase T2 — whether the student UI of this tool ships yet. A tool without UI cannot be switched on in the Builder and is never
   *  listed in the student's tool bar (a valid spec may still name it; it simply shows nothing until its phase lands). */
  available: boolean;
};

export const STUDENT_TOOLS_CATALOG: readonly StudentToolCatalogEntry[] = Object.freeze([
  {
    id: "calculator",
    label: "آلة حاسبة",
    description: "العمليات الأساسية والأقواس، ومع النوع العلمي: القوى والجذور واللوغاريتمات والدوال المثلثية ومعكوساتها والمضروب وπ وe.",
    subjects: ["الرياضيات", "الفيزياء", "الكيمياء", "الشبكات"],
    answerRisk: "تحلّ أسئلة الحساب المباشر بالكامل.",
    available: true
  },
  {
    id: "baseConverter",
    label: "محوّل أنظمة العدّ",
    description: "التحويل بين الأنظمة الثنائي والثماني والعشري والست عشري، مع عرض خطوات التحويل اختياريًا.",
    subjects: ["علم الحاسوب", "الشبكات"],
    answerRisk: "تحلّ أسئلة التحويل بين أنظمة العدّ بالكامل، وتعرض خطوات الحل عند تفعيلها.",
    available: true
  },
  {
    id: "graphPlotter",
    label: "راسم الدوال",
    description: "رسم حتى ثلاث دوال معًا، مع التكبير والتحريك وتتبّع المنحنى وقراءة قيمة الدالة عند نقطة.",
    subjects: ["الرياضيات", "الفيزياء"],
    answerRisk: "تكشف شكل الدالة وقيمها، ومع التحليل: الجذور ونقاط التقاطع والقيم القصوى.",
    available: true
  },
  {
    id: "ipv4Calculator",
    label: "حاسبة الشبكات IPv4",
    description: "عنوان الشبكة والبث وأول وآخر عنوان مستخدم وعدد الأجهزة والقناع والقناع العكسي وفئة العنوان ونطاقه، مع الشكل الثنائي وتقسيم الشبكات اختياريًا.",
    subjects: ["الشبكات"],
    answerRisk: "تحلّ أسئلة عنوان الشبكة والبث وعدد الأجهزة بالكامل، وأسئلة تقسيم الشبكات عند تفعيل التقسيم.",
    available: true
  },
  {
    id: "formulaSheet",
    label: "ورقة القوانين",
    description: "ورقة تكتبها أنت (قوانين، ثوابت، جداول، معادلات) يفتحها الطالب أثناء الامتحان.",
    subjects: ["الرياضيات", "الفيزياء", "الكيمياء", "الشبكات"],
    answerRisk: "تعرض ما تكتبه أنت فقط: تأكد أنها لا تتضمن حل سؤال من الامتحان.",
    available: true
  },
  {
    id: "scratchPad",
    label: "ورقة مسودة",
    description: "مساحة للطالب يكتب فيها ملاحظاته ويرسم بالقلم. لا تُحفظ ولا تُرسل ولا تُصحّح، وتُمسح عند مغادرة الصفحة.",
    subjects: ["جميع المواد"],
    answerRisk: "لا تحلّ أي سؤال؛ هي ورق مسودة فقط.",
    available: true
  },
  {
    id: "asciiTable",
    label: "جدول ASCII",
    description: "رموز ASCII مع قيمها بالعشري والست عشري والثماني والثنائي، والبحث بالحرف أو بالرمز.",
    subjects: ["علم الحاسوب", "البرمجة"],
    answerRisk: "تحلّ أسئلة إيجاد رمز ASCII لحرف أو حرف لرمز بالكامل.",
    available: true
  },
  {
    id: "bitwiseCalculator",
    label: "حاسبة العمليات على البتات",
    description: "AND وOR وXOR وNOT وNAND وNOR والإزاحة، على كلمة بطول 8 أو 16 أو 32 بت، مع الناتج بالثنائي والعشري والست عشري.",
    subjects: ["علم الحاسوب", "الشبكات"],
    answerRisk: "تحلّ أسئلة العمليات المنطقية على البتات والإزاحة بالكامل.",
    available: true
  },
  {
    id: "truthTable",
    label: "جدول الحقيقة",
    description: "يكتب الطالب عبارة منطقية (مثل A AND (B OR NOT C)) فيظهر جدول الحقيقة كاملًا مع الحدود الصغرى.",
    subjects: ["علم الحاسوب", "المنطق والدوائر الرقمية"],
    answerRisk: "تحلّ أسئلة بناء جدول الحقيقة لعبارة أو بوابات منطقية بالكامل.",
    available: true
  },
  {
    id: "unitConverter",
    label: "محوّل الوحدات",
    description: "تحويل وحدات الطول والكتلة والزمن والحرارة والسرعة وحجم البيانات وسرعة نقلها (bit وB وkB وKiB وMbps …).",
    subjects: ["الفيزياء", "الكيمياء", "الشبكات"],
    answerRisk: "تحلّ أسئلة التحويل المباشر بين الوحدات المسموحة.",
    available: true
  },
  {
    id: "periodicTable",
    label: "الجدول الدوري",
    description: "العناصر كلها من 1 إلى 118، أو من 1 إلى 36 (نطاق المنهاج)، مع رمز العنصر واسمه وعدده الذري، وكتلته الذرية وتوزيعه الإلكتروني حسب اختيارك.",
    subjects: ["الكيمياء"],
    answerRisk: "تكشف العدد الذري والكتلة الذرية والتوزيع الإلكتروني للعناصر عند تفعيلها.",
    available: true
  }
]);

export function studentToolCatalogEntry(id: StudentToolId): StudentToolCatalogEntry {
  const entry = STUDENT_TOOLS_CATALOG.find(e => e.id === id);
  if (!entry) throw new Error("student tool without a catalog entry: " + id);
  return entry;
}

/** Whether the student UI of this tool ships in this build. */
export function studentToolHasUi(id: StudentToolId): boolean {
  return STUDENT_TOOLS_CATALOG.some(e => e.id === id && e.available);
}

/** Short Arabic names of a spec's tools that have a UI — for the start screen ("الأدوات المسموحة"). */
export function studentToolsSummary(spec: { tools: readonly { id: StudentToolId; variant?: string; title?: string }[] } | undefined): string[] {
  if (!spec) return [];
  return spec.tools.filter(t => studentToolHasUi(t.id)).map(t =>
    t.id === "calculator" ? (t.variant === "basic" ? "آلة حاسبة بسيطة" : "آلة حاسبة علمية")
      : t.id === "formulaSheet" && t.title ? "ورقة القوانين «" + t.title + "»" : studentToolCatalogEntry(t.id).label);
}

export const STUDENT_TOOLS_CATALOG_IDS: readonly StudentToolId[] = STUDENT_TOOL_IDS;
