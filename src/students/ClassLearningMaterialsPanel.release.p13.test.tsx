// @vitest-environment happy-dom
// 899371 enrichment P13 (decision D1) — the teacher's per-module «حلول الكتاب مفتوحة» toggle in «المواد التعليمية لهذا الصف»
// (presentation only; the server's authority is api/tests/learning-solutions-release-p13.test.js):
//   • it exists only for a course with a solutions release (899371), one per module, with a one-line explanation;
//   • it shows the class's release; a hidden module's toggle is disabled (a release needs the module published) and says why;
//   • toggling calls the host with the class, the course, the module and the new state; an archived class or a busy panel disables it.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import ClassLearningMaterialsPanel from "./ClassLearningMaterialsPanel";
import type { Classroom, LearningCatalogCourse } from "./types";

afterEach(cleanup);
const mods = (c: string, n: number) => Array.from({ length: n }, (_, i) => ({ moduleId: c + "-m0" + (i + 1), title: "فصل " + (i + 1), order: i + 1 }));
const catalog: LearningCatalogCourse[] = [
  { courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: mods("791381", 2) },
  { courseId: "899371", title: "أسس علم الحاسوب", subject: "علم الحاسوب", modules: mods("899371", 3) },
];
const classroom: Classroom = {
  classId: "c1", name: "11-1", grade: "11", schoolYear: "2026", active: true, studentCount: 20, createdAt: "",
  learningMaterials: [
    { courseId: "791381", visibleModuleIds: ["791381-m01"] },
    { courseId: "899371", visibleModuleIds: ["899371-m01", "899371-m02"], releasedModuleIds: ["899371-m01"] },
  ],
};
function mount({ active = true, busy = false } = {}) {
  const onToggleRelease = vi.fn();
  const noop = () => {};
  render(<ClassLearningMaterialsPanel classroom={classroom} classActive={active} catalog={catalog} catalogError="" busy={busy}
    onRetryCatalog={noop} onAddCourse={noop} onToggleModule={noop} onToggleRelease={onToggleRelease} onRemoveCourse={noop} />);
  return onToggleRelease;
}
const card = (title: string) => screen.getByRole("heading", { name: title }).closest("article") as HTMLElement;
const toggles = (el: HTMLElement) => within(el).queryAllByRole("checkbox", { name: /حلول الكتاب مفتوحة/ }) as HTMLInputElement[];

describe("P13 D1 — «حلول الكتاب مفتوحة» per module", () => {
  it("only on 899371, one per module, with the explanation; none on a course without release", () => {
    mount();
    expect(toggles(card("شبكات الاتصال"))).toHaveLength(0);
    expect(toggles(card("أسس علم الحاسوب"))).toHaveLength(3);
    expect(within(card("أسس علم الحاسوب")).getByText(/حلول أسئلة الكتاب ومحاكي ناتجها مقفلة عن الطلاب حتى تفتحها/)).toBeTruthy();
  });

  it("shows the release; a hidden module's toggle is disabled and says why", () => {
    mount();
    const [m1, m2, m3] = toggles(card("أسس علم الحاسوب"));
    expect([m1.checked, m2.checked, m3.checked]).toEqual([true, false, false]);
    expect([m1.disabled, m2.disabled, m3.disabled]).toEqual([false, false, true]);
    expect(document.getElementById(m3.getAttribute("aria-describedby")!)?.textContent).toBe("انشر الفصل أولًا");
  });

  it("toggling asks the host with the class, course, module and new state", () => {
    const onToggle = mount();
    const [m1, m2] = toggles(card("أسس علم الحاسوب"));
    fireEvent.click(m2);
    fireEvent.click(m1);
    expect(onToggle.mock.calls.map(c => [c[0].classId, c[1], c[2], c[3]])).toEqual([["c1", "899371", "899371-m02", true], ["c1", "899371", "899371-m01", false]]);
  });

  it("an archived class or a busy panel disables every toggle", () => {
    mount({ active: false });
    expect(toggles(card("أسس علم الحاسوب")).every(t => t.disabled)).toBe(true);
    cleanup();
    mount({ busy: true });
    expect(toggles(card("أسس علم الحاسوب")).every(t => t.disabled)).toBe(true);
  });
});
