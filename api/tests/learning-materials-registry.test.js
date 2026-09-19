import { describe, it, expect } from "vitest";
import { listLearningCourses, findLearningCourse, listLearningModules, findLearningModule, canonicalizeLearningModuleIds, validateLearningModuleIds } from "../src/lib/learning-materials-registry.js";

// Class Learning Materials — the SERVER publication registry is the only authority for which course/module ids a
// teacher may publish. It lists exactly the production-approved, fully converted modules in the book's content
// order (never a lexical id sort) and never the skeleton-only modules.

const M = ["791381-m01", "791381-m02", "791381-m07", "791381-m08", "791381-m09", "791381-m10", "791381-m11", "791381-m12", "791381-m13"];

describe("registry — exact production catalog", () => {
  it("lists exactly course 791381 with m01, m02, m07, m08, m09, m10, m11, m12, m13 in canonical content order (m07 = Unit 3 after m02; m08–m10 = Units 4–6; m11–m12 = Units 7–8; m13 = Batch 3)", () => {
    const courses = listLearningCourses();
    expect(courses.map(c => c.courseId)).toEqual(["791381"]);
    expect(courses[0]).toMatchObject({ courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة" });
    expect(courses[0].modules).toEqual([
      { moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 },
      { moduleId: "791381-m02", title: "الأعداد والموازين", order: 2 },
      { moduleId: "791381-m07", title: "عناوين IP", order: 3 },
      { moduleId: "791381-m08", title: "Class و Subnet و CIDR", order: 4 },
      { moduleId: "791381-m09", title: "أجهزة الشبكات", order: 5 },
      { moduleId: "791381-m10", title: "أنواع شبكات الاتصال", order: 6 },
      { moduleId: "791381-m11", title: "الكوابل وعنوان MAC", order: 7 },
      { moduleId: "791381-m12", title: "أنواع الرسائل", order: 8 },
      { moduleId: "791381-m13", title: "نماذج الاتصال: OSI و TCP/IP", order: 9 }
    ]);
  });
  it("never exposes skeleton-only modules (m03–m06) or any page/lesson body", () => {
    const ids = listLearningModules("791381").map(m => m.moduleId);
    for (const skel of ["791381-m03", "791381-m04", "791381-m05", "791381-m06"]) expect(ids).not.toContain(skel);
    const text = JSON.stringify(listLearningCourses());
    expect(text).not.toMatch(/pages|lessons|blocks|answer|pdf/i);
  });
  it("is pure and deterministic: repeated calls are equal and returned copies cannot corrupt the registry", () => {
    const a = listLearningCourses(), b = listLearningCourses();
    expect(a).toEqual(b);
    a[0].modules.push({ moduleId: "791381-m99", title: "x", order: 99 }); a[0].title = "hacked";
    expect(listLearningCourses()).toEqual(b);
    expect(findLearningCourse("791381").title).toBe("شبكات الاتصال");
  });
});

describe("registry — lookups", () => {
  it("findLearningCourse: known (trimmed) → copy; unknown / empty → null", () => {
    expect(findLearningCourse(" 791381 ").courseId).toBe("791381");
    expect(findLearningCourse("794589")).toBeNull();
    expect(findLearningCourse("")).toBeNull();
    expect(findLearningCourse(undefined)).toBeNull();
  });
  it("findLearningModule / listLearningModules: unknown course or module → null / []", () => {
    expect(findLearningModule("791381", "791381-m07")).toEqual({ moduleId: "791381-m07", title: "عناوين IP", order: 3 });
    expect(findLearningModule("791381", "791381-m03")).toBeNull();
    expect(findLearningModule("999999", "791381-m01")).toBeNull();
    expect(listLearningModules("999999")).toEqual([]);
  });
});

describe("registry — canonicalizeLearningModuleIds (storage-side, never throws)", () => {
  it("re-orders into canonical order, drops duplicates, blanks, unknown and skeleton ids", () => {
    expect(canonicalizeLearningModuleIds("791381", ["791381-m10", "791381-m07", " 791381-m01 ", "791381-m01", "", null, "791381-m03", "791381-m999"])).toEqual(["791381-m01", "791381-m07", "791381-m10"]);
    expect(canonicalizeLearningModuleIds("791381", M.slice().reverse())).toEqual(M);
    expect(canonicalizeLearningModuleIds("791381", ["791381-m12", "791381-m11"])).toEqual(["791381-m11", "791381-m12"]);
    expect(canonicalizeLearningModuleIds("791381", ["791381-m13", "791381-m12"])).toEqual(["791381-m12", "791381-m13"]);
  });
  it("[] / non-array / unknown course → []", () => {
    expect(canonicalizeLearningModuleIds("791381", [])).toEqual([]);
    expect(canonicalizeLearningModuleIds("791381", "791381-m01")).toEqual([]);
    expect(canonicalizeLearningModuleIds("999999", M)).toEqual([]);
  });
});

describe("registry — validateLearningModuleIds (request-side, throws httpStatus 400)", () => {
  const status = fn => { try { fn(); return null; } catch (e) { return e.httpStatus; } };
  it("accepts any subset in any order and returns canonical order; [] is valid (attached, nothing released)", () => {
    expect(validateLearningModuleIds("791381", ["791381-m07", "791381-m01"])).toEqual(["791381-m01", "791381-m07"]);
    expect(validateLearningModuleIds("791381", [])).toEqual([]);
    expect(validateLearningModuleIds("791381", undefined)).toEqual([]);
    expect(validateLearningModuleIds("791381", ["791381-m02", "791381-m02"])).toEqual(["791381-m02"]);   // duplicates normalize
    expect(validateLearningModuleIds("791381", ["791381-m12", "791381-m11"])).toEqual(["791381-m11", "791381-m12"]);   // Units 7–8 canonicalize by registry order
    expect(validateLearningModuleIds("791381", ["791381-m13", "791381-m12"])).toEqual(["791381-m12", "791381-m13"]);   // Batch 3 canonicalizes after Unit 8
  });
  it("unknown course → 400; unknown module → 400; skeleton module → 400; non-array → 400", () => {
    expect(status(() => validateLearningModuleIds("794589", []))).toBe(400);
    expect(status(() => validateLearningModuleIds("791381", ["791381-m999"]))).toBe(400);
    expect(status(() => validateLearningModuleIds("791381", ["791381-m03"]))).toBe(400);
    expect(status(() => validateLearningModuleIds("791381", "791381-m01"))).toBe(400);
  });
});
