import { describe, expect, it } from "vitest";
import { classLearningReleaseSummary } from "./classLearningMaterials";
import type { ClassLearningMaterial, LearningCatalogCourse } from "./types";

const catalog: LearningCatalogCourse[] = [{
  courseId: "791381",
  title: "الشبكات",
  subject: "تكشوف",
  modules: [
    { moduleId: "m01", title: "الأول", order: 1 },
    { moduleId: "m02", title: "الثاني", order: 2 },
  ],
}];
const assigned: ClassLearningMaterial[] = [{
  courseId: "791381",
  visibleModuleIds: ["m01", "deleted-or-unknown"],
}];

describe("21E L5 — teacher release overview", () => {
  it("counts only catalog-confirmed published modules", () => {
    expect(classLearningReleaseSummary(assigned, catalog)).toEqual({
      assignedCourses: 1,
      publishedModules: 1,
      hiddenModules: 1,
    });
  });
  it("does not fabricate partial counts when the catalog is missing", () => {
    expect(classLearningReleaseSummary(assigned, null)).toBeNull();
    expect(classLearningReleaseSummary(assigned, [])).toBeNull();
  });
  it("separates unassigned courses from assigned books", () => {
    const extra: LearningCatalogCourse = {
      courseId: "other", title: "Another", subject: "CS",
      modules: [{ moduleId: "other1", title: "Other", order: 1 }],
    };
    expect(classLearningReleaseSummary(assigned, [...catalog, extra])?.hiddenModules).toBe(1);
  });
  it("represents an empty class without published modules", () => {
    expect(classLearningReleaseSummary([], catalog)).toEqual({
      assignedCourses: 0, publishedModules: 0, hiddenModules: 0,
    });
  });
});
