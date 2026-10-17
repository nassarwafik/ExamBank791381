// @vitest-environment happy-dom
// Phase L.0 — the class learning-materials summary agrees its counts in Arabic. Before: «1 وحدات منشورة للطلاب»,
// «2 وحدات …», «12 وحدات …» — the plural was printed for every count. After: singular / dual / plural / accusative.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import ClassLearningMaterialsPanel from "./ClassLearningMaterialsPanel";
import type { Classroom, LearningCatalogCourse } from "./types";
import { arabicCount, arabicCountParts, HIDDEN_MODULES, PUBLISHED_MODULES } from "../learning/arabicCount";

afterEach(cleanup);

const modules = (n: number) => Array.from({ length: n }, (_, i) => ({ moduleId: "m" + (i + 1), title: "وحدة " + (i + 1), order: i + 1 }));
function mount(total: number, published: number) {
  const catalog: LearningCatalogCourse[] = [{ courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: modules(total) }];
  const classroom: Classroom = {
    classId: "c1", name: "الحادي عشر — أ", grade: "11", schoolYear: "2026", active: true, studentCount: 20, createdAt: "",
    learningMaterials: [{ courseId: "791381", visibleModuleIds: modules(total).slice(0, published).map(m => m.moduleId) }],
  };
  const noop = () => {};
  render(<ClassLearningMaterialsPanel classroom={classroom} classActive catalog={catalog} catalogError="" busy={false}
    onRetryCatalog={noop} onAddCourse={noop} onToggleModule={noop} onRemoveCourse={noop} />);
  return screen.getByLabelText("ملخص المواد التعليمية للصف");
}

describe("L.0 — class learning-materials summary counts", () => {
  it.each([
    [3, 1, "وحدة واحدة منشورة للطلاب", "وحدتان غير منشورتين"],
    [5, 2, "وحدتان منشورتان للطلاب", "3 وحدات غير منشورة"],
    [28, 11, "11 وحدةً منشورةً للطلاب", "17 وحدةً غيرَ منشورة"],
    [28, 0, "لا وحدات منشورة للطلاب", "28 وحدةً غيرَ منشورة"],
  ])("%i modules, %i published → «%s» · «%s»", (total, published, shown, hidden) => {
    const summary = mount(total, published);
    const lines = [...summary.querySelectorAll("p")].map(p => p.textContent);
    expect(lines).toEqual(["مادة تعليمية واحدة مضافة", shown, hidden]);
  });

  it("the digits stay emphasised when the phrase carries a number", () => {
    const summary = mount(28, 11);
    expect([...summary.querySelectorAll("strong")].map(s => s.textContent)).toEqual(["11", "17"]);
  });
});

describe("L.0 — arabicCountParts", () => {
  it("splits around the number and agrees with arabicCount for every category", () => {
    for (const n of [0, 1, 2, 3, 10, 11, 99, 100, 101]) {
      for (const forms of [PUBLISHED_MODULES, HIDDEN_MODULES]) {
        const { before, number, after } = arabicCountParts(n, forms);
        expect(before + (number ?? "") + after).toBe(arabicCount(n, forms));
      }
    }
    expect(arabicCountParts(1, PUBLISHED_MODULES)).toEqual({ before: "وحدة واحدة منشورة للطلاب", number: null, after: "" });
    expect(arabicCountParts(4, PUBLISHED_MODULES)).toEqual({ before: "", number: "4", after: " وحدات منشورة للطلاب" });
  });
});
