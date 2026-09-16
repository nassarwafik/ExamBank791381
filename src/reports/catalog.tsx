// Reports Center catalog (UX-6b): the eight report types, their categories/groups, period options and
// time-awareness. Presentation metadata only — API types and query semantics live in ReportViews.
import type { ReactNode } from "react";
import type { ReportType } from "./ReportViews";
import type { Period } from "./period";
import { IconStudents, IconUser, IconAssignments, IconProjects, IconReports, IconCheck, IconWarning, IconHistory } from "../icons";

export type Category = "all" | "students" | "assessments" | "projects";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "كل الفترة" }, { key: "7", label: "آخر 7 أيام" }, { key: "30", label: "آخر 30 يومًا" },
  { key: "year", label: "هذه السنة الدراسية" }, { key: "custom", label: "مخصص" }
];
// Reports whose data has a time dimension (assessments/timeline). Others (project snapshot) ignore the range.
export const TIME_AWARE: ReportType[] = ["class", "student", "assignments", "timeline"];
export type Need = "class" | "student" | "project";
export type Card = { type: ReportType; icon: ReactNode; title: string; desc: string; category: Category; needs: Need[] };

export const REPORT_CARDS: Card[] = [
  { type: "class", icon: <IconStudents size={20} />, title: "تقرير الصف", desc: "ملخّص الصف: التقييمات والتسليم والمشاريع.", category: "students", needs: ["class"] },
  { type: "student", icon: <IconUser size={20} />, title: "تقرير الطالب", desc: "أداء الطالب في التقييمات وتقدّمه في مشاريع صفه.", category: "students", needs: ["student"] },
  { type: "assignments", icon: <IconAssignments size={20} />, title: "التقييمات والواجبات", desc: "المتوسطات ونِسب التسليم ومصفوفة الطالب × التقييم.", category: "assessments", needs: ["class"] },
  { type: "project", icon: <IconProjects size={20} />, title: "تقرير المشروع", desc: "تقدّم الصف في المشروع وإحصائياته.", category: "projects", needs: ["project", "class"] },
  { type: "track", icon: <IconReports size={20} />, title: "تقرير المسار", desc: "حالة كل مرحلة داخل مسار.", category: "projects", needs: ["project", "class"] },
  { type: "ready", icon: <IconCheck size={20} />, title: "جاهز للفحص", desc: "المراحل بانتظار الاعتماد، مجمّعة بالطالب.", category: "projects", needs: ["project", "class"] },
  { type: "delayed", icon: <IconWarning size={20} />, title: "المتأخرون", desc: "الطلاب المتأخرون حسب إعداد الصف.", category: "projects", needs: ["project", "class"] },
  { type: "timeline", icon: <IconHistory size={20} />, title: "التقدم الزمني", desc: "تطوّر تقدّم المشروع أسبوعيًا.", category: "projects", needs: ["project", "class"] }
];
export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "students", label: "الطلاب" },
  { key: "assessments", label: "التقييمات والواجبات" }, { key: "projects", label: "المشاريع" }
];
export const GROUPS: { key: Exclude<Category, "all">; title: string; description: string }[] = [
  { key: "students", title: "الطلاب والصفوف", description: "ملخصات تجمع التقييمات والمشاريع لصف أو لطالب." },
  { key: "assessments", title: "التقييمات والواجبات", description: "تحليل نتائج آخر محاولة مسلّمة لكل تقييم." },
  { key: "projects", title: "المشاريع", description: "تحليل تقدّم المشروع لصف مسجَّل فيه — القراءة فقط؛ الاعتماد من مساحة المشاريع." }
];
