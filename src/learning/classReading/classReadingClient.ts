import type { ClassLearningMaterial, Classroom, LearningCatalogCourse } from "../../students/types";

// Phase L.4 — the teacher's transport for the book page's «قراءة صفوفي» panel. The host supplies the teacher headers; every
// path is an existing class-scoped teacher endpoint (the server owns tenancy, publication rules and the class membership).

export type ClassReadingModule = { moduleId: string; title: string; order: number; total: number; started: number; completed: number; averageRead: number };
export type ClassReadingStudent = { userId: string; displayName: string; code: string; modules: Record<string, number>; readPages: number; totalPages: number; lastReadAt: string | null };
export type ClassReading = { classId: string; courseId: string; generatedAt: string; totalPages: number; modules: ClassReadingModule[]; students: ClassReadingStudent[] };

export type ClassReadingClient = {
  /** The teacher's classes (their own and legacy shared ones, as /api/classrooms reports them). */
  classes: () => Promise<Classroom[]>;
  /** The publishable courses with their units in content order. */
  catalog: () => Promise<LearningCatalogCourse[]>;
  /** How far one class has read one book (published units only). */
  reading: (classId: string, courseId: string) => Promise<ClassReading>;
  /** Replace the units published to a class; resolves with the class's normalized learning materials. */
  publish: (classId: string, courseId: string, moduleIds: string[]) => Promise<ClassLearningMaterial[]>;
};

export class ClassReadingError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function createClassReadingClient(headers: Record<string, string>): ClassReadingClient {
  async function call<T>(url: string, fallback: string, init: RequestInit = {}): Promise<T> {
    let r: Response;
    try {
      r = await fetch(url, { ...init, headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    } catch {
      throw new ClassReadingError(0, fallback);
    }
    const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    if (!r.ok || j.ok !== true) throw new ClassReadingError(r.status, typeof j.error === "string" && j.error ? j.error : fallback);
    return j;
  }
  return {
    classes: async () => {
      const j = await call<{ classes?: Classroom[] }>("/api/classrooms", "تعذر تحميل الصفوف.");
      return Array.isArray(j.classes) ? j.classes : [];
    },
    catalog: async () => {
      const j = await call<{ courses?: LearningCatalogCourse[] }>("/api/learning-materials-catalog", "تعذر تحميل قائمة المواد التعليمية.");
      return Array.isArray(j.courses) ? j.courses : [];
    },
    reading: async (classId, courseId) => {
      const j = await call<Partial<ClassReading>>("/api/learning-class-progress/" + encodeURIComponent(classId) + "/" + encodeURIComponent(courseId), "تعذر تحميل قراءة الصف حاليًا.");
      return {
        classId: String(j.classId ?? classId), courseId: String(j.courseId ?? courseId), generatedAt: String(j.generatedAt ?? ""),
        totalPages: Number(j.totalPages) || 0,
        modules: Array.isArray(j.modules) ? j.modules : [],
        students: Array.isArray(j.students) ? j.students : [],
      };
    },
    publish: async (classId, courseId, moduleIds) => {
      const j = await call<{ learningMaterials?: ClassLearningMaterial[] }>("/api/classrooms", "تعذر تعديل المواد التعليمية للصف.", {
        method: "POST", body: JSON.stringify({ action: "setLearningCourseModules", classId, courseId, moduleIds }),
      });
      return Array.isArray(j.learningMaterials) ? j.learningMaterials : [];
    },
  };
}
