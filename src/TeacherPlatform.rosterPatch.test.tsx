// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

// Roadmap #32 — Teacher Roster Local Patching. Drives the REAL TeacherPlatform with a routed fetch mock and proves:
// a successful single-row mutation patches ONLY the affected row from server-returned values and never re-downloads
// the roster; the classes list is refreshed only when a class count can change; every ambiguous response
// (rosterSynced:false, incomplete body) falls back to the authoritative reload in the order students → classes;
// bulk operations and class switching keep their authoritative full loads; the manual ↻ refreshes students then
// classes; and a response for class A can never patch the roster of class B selected meanwhile.

type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };

const CLASSES = [
  { classId: "c1", name: "صف أول", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 2, createdAt: "2026-01-03" },
  { classId: "c2", name: "صف ثاني", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "2026-01-02" },
  { classId: "c3", name: "صف ثالث", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "2026-01-01" }
];
const stu = (userId: string, firstName: string, familyName: string, identity: string, classId: string, over: Partial<Student> = {}): Student => ({
  userId, code: identity, identityNumber: identity, firstName, familyName, displayName: firstName + " " + familyName, classId,
  active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "",
  submittedAssignmentsCount: 0, likesCount: 0, ...over
});
const S1 = stu("s1", "علي", "حسن", "111111111", "c1", { submittedAssignmentsCount: 3, likesCount: 2, lastLoginAt: "2026-02-01T00:00:00.000Z" });
const S2 = stu("s2", "سارة", "محمود", "222222222", "c1", { active: false });
const S3 = stu("s3", "خالد", "سعيد", "333333333", "c1", { active: false, archived: true });
const T1 = stu("t1", "نور", "كريم", "444444444", "c2");
const R1 = stu("r1", "ريم", "صالح", "555555555", "c3");
const seedRosters = (): Record<string, Student[]> => ({ c1: [S1, S2, S3], c2: [T1], c3: [R1] });
let ROSTERS: Record<string, Student[]> = seedRosters();   // the mock's AUTHORITATIVE rosters (a test may advance them)

type Call = { url: string; method: string; action: string; body: Record<string, unknown> };
let calls: Call[] = [];
let gate: Promise<void> | null = null;                    // when set, every GET /api/students waits on it
let postHandler: (action: string, body: Record<string, unknown>) => unknown = () => ({ ok: true });
function json(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
function defer<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {};
  if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  const action = String(body.action || "");
  calls.push({ url, method, action, body });
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/students") && method === "GET") {
    if (gate) await gate;
    const classId = new URL(url, "http://x").searchParams.get("classId") || "";
    return json({ ok: true, students: ROSTERS[classId] || [] });
  }
  if (url.includes("/api/students") && method === "POST") {
    const r = await postHandler(action, body);
    return r && typeof (r as Response).json === "function" ? (r as Response) : json(r);
  }
  return json({ ok: true });
}

const studentsGets = (classId = "") => calls.filter(c => c.method === "GET" && c.url.includes("/api/students?") && c.url.includes("classId=" + classId)).length;
const classesGets = () => calls.filter(c => c.method === "GET" && c.url.includes("/api/classrooms")).length;
const firstIndex = (pred: (c: Call) => boolean) => calls.findIndex(pred);
const isStudentsGet = (c: Call) => c.method === "GET" && c.url.includes("/api/students?") && c.url.includes("classId=");
const isClassesGet = (c: Call) => c.method === "GET" && c.url.includes("/api/classrooms");

beforeEach(() => { calls = []; gate = null; ROSTERS = seedRosters(); postHandler = () => ({ ok: true }); globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; (window as unknown as { confirm: () => boolean }).confirm = () => true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  const utils = render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByText("علي");                            // class c1 roster rendered
  calls = [];                                                // count only what the action under test causes
  return utils;
}
const rowOf = (firstName: string) => screen.getByText(firstName).closest("tr") as HTMLElement;
const badge = () => (document.querySelector(".student-count-badge") as HTMLElement).textContent;
const stats = () => Array.from(document.querySelectorAll(".student-admin-stats strong")).map(x => x.textContent); // [total, active, disabled, archived, neverLogged]
const statusOf = (firstName: string) => within(rowOf(firstName)).getByText(/^(فعّال|معطّل|مؤرشف)$/).textContent;
function editModal() { return screen.getByText("تعديل تفاصيل الطالب").closest("section") as HTMLElement; }
async function openEdit(firstName: string) { fireEvent.click(within(rowOf(firstName)).getByText("تعديل")); await screen.findByText("تعديل تفاصيل الطالب"); return editModal(); }
function expectNoReloads() { expect(studentsGets()).toBe(0); expect(classesGets()).toBe(0); }

describe("R32 — create", () => {
  it("appends the server-returned student, increments the badge, no GET students, exactly one GET classes", async () => {
    postHandler = () => ({ ok: true, student: { userId: "s9", code: "999999999", identityNumber: "999999999", firstName: "جديد", familyName: "طالب", displayName: "جديد طالب", classId: "c1", active: true, archived: false, createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", lastLoginAt: "" }, temporaryPassword: "Pw-secret-1", rosterSynced: true });
    await mount();
    expect(badge()).toBe("3");
    fireEvent.change(screen.getByPlaceholderText("الاسم الشخصي"), { target: { value: "جديد" } });
    fireEvent.change(screen.getByPlaceholderText("اسم العائلة"), { target: { value: "طالب" } });
    fireEvent.change(screen.getByPlaceholderText("9 أرقام"), { target: { value: "999999999" } });
    fireEvent.click(screen.getByText("+ إنشاء حساب طالب"));
    await screen.findByText("✓ تم إنشاء حساب الطالب. سيستخدم رقم الهوية لتسجيل الدخول.");
    expect(screen.getByText("جديد")).toBeTruthy();
    expect(badge()).toBe("4");
    expect(screen.getByText("Pw-secret-1")).toBeTruthy();       // credential box unchanged
    expect(studentsGets()).toBe(0);
    expect(classesGets()).toBe(1);
    expect(within(rowOf("جديد")).queryByText(/الوظائف/)).toBeNull(); // counters start at 0 → no history button
  });

  it("rosterSynced:false → authoritative fallback: GET students FIRST, then GET classes (sequential)", async () => {
    postHandler = () => ({ ok: true, student: { ...S1, userId: "s9", firstName: "جديد", familyName: "طالب", displayName: "جديد طالب" }, temporaryPassword: "Pw", rosterSynced: false });
    await mount();
    const g = defer<void>(); gate = g.promise;               // armed AFTER the initial roster load
    fireEvent.change(screen.getByPlaceholderText("الاسم الشخصي"), { target: { value: "جديد" } });
    fireEvent.change(screen.getByPlaceholderText("اسم العائلة"), { target: { value: "طالب" } });
    fireEvent.change(screen.getByPlaceholderText("9 أرقام"), { target: { value: "999999999" } });
    fireEvent.click(screen.getByText("+ إنشاء حساب طالب"));
    await waitFor(() => expect(studentsGets("c1")).toBe(1));
    expect(classesGets()).toBe(0);                               // classes read waits for the roster/self-heal read
    g.resolve();
    await waitFor(() => expect(classesGets()).toBe(1));
    await screen.findByText(/وسيتم تحديث عداد الصف تلقائيًا/);
    expect(firstIndex(isStudentsGet)).toBeLessThan(firstIndex(isClassesGet));
  });
});

describe("R32 — toggle active", () => {
  it("patches only `active` from response.active; zero reload GETs; stats move from active to disabled", async () => {
    postHandler = () => ({ ok: true, active: false });
    await mount();
    expect(stats()).toEqual(["3", "1", "1", "1", "1"]);
    expect(statusOf("علي")).toBe("فعّال");
    fireEvent.click(within(rowOf("علي")).getByText("تعطيل الحساب"));
    await screen.findByText("✓ تم تعطيل حساب الطالب.");
    expect(statusOf("علي")).toBe("معطّل");
    expect(stats()).toEqual(["3", "0", "2", "1", "1"]);
    expect(within(rowOf("علي")).getByText("❤️ 2")).toBeTruthy(); // computed counters untouched
    expectNoReloads();
  });

  it("non-boolean response.active → authoritative fallback (students then classes)", async () => {
    postHandler = () => ({ ok: true });
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("تعطيل الحساب"));
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(firstIndex(isStudentsGet)).toBeLessThan(firstIndex(isClassesGet));
  });

  it("4xx mutation error → no local change, error shown, no fallback reload", async () => {
    postHandler = () => json({ ok: false, error: "استعد الطالب من الأرشيف أولًا." }, 409);
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("تعطيل الحساب"));
    await screen.findByText("استعد الطالب من الأرشيف أولًا.");
    expect(statusOf("علي")).toBe("فعّال");
    expect(stats()).toEqual(["3", "1", "1", "1", "1"]);
    expectNoReloads();
  });
});

describe("R32 — archive / unarchive", () => {
  it("archive: archived=true + active=false locally, no GET students, one GET classes", async () => {
    postHandler = () => ({ ok: true, archived: true, rosterSynced: true });
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("📦 أرشفة"));
    await screen.findByText("✓ تمت أرشفة الطالب مع الاحتفاظ ببياناته.");
    expect(statusOf("علي")).toBe("مؤرشف");
    expect(stats()).toEqual(["3", "0", "1", "2", "1"]);
    expect(within(rowOf("علي")).getByText("↩ استعادة")).toBeTruthy();
    expect(studentsGets()).toBe(0);
    expect(classesGets()).toBe(1);
  });

  it("unarchive: archived=false + active=true locally, no GET students, one GET classes", async () => {
    postHandler = () => ({ ok: true, archived: false, active: true, rosterSynced: true });
    await mount();
    expect(statusOf("خالد")).toBe("مؤرشف");
    fireEvent.click(within(rowOf("خالد")).getByText("↩ استعادة"));
    await screen.findByText("✓ تمت استعادة الطالب.");
    expect(statusOf("خالد")).toBe("فعّال");
    expect(stats()).toEqual(["3", "2", "1", "0", "2"]);
    expect(studentsGets()).toBe(0);
    expect(classesGets()).toBe(1);
  });

  it("archive with archived!==true (incomplete) → authoritative fallback, row untouched until then", async () => {
    postHandler = () => ({ ok: true, rosterSynced: true });
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("📦 أرشفة"));
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(firstIndex(isStudentsGet)).toBeLessThan(firstIndex(isClassesGet));
  });
});

describe("R32 — delete", () => {
  it("removes the row only after success, prunes the selection, no GET students, one GET classes", async () => {
    postHandler = () => ({ ok: true, deleted: true, rosterSynced: true });
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    await screen.findByText("1 طالب محدد");
    fireEvent.click(within(rowOf("علي")).getByText("حذف نهائي"));
    await screen.findByText("✓ تم حذف الطالب نهائيًا.");
    expect(screen.queryByText("علي")).toBeNull();
    expect(screen.queryByText("1 طالب محدد")).toBeNull();     // selectedIds pruned → bulk bar gone
    expect(badge()).toBe("2");
    expect(studentsGets()).toBe(0);
    expect(classesGets()).toBe(1);
  });

  it("deleted!==true → authoritative fallback", async () => {
    postHandler = () => ({ ok: true, rosterSynced: true });
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("حذف نهائي"));
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(screen.getByText("علي")).toBeTruthy();              // authoritative roster (mock) still has s1
  });
});

describe("R32 — edit", () => {
  it("same-class edit: merges the server document, preserves likes/submission counters, ZERO GETs", async () => {
    postHandler = (_a, body) => ({ ok: true, student: { ...S1, firstName: String(body.firstName), familyName: String(body.familyName), displayName: body.firstName + " " + body.familyName, identityNumber: "555555555", code: "555555555", submittedAssignmentsCount: undefined, likesCount: undefined }, passwordChanged: false, rosterSynced: true });
    await mount();
    const modal = await openEdit("علي");
    fireEvent.change(within(modal).getByLabelText("الاسم"), { target: { value: "عليّ" } });
    fireEvent.change(within(modal).getByLabelText("رقم الهوية"), { target: { value: "555555555" } });
    fireEvent.click(within(modal).getByText("💾 حفظ التعديلات"));
    await screen.findByText("✓ تم حفظ تعديلات الطالب.");
    const row = rowOf("عليّ");
    expect(within(row).getByText("555555555")).toBeTruthy();
    expect(within(row).getByText("❤️ 2")).toBeTruthy();
    expect(within(row).getByText("📚 الوظائف (3)")).toBeTruthy();
    expect(badge()).toBe("3");
    expectNoReloads();
  });

  it("move via edit: row leaves the source roster, selection pruned, one GET classes, no GET students", async () => {
    postHandler = () => ({ ok: true, student: { ...S1, classId: "c2" }, passwordChanged: false, rosterSynced: true });
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    const modal = await openEdit("علي");
    fireEvent.change(within(modal).getByLabelText("الصف"), { target: { value: "c2" } });
    fireEvent.click(within(modal).getByText("💾 حفظ التعديلات"));
    await screen.findByText("✓ تم تعديل الطالب ونقله إلى الصف المختار.");
    expect(screen.queryByText("علي")).toBeNull();
    expect(screen.queryByText(/طالب محدد/)).toBeNull();
    expect(badge()).toBe("2");
    expect(studentsGets()).toBe(0);
    expect(classesGets()).toBe(1);
  });

  it("incomplete update response (no student) → authoritative fallback, students then classes", async () => {
    postHandler = () => ({ ok: true, passwordChanged: false, rosterSynced: true });
    await mount();
    const modal = await openEdit("علي");
    fireEvent.click(within(modal).getByText("💾 حفظ التعديلات"));
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(firstIndex(isStudentsGet)).toBeLessThan(firstIndex(isClassesGet));
  });

  it("returned classId differs from the requested class → authoritative fallback (never patched locally)", async () => {
    postHandler = () => ({ ok: true, student: { ...S1, firstName: "غريب", classId: "c2" }, passwordChanged: false, rosterSynced: true });
    await mount();
    const modal = await openEdit("علي");                       // class select stays c1
    fireEvent.click(within(modal).getByText("💾 حفظ التعديلات"));
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(screen.queryByText("غريب")).toBeNull();
  });
});

describe("R32 — bulk paths, class switch and manual refresh stay authoritative", () => {
  it("bulk action still performs the full reload (students + classes)", async () => {
    postHandler = () => ({ ok: true, processed: 1, failed: 0, results: ["s1"], errors: [], credentials: [], rosterSynced: true });
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    await screen.findByText("1 طالب محدد");
    fireEvent.click(screen.getByRole("button", { name: "أرشفة" }));
    await screen.findByText(/نُفذت العملية على 1 طالب/);
    expect(calls.some(c => c.action === "bulkAction")).toBe(true);
    expect(studentsGets("c1")).toBe(1);
    expect(classesGets()).toBe(1);
  });

  it("bulk import still performs the full reload (students + classes)", async () => {
    postHandler = action => action === "previewImport"
      ? { ok: true, valid: 1, duplicates: 0, invalid: 0, preview: [{ index: 0, firstName: "ع", familyName: "ح", identityNumber: "123456789", status: "valid", error: "" }] }
      : { ok: true, imported: 1, failed: 0, duplicates: 0, rosterSynced: true, credentials: [{ userId: "u1", firstName: "ع", familyName: "ح", displayName: "ع ح", identityNumber: "123456789", code: "123456789", password: "Pw123456" }], errors: [] };
    const { container } = await mount();
    const file = new File([JSON.stringify([{ firstName: "ع", familyName: "ح", identityNumber: "123456789" }])], "r.json", { type: "application/json" });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    const importButton = () => screen.getByRole("button", { name: /استيراد/ }) as HTMLButtonElement;
    await waitFor(() => expect(importButton().disabled).toBe(false));
    fireEvent.click(importButton());
    await screen.findByText("Pw123456");
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
  });

  it("class switch loads the selected class roster authoritatively", async () => {
    await mount();
    fireEvent.click(screen.getByText("صف ثاني"));
    await screen.findByText("نور");
    expect(screen.queryByText("علي")).toBeNull();
    expect(studentsGets("c2")).toBe(1);
  });

  it("manual ↻ refreshes the selected roster FIRST and the classes list SECOND", async () => {
    await mount();
    const g = defer<void>(); gate = g.promise;
    fireEvent.click(screen.getByRole("button", { name: "↻ تحديث" }));
    await waitFor(() => expect(studentsGets("c1")).toBe(1));
    expect(classesGets()).toBe(0);
    g.resolve();
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(firstIndex(isStudentsGet)).toBeLessThan(firstIndex(isClassesGet));
  });
});

describe("R32 — class-switch race during an in-flight single-row mutation", () => {
  it("a toggle response for class A never patches the roster of class B selected meanwhile", async () => {
    const d = defer<unknown>();
    postHandler = action => action === "toggleActive" ? d.promise : { ok: true };
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("تعطيل الحساب"));
    await waitFor(() => expect(calls.some(c => c.action === "toggleActive")).toBe(true));
    fireEvent.click(screen.getByText("صف ثاني"));               // switch while the mutation is in flight
    await screen.findByText("نور");
    const getsBefore = studentsGets();
    d.resolve({ ok: true, active: false });
    await screen.findByText("✓ تم تعطيل حساب الطالب.");
    expect(screen.getByText("نور")).toBeTruthy();
    expect(statusOf("نور")).toBe("فعّال");                        // B's row untouched
    expect(screen.queryByText("علي")).toBeNull();                 // A's row not injected
    expect(badge()).toBe("1");
    expect(studentsGets()).toBe(getsBefore);                      // and no extra roster fetch either
    expect(classesGets()).toBe(0);
  });

  it("rosterSynced:false for class A after switching to B: self-heal GET students for A runs WITHOUT replacing B's roster, then classes reload", async () => {
    const d = defer<unknown>();
    postHandler = action => action === "archive" ? d.promise : { ok: true };
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("📦 أرشفة"));
    await waitFor(() => expect(calls.some(c => c.action === "archive")).toBe(true));
    fireEvent.click(screen.getByText("صف ثاني"));
    await screen.findByText("نور");
    calls = [];
    d.resolve({ ok: true, archived: true, rosterSynced: false });
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);                           // authoritative/self-heal read for the ORIGINAL class
    expect(studentsGets("c2")).toBe(0);
    expect(firstIndex(isStudentsGet)).toBeLessThan(firstIndex(isClassesGet));
    expect(screen.getByText("نور")).toBeTruthy();                 // visible roster is still class B's
    expect(screen.queryByText("علي")).toBeNull();
    expect(screen.queryByText("خالد")).toBeNull();
    expect(badge()).toBe("1");
  });

  it("a delete response for class A does not remove or alter anything in class B", async () => {
    const d = defer<unknown>();
    postHandler = action => action === "delete" ? d.promise : { ok: true };
    await mount();
    fireEvent.click(within(rowOf("علي")).getByText("حذف نهائي"));
    await waitFor(() => expect(calls.some(c => c.action === "delete")).toBe(true));
    fireEvent.click(screen.getByText("صف ثاني"));
    await screen.findByText("نور");
    calls = [];
    d.resolve({ ok: true, deleted: true, rosterSynced: true });
    await screen.findByText("✓ تم حذف الطالب نهائيًا.");
    expect(screen.getByText("نور")).toBeTruthy();
    expect(badge()).toBe("1");
    expect(studentsGets()).toBe(0);
    expect(classesGets()).toBe(1);                                // count-changing → classes may still refresh
  });
});

describe("R32 review fix — MOVE is a TWO-class operation (source index + target index)", () => {
  const moveResponse = (rosterSynced: boolean) => ({ ok: true, student: { ...S1, classId: "c2" }, passwordChanged: false, rosterSynced });
  async function startMove() {
    const modal = await openEdit("علي");
    fireEvent.change(within(modal).getByLabelText("الصف"), { target: { value: "c2" } });
    fireEvent.click(within(modal).getByText("💾 حفظ التعديلات"));
  }
  const idx = (classId: string) => firstIndex(c => isStudentsGet(c) && c.url.includes("classId=" + classId));

  it("A. move + rosterSynced:false → GET students(source) once, GET students(target) once, BOTH before GET classrooms; no foreign roster committed", async () => {
    postHandler = () => moveResponse(false);
    await mount();
    await startMove();
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(studentsGets("c2")).toBe(1);
    expect(idx("c1")).toBeLessThan(idx("c2"));
    expect(idx("c2")).toBeLessThan(firstIndex(isClassesGet));
    // c1 stays selected: its authoritative roster renders; the target's repair-only read never shows here.
    expect(screen.getByText("سارة")).toBeTruthy();
    expect(screen.queryByText("نور")).toBeNull();
    await screen.findByText(/وسيتم تحديث عداد الصف تلقائيًا/);
  });

  it("B. move in flight, teacher switches to TARGET before the response → authoritative GET students(target) AFTER the move, no local injection, classes reloaded once", async () => {
    const d = defer<unknown>();
    postHandler = action => action === "update" ? d.promise : { ok: true };
    await mount();
    await startMove();
    await waitFor(() => expect(calls.some(c => c.action === "update")).toBe(true));
    fireEvent.click(screen.getByText("صف ثاني"));               // pre-move target roster renders (no علي yet)
    await screen.findByText("نور");
    expect(screen.queryByText("علي")).toBeNull();
    calls = [];
    ROSTERS.c2 = [T1, { ...S1, classId: "c2" }];                 // the move commits server-side …
    d.resolve(moveResponse(true));                               // … and the response arrives
    await screen.findByText("✓ تم تعديل الطالب ونقله إلى الصف المختار.");
    await waitFor(() => expect(studentsGets("c2")).toBe(1));     // authoritative re-read of the TARGET after the move
    expect(studentsGets("c1")).toBe(0);
    await screen.findByText("علي");                              // now visible from the authoritative roster, not from the response
    expect(screen.getByText("نور")).toBeTruthy();
    expect(badge()).toBe("2");
    expect(firstIndex(c => c.action === "update")).toBe(-1);     // (calls were reset after the POST was issued)
    expect(idx("c2")).toBeLessThan(firstIndex(isClassesGet));
    expect(classesGets()).toBe(1);
  });

  it("C1. move in flight, teacher switches to an UNRELATED class → success needs no roster GET; no source/target contamination; classes refreshed once", async () => {
    const d = defer<unknown>();
    postHandler = action => action === "update" ? d.promise : { ok: true };
    await mount();
    await startMove();
    await waitFor(() => expect(calls.some(c => c.action === "update")).toBe(true));
    fireEvent.click(screen.getByText("صف ثالث"));
    await screen.findByText("ريم");
    calls = [];
    d.resolve(moveResponse(true));
    await screen.findByText("✓ تم تعديل الطالب ونقله إلى الصف المختار.");
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets()).toBe(0);
    expect(screen.getByText("ريم")).toBeTruthy();
    expect(screen.queryByText("علي")).toBeNull();
    expect(screen.queryByText("نور")).toBeNull();
    expect(badge()).toBe("1");
  });

  it("C2. move in flight, switched to an UNRELATED class, rosterSynced:false → BOTH source and target are repaired (repair-only), visible roster untouched, then classes", async () => {
    const d = defer<unknown>();
    postHandler = action => action === "update" ? d.promise : { ok: true };
    await mount();
    await startMove();
    await waitFor(() => expect(calls.some(c => c.action === "update")).toBe(true));
    fireEvent.click(screen.getByText("صف ثالث"));
    await screen.findByText("ريم");
    calls = [];
    d.resolve(moveResponse(false));
    await waitFor(() => expect(classesGets()).toBe(1));
    expect(studentsGets("c1")).toBe(1);
    expect(studentsGets("c2")).toBe(1);
    expect(studentsGets("c3")).toBe(0);
    expect(idx("c1")).toBeLessThan(idx("c2"));
    expect(idx("c2")).toBeLessThan(firstIndex(isClassesGet));
    expect(screen.getByText("ريم")).toBeTruthy();                // c3 view never replaced by c1's or c2's roster
    expect(screen.queryByText("علي")).toBeNull();
    expect(screen.queryByText("سارة")).toBeNull();
    expect(screen.queryByText("نور")).toBeNull();
    expect(badge()).toBe("1");
  });
});
