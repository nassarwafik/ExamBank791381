// @vitest-environment happy-dom
// Phase U.2 — Classes & Students details. The touch targets are measured in a real Chromium
// (scripts/check-classes-students-browser-u1.mjs, U.2 section); these tests pin the behaviour and the markup / style contract:
//   - Arabic number agreement: the shared phrase sets, the class cards, the roster header chip, the bulk bar;
//   - students with the same sort key are ordered by first name, numerically (طالب2 before طالب10);
//   - «الأرشيف» / «الصفوف النشطة» select the view's first class when the selected one is not in it (an empty view keeps it);
//   - the archived card's line: the badge, «في <day>», the graduation year — no leading «·»;
//   - the checkboxes and the search fields are labels (their tap area); the touch rules and the legacy-style removal.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import TeacherPlatform from "../TeacherPlatform";
import ClassesPane, { type ClassesPaneProps } from "./ClassesPane";
import BulkActionBar from "./BulkActionBar";
import { arabicCount, arabicCountParts, STUDENTS, STUDENTS_GENITIVE, SELECTED_STUDENTS, STUDENTS_AFTER_DIGITS } from "../learning/arabicCount";
import type { Classroom } from "./types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("U.2 — Arabic number agreement", () => {
  const N = [0, 1, 2, 3, 10, 11, 99, 100];
  it("the shared phrase sets agree with every plural category", () => {
    expect(N.map(n => arabicCount(n, STUDENTS))).toEqual(["لا طلاب", "طالب واحد", "طالبان", "3 طلاب", "10 طلاب", "11 طالبًا", "99 طالبًا", "100 طالب"]);
    expect(N.map(n => arabicCount(n, STUDENTS_GENITIVE))).toEqual(["لا طلاب", "طالب واحد", "طالبين", "3 طلاب", "10 طلاب", "11 طالبًا", "99 طالبًا", "100 طالب"]);
    expect(N.map(n => arabicCount(n, SELECTED_STUDENTS))).toEqual(["لا طلاب محددون", "طالب واحد محدد", "طالبان محددان", "3 طلاب محددون", "10 طلاب محددون", "11 طالبًا محددًا", "99 طالبًا محددًا", "100 طالب محدد"]);
    // after a number that is always shown (a count chip), 1 and 2 keep the digit
    expect(N.map(n => arabicCountParts(n, STUDENTS_AFTER_DIGITS))).toEqual(N.map(n => ({ before: "", number: String(n), after: n % 100 >= 3 && n % 100 <= 10 ? " طلاب" : n % 100 >= 11 ? " طالبًا" : " طالب" })));
  });
  it("the bulk bar names the selection with the agreed phrase", () => {
    const view = (count: number) => { const r = render(<BulkActionBar count={count} busy={false} targetClasses={[]} targetClassId="" onTargetChange={() => {}} onAction={() => {}} onClear={() => {}} />); const t = (r.container.querySelector(".eb-bulk-summary strong") as HTMLElement).textContent; r.unmount(); return t; };
    expect([1, 2, 3, 11].map(view)).toEqual(["طالب واحد محدد", "طالبان محددان", "3 طلاب محددون", "11 طالبًا محددًا"]);
  });
});

const cls = (classId: string, name: string, over: Partial<Classroom> = {}): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3, createdAt: "2026-01-01", ...over } as Classroom);
function pane(classes: Classroom[], extra: Partial<ClassesPaneProps> = {}) {
  const props: ClassesPaneProps = { classes, view: "active", onViewChange: vi.fn(), activeCount: classes.length, archivedCount: 0, selectedClassId: classes[0]?.classId || "", onSelect: vi.fn(), projects: [], projectTitle: c => c, isGraduationEligible: () => false, onToggleProject: vi.fn(), onToggleArchive: vi.fn(), onGraduate: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), loading: false, busy: false, fmtDate: v => "DAY(" + v + ")", ...extra };
  return render(<ClassesPane {...props} />);
}
const meta = (name: string) => (screen.getByText(name).closest("li") as HTMLElement).querySelector(".eb-class-meta")?.textContent;

describe("U.2 — class cards", () => {
  it("the card's student count agrees with its number", () => {
    pane([cls("a", "أ", { studentCount: 1 }), cls("b", "ب", { studentCount: 2 }), cls("c", "ج", { studentCount: 7 }), cls("d", "د", { studentCount: 29 }), cls("e", "هـ", { studentCount: 0 })]);
    expect(["أ", "ب", "ج", "د", "هـ"].map(meta)).toEqual(["11 · طالب واحد · 2026", "11 · طالبان · 2026", "11 · 7 طلاب · 2026", "11 · 29 طالبًا · 2026", "11 · لا طلاب · 2026"]);
  });
  it("the archive line: badge, «في <day>» and the graduation year — never a leading «·»", () => {
    const archived = { active: false, status: "archived", archivedAt: "2026-06-01T00:00:00.000Z" };
    pane([cls("x", "صف قديم", archived), cls("y", "دفعة", { ...archived, archiveReason: "graduated", graduationYear: "2026" }), cls("z", "بلا تاريخ", { active: false, status: "archived" })], { view: "archived" });
    const line = (name: string) => (screen.getByText(name).closest("li") as HTMLElement).querySelector(".eb-class-archive-line") as HTMLElement;
    expect(line("صف قديم").textContent).toBe("مؤرشففي DAY(2026-06-01T00:00:00.000Z)");
    expect(line("دفعة").textContent).toBe("مُخرَّجفي DAY(2026-06-01T00:00:00.000Z) · دفعة 2026");
    expect(line("بلا تاريخ").textContent).toBe("مؤرشف");
    expect(line("صف قديم").querySelector(".eb-badge")).not.toBeNull();
  });
  it("the class filter is a label around its input (the whole field is the tap area)", () => {
    pane(Array.from({ length: 7 }, (_, i) => cls("c" + i, "الصف " + i)));
    const input = screen.getByRole("searchbox", { name: "تصفية الصفوف" });
    expect(input.closest("label")?.className).toContain("eb-search-field");
  });
});

// ── TeacherPlatform: the order, the view switch, the header chip and the bulk bar ────────────────────────────────────────
const ORDER = [10, 2, 12, 1, 7, 11, 3, 9, 5, 4, 8, 6];
const student = (n: number, classId: string, familyName = "الأحمد") => ({ userId: classId + "-u" + n, code: "C" + n, identityNumber: String(300000000 + n), firstName: "طالب" + n, familyName, displayName: "طالب" + n + " " + familyName, classId, active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const GOOD = cls("good", "صف الأسماء", { studentCount: 12, createdAt: "2026-01-03" });
const OLD1 = cls("old1", "أرشيف 2024", { active: false, status: "archived", archivedAt: "2026-06-01T00:00:00.000Z", studentCount: 2 });
const OLD2 = cls("old2", "أرشيف 2023", { active: false, status: "archived", archivedAt: "2026-05-01T00:00:00.000Z", studentCount: 2 });
let CLASSES: Classroom[] = [];
const ROSTERS: Record<string, unknown[]> = { good: ORDER.map(n => student(n, "good")), old1: [student(1, "old1", "قديم"), student(2, "old1", "قديم")], old2: [student(1, "old2", "أقدم")] };
function json(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/students") && method === "GET") { const classId = new URL(url, "http://x").searchParams.get("classId") || ""; return json({ ok: true, students: ROSTERS[classId] || [] }); }
  return json({ ok: true });
}
beforeEach(() => { CLASSES = [GOOD, OLD1, OLD2]; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
const MOUNT = { timeout: 5000 };
async function mount() {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByText("طالب12", undefined, MOUNT);
}
const rosterHeading = () => document.querySelector(".eb-roster-pane h2")?.textContent;
const firstNames = () => [...document.querySelectorAll(".eb-roster-table tbody td.eb-col-name strong")].map(s => s.textContent);

describe("U.2 — the roster on the page", () => {
  it("students with the same family name are listed by first name in numeric order", async () => {
    await mount();
    expect(firstNames()).toEqual(Array.from({ length: 12 }, (_, i) => "طالب" + (i + 1)));
  });
  it("the header chip keeps the digits and agrees the noun («12 طالبًا»); the bulk bar agrees too", async () => {
    await mount();
    const chip = document.querySelector(".eb-roster-pane .student-count-badge") as HTMLElement;
    expect(chip.textContent).toBe("12");
    expect(chip.parentElement?.textContent).toMatch(/^12 طالبًا · /);
    fireEvent.click(screen.getByLabelText("تحديد طالب1 الأحمد"));
    expect(await screen.findByText("طالب واحد محدد")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("تحديد الكل"));
    expect(await screen.findByText("12 طالبًا محددًا")).toBeTruthy();
  });
  it("every row checkbox and «تحديد الكل» sit inside a label (the tap area); the roster search is a label too", async () => {
    await mount();
    for (const box of document.querySelectorAll(".eb-roster-table input[type=checkbox]")) expect(box.parentElement?.matches("label.eb-check-hit")).toBe(true);
    expect(screen.getByLabelText("ابحث بالاسم، العائلة أو رقم الهوية").closest("label")?.className).toContain("eb-search-field");
  });
  it("«الأرشيف» selects the first archived class; «الصفوف النشطة» returns to the first active class", async () => {
    await mount();
    expect(rosterHeading()).toBe("صف الأسماء");
    fireEvent.click(screen.getByRole("button", { name: /^الأرشيف/ }));
    await waitFor(() => expect(rosterHeading()).toBe("أرشيف 2024"));
    expect(within(screen.getByText("أرشيف 2024", { selector: ".eb-class-name" }).closest("li") as HTMLElement).getByRole("button", { pressed: true })).toBeTruthy();
    await waitFor(() => expect(firstNames()).toEqual(["طالب1", "طالب2"]));                 // the archived class's own roster
    // the page formats the archive day without a time («في 1 يونيو 2026», never «… 3:00:00 ص»)
    expect((document.querySelector(".eb-class-archive-line") as HTMLElement).textContent).toMatch(/^مؤرشففي \d{1,2} \S+ \d{4}$/);
    fireEvent.click(screen.getByRole("button", { name: /^الصفوف النشطة/ }));
    await waitFor(() => expect(rosterHeading()).toBe("صف الأسماء"));
  });
  it("an empty view keeps the current selection", async () => {
    CLASSES = [GOOD];
    await mount();
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); e.preventDefault(); };
    window.addEventListener("error", onError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: /^الأرشيف/ }));
    await screen.findByText("لا توجد صفوف مؤرشفة.");
    expect(rosterHeading()).toBe("صف الأسماء");
    expect(firstNames()).toHaveLength(12);
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);                                                       // the switch itself never throws
    expect(consoleError.mock.calls.filter(c => /Error|TypeError/.test(String(c[0])))).toEqual([]);
  });
});

describe("U.2 — style contract", () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8");
  const css = read("page-parts.css"), platform = read("platform.css");
  it("touch rules (≥ 44 px) apply on a phone AND on any coarse pointer, scoped to the workspace, its sheet and the menus", () => {
    const i = css.indexOf("@media (max-width:767px), (pointer:coarse){");
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i, css.indexOf("\n}\n", i));
    for (const rule of [
      ".eb-students-workspace .eb-button,.eb-student-dialog .eb-button,.eb-students-workspace .eb-link-button,.eb-students-workspace select{ min-height:44px; }",
      ".eb-students-workspace .eb-icon-button,.eb-student-dialog .eb-icon-button,.eb-students-workspace .eb-menu-trigger{ min-width:44px; min-height:44px; }",
      ".eb-students-workspace .eb-segmented > button,.eb-student-dialog .eb-dialog-nav button,.eb-menu-panel .eb-menu-item{ min-height:44px; }",
      ".eb-students-workspace .eb-th-sort{ min-height:44px;",
      ".eb-students-workspace .eb-check-hit{ min-width:44px; min-height:44px;",
    ]) expect(block).toContain(rule);
  });
  it("the legacy .class-list / .class-row rules are gone (the column with overflow:hidden and the 62 % archived opacity)", () => {
    expect(platform).not.toMatch(/^\.class-(list|row)\b/m);
    expect(css).not.toMatch(/^\.class-row(\{|:hover|\.selected)/m);
    expect(platform).not.toContain("opacity: 0.62");
  });
});
