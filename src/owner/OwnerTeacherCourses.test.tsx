// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OwnerTeacherCourses from "./OwnerTeacherCourses";
import { coursesDraft } from "./teacherCoursesDraft";
import type { AccessHistoryEntry, CatalogCourse, EffectiveAccess } from "./ownerApi";

// Owner Console «المواد» — the course entitlement of a teacher, saved alone (everything else of the revision is sent back unchanged).
afterEach(cleanup);

const course = (courseId: string, title: string): CatalogCourse => ({ courseId, title, subject: "علم الحاسوب", modules: 3, status: "published", updatedAt: "", updatedBy: "" });
const COURSES = [course("791381", "أسس علم الحاسوب"), course("899271d", "مبنى المعطيات"), course("899371", "شبكات الاتصال")];
const head = (over: Partial<AccessHistoryEntry> = {}): AccessHistoryEntry => ({
  revisionId: "r2", parentRevisionId: "r1", preset: { id: "learning-ready", version: 2 }, grants: ["games.catalog.view"], denies: ["reports.widget.view"],
  courses: null, widgets: ["w1"], games: ["g1", "g2"], appearance: { palette: ["ocean"] }, reason: "", createdAt: "", createdBy: "", valid: true, capabilities: [], ...over
});
const effective = (enforced: boolean): EffectiveAccess => ({ accountStatus: "active", mode: enforced ? "enforce" : "observe", enforced, access: { status: "ok", revisionId: "r2", preset: null, capabilities: [] } } as EffectiveAccess);
const mount = (over: Partial<Parameters<typeof OwnerTeacherCourses>[0]> = {}) => {
  const onSave = vi.fn(), onOpenAccess = vi.fn(), onDirty = vi.fn();
  render(<OwnerTeacherCourses teacherName="حلا" courses={COURSES} head={head()} headBroken={false} effective={effective(true)} busy={false} onSave={onSave} onOpenAccess={onOpenAccess} onDirty={onDirty} {...over} />);
  return { onSave, onOpenAccess, onDirty };
};

describe("coursesDraft — only the course entitlement changes", () => {
  it("keeps the preset, grants, denies, widgets, games and appearance exactly; sets only the sorted courses", () => {
    expect(coursesDraft(head(), ["899371", "791381"], "سبب")).toEqual({
      presetId: "learning-ready", presetVersion: 2, grants: ["games.catalog.view"], denies: ["reports.widget.view"], reason: "سبب",
      courses: ["791381", "899371"], widgets: ["w1"], games: ["g1", "g2"], appearance: { palette: ["ocean"] }
    });
  });
  it("«all» sends no course list (every published course); absent restrictions stay absent", () => {
    const d = coursesDraft(head({ widgets: null, games: null, appearance: null }), null, "x")!;
    expect("courses" in d || "widgets" in d || "games" in d || "appearance" in d).toBe(false);
  });
  it("an invalid revision or one without a preset is never rebuilt", () => {
    expect(coursesDraft(head({ valid: false }), ["791381"], "x")).toBeNull();
    expect(coursesDraft(head({ preset: null }), ["791381"], "x")).toBeNull();
  });
});

describe("the «المواد» tab", () => {
  it("chooses specific courses and saves them with the rest of the revision unchanged", () => {
    const { onSave } = mount();
    const save = screen.getByRole("button", { name: "حفظ المواد" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);                                                   // nothing changed yet
    fireEvent.click(screen.getByRole("radio", { name: /مواد محددة فقط/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /مبنى المعطيات/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /أسس علم الحاسوب/ }));
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({ ...coursesDraft(head(), ["791381", "899271d"], "المواد التعليمية") });
  });
  it("opens on the saved choice, and «كل المواد المنشورة» removes the restriction", () => {
    const { onSave } = mount({ head: head({ courses: ["899371"] }) });
    expect(screen.getByText("شبكات الاتصال", { selector: "strong" })).toBeTruthy();       // «الآن:»
    expect((screen.getByRole("checkbox", { name: /شبكات الاتصال/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /كل المواد المنشورة/ }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ المواد" }));
    expect("courses" in onSave.mock.calls[0][0]).toBe(false);
  });
  it("says when the access mode does not enforce the choice yet", () => {
    mount({ effective: effective(false) });
    expect(screen.getByRole("note").textContent).toContain("لا يطبّق القيود بعد");
    cleanup();
    mount();
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("without a saved access revision nothing can be saved here: it leads to «الصلاحيات»", () => {
    const { onOpenAccess } = mount({ head: undefined });
    expect(screen.queryByRole("button", { name: "حفظ المواد" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "الذهاب إلى «الصلاحيات»" }));
    expect(onOpenAccess).toHaveBeenCalled();
  });
  it("a broken revision or an unreadable catalog offers no choice (fail closed)", () => {
    mount({ headBroken: true });
    expect(screen.getByRole("alert").textContent).toContain("غير صالحة");
    cleanup();
    mount({ courses: null });
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل");
    expect(screen.queryByRole("button", { name: "حفظ المواد" })).toBeNull();
  });
  it("reports unsaved changes to the page (the leave question)", () => {
    const { onDirty } = mount();
    fireEvent.click(screen.getByRole("radio", { name: /مواد محددة فقط/ }));
    expect(onDirty).toHaveBeenLastCalledWith(true);
  });
});
