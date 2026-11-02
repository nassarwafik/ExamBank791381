// @vitest-environment happy-dom
// Tadris+ P3-C — the teacher shell shaped by the server-resolved access (test data only):
//   no access info / not enforced → every destination, exactly as before (the legacy-full visual gate: zero change);
//   enforced → only the destinations the teacher holds a capability for; empty sections and the exam group disappear;
//   a destination reached directly (deep link / reload / stale state) shows «غير مفعّلة» with a way to an allowed one;
//   «unavailable» → nothing is offered and the teacher can retry (fail closed — blueprint test #14).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { createRequire } from "node:module";
import TeacherAppShell from "./TeacherAppShell";
import type { TeacherNavState } from "./teacherNav";
import { NAV_CAPABILITIES, navAllowed, parseTeacherAccess, firstAllowed, type TeacherAccessView } from "./teacherAccess";

const ALL = ["لوحة المتابعة", "المواد التعليمية", "الصفوف والطلاب", "الواجبات", "الرسائل", "المشاريع", "التقارير", "الألعاب التعليمية", "بنك الامتحانات", "باني الامتحان", "استيراد من ملف", "مراجعات النشر", "سجل النشاط"];
const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [], ...over });
const LEARNING_ONLY = ["classes.class.view", "students.student.view", "students.student.create", "students.student.edit", "students.student.archive", "students.student.restore", "learning.course.view", "learning.course.assign", "learning.module.release", "learning.progress.view", "reports.widget.view", "audit.self.view"];

function mount(access: TeacherAccessView | null, over: Partial<TeacherNavState> = {}) {
  const onNavigate = vi.fn();
  const onRetryAccess = vi.fn();
  render(
    <TeacherAppShell nav={state(over)} projectReadyTotal={0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={vi.fn()} access={access} onRetryAccess={onRetryAccess}>
      <p>محتوى الصفحة</p>
    </TeacherAppShell>
  );
  return { onNavigate, onRetryAccess };
}
const navLabels = () => Array.from(screen.getByRole("complementary", { name: "التنقل الرئيسي" }).querySelectorAll<HTMLButtonElement>("button.eb-nav-link"))
  .map(b => b.textContent || "").filter(t => t !== "تسجيل الخروج");

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P3-C teacherAccess", () => {
  it("every destination's capabilities are known TEACHER capabilities of the server registry", () => {
    const { isCapability, isOwnerOnly } = createRequire(import.meta.url)("../../api/src/lib/access/capabilities.js");
    for (const [id, caps] of Object.entries(NAV_CAPABILITIES)) for (const c of caps) expect({ id, c, ok: isCapability(c) && !isOwnerOnly(c) }).toEqual({ id, c, ok: true });
  });
  it("parsing: absent → unknown; unavailable → closed; ok → its capabilities and whether it is enforced", () => {
    expect(parseTeacherAccess(undefined)).toBeNull();
    expect(parseTeacherAccess({ status: "weird" })).toBeNull();
    expect(parseTeacherAccess({ status: "unavailable" })).toEqual({ status: "unavailable", enforced: true, capabilities: [] });
    expect(parseTeacherAccess({ status: "ok", enforced: true, capabilities: ["a", 1, "b"] })).toEqual({ status: "ok", enforced: true, capabilities: ["a", "b"] });
    expect(parseTeacherAccess({ status: "ok", capabilities: [] })).toEqual({ status: "ok", enforced: false, capabilities: [] });
  });
  it("navAllowed / firstAllowed", () => {
    const limited = { status: "ok" as const, enforced: true, capabilities: LEARNING_ONLY };
    expect(navAllowed("builder", null)).toBe(true);
    expect(navAllowed("builder", { status: "ok", enforced: false, capabilities: [] })).toBe(true);
    expect(navAllowed("builder", limited)).toBe(false);
    expect(navAllowed("learning", limited)).toBe(true);
    expect(navAllowed("dashboard", { status: "unavailable", enforced: true, capabilities: [] })).toBe(false);
    expect(firstAllowed(["builder", "messages", "learning"], limited)).toBe("learning");
  });
});

describe("P3-C the shell", () => {
  it("no access info, or not enforced (even with no capabilities): every destination — zero change before enforcement", () => {
    for (const access of [null, { status: "ok" as const, enforced: false, capabilities: [] }]) {
      mount(access);
      expect(navLabels()).toEqual(ALL);
      expect(screen.getByText("محتوى الصفحة")).toBeTruthy();
      cleanup();
    }
  });
  it("enforced learning-only: only its destinations; the exam group and the empty activities parts disappear", () => {
    mount({ status: "ok", enforced: true, capabilities: LEARNING_ONLY });
    expect(navLabels()).toEqual(["لوحة المتابعة", "المواد التعليمية", "الصفوف والطلاب", "التقارير", "سجل النشاط"]);
    expect(screen.queryByRole("group", { name: "بنك الامتحانات" })).toBeNull();
    expect(screen.getByText("محتوى الصفحة")).toBeTruthy();                // the dashboard is allowed
  });
  it("a destination reached directly that is not enabled shows «غير مفعّلة» (not the page), with a way to an allowed one", () => {
    const { onNavigate } = mount({ status: "ok", enforced: true, capabilities: LEARNING_ONLY }, { teacherView: "builder" });
    expect(screen.queryByText("محتوى الصفحة")).toBeNull();
    expect(screen.getByText("هذه الأداة غير مفعّلة لحسابك")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "الذهاب إلى «لوحة المتابعة»" }));
    expect(onNavigate).toHaveBeenCalledWith("dashboard");
  });
  it("access unavailable: nothing is offered (fail closed) and the teacher can retry", () => {
    const { onRetryAccess } = mount({ status: "unavailable", enforced: true, capabilities: [] });
    expect(navLabels()).toEqual([]);
    expect(screen.queryByText("محتوى الصفحة")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل صلاحياتك");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(onRetryAccess).toHaveBeenCalled();
  });
});
