// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor, act } from "@testing-library/react";
import StudentExamPage from "../StudentExamPage";

// Phase 17A — C21 / C22 / C23 + strict policy: the REAL StudentExamPage against the REAL student-submission / student-assignment
// handlers on the in-memory blob store (the Phase 7A harness). The code answer travels through the EXISTING Answer → autosave →
// draft pipeline (no second persistence system, no coding timer): write code → autosave → unmount → remount → the exact source
// (indentation, blank lines, Arabic comments, emoji) is restored; pause → resume keeps it and the server-owned remaining time;
// the editor never bypasses the strict-attempt exit and never blocks the clipboard on its own.
const nodeRequire = createRequire(import.meta.url);
const { handler: submissionHandler } = nodeRequire("../../api/src/functions/student-submission.js");
const { handler: assignmentHandler } = nodeRequire("../../api/src/functions/student-assignment.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

const S1 = "11111111-1111-1111-1111-111111111111";
const AID = "asg-17a";
const CFG = {
  allowedLanguages: ["python", "csharp"], defaultLanguage: "python",
  starterCode: { python: "import sys\n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 },
  publicTests: [{ id: "pub-1", input: "2 3\n", sampleOutput: "5\n" }]
};
const EXAM = { title: "امتحان البرمجة", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "coding", questionTypeVersion: 1, text: "سؤال البرمجة السري", marks: 10, coding: CFG, answer: { hiddenTests: [{ id: "h1", input: "1 1\n", expectedOutput: "2\n", weight: 1 }], comparator: "trimTrailingWhitespace", referenceSolutions: {} } }] }] };
// Exactly what a student may type: tabs and deep indentation, blank lines, trailing spaces, Arabic comments, emoji, astral chars.
const SOURCE = "import sys\n# اقرأ عددين — تعليق عربي ✓ 😀\n\ndef main():\n\ta, b = map(int, sys.stdin.read().split())\n        print(a + b)   \n\n\nmain()\n";

type Call = { method: string; url: string; body: Record<string, unknown>; keepalive: boolean };
let ctx: ReturnType<typeof createMemoryContainer>, calls: Call[], vis: "visible" | "hidden";
const posts = (action: string) => calls.filter(c => c.method === "POST" && c.body.action === action);
const doc = () => ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json");

function seed(policy: string, durationMinutes = 60) {
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    ["platform/classes/c1.json"]: { classId: "c1", name: "الصف", active: true, studentIds: [] },
    ["platform/assignments/" + AID + ".json"]: { schemaVersion: 2, attemptModelVersion: policy === "continuous" ? 2 : 3, attemptPolicy: policy, assignmentId: AID, classId: "c1", title: "واجب البرمجة", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 24 * 3600e3).toISOString(), maxAttempts: 1, durationMinutes, questionCount: 1, totalMarks: 10, examSnapshot: EXAM }
  });
}
const deps = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {} });
const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: () => null } }) as unknown as Response;

beforeEach(() => {
  vis = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => vis });
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  sessionStorage.clear();
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, url, body, keepalive: init?.keepalive === true });
    if (url.includes("/api/student-submission/")) {
      const r = await submissionHandler({ method, params: { assignmentId: AID }, headers: { get: () => null }, json: async () => body }, deps());
      return res(r.status, r.jsonBody);
    }
    if (url.includes("/api/student-assignment/")) {
      const r = await assignmentHandler({ method, params: { assignmentId: AID }, headers: { get: () => null } }, deps());
      return res(r.status, r.jsonBody);
    }
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount(onBack = vi.fn()) {
  const r = await assignmentHandler({ method: "GET", params: { assignmentId: AID }, headers: { get: () => null } }, deps());
  const view = render(<StudentExamPage token="t" assignment={r.jsonBody.assignment} studentName="أحمد" className="الصف" onBack={onBack} onLogout={() => {}} />);
  return { ...view, onBack };
}
async function startAttempt() {
  fireEvent.click(await screen.findByRole("button", { name: "بدء المحاولة" }));
  await screen.findByText("سؤال البرمجة السري");
  await act(async () => {});
}
const editor = async () => (await screen.findByRole("textbox", { name: /محرر الكود/ }, { timeout: 4000 })) as HTMLTextAreaElement;
function hide() { vis = "hidden"; act(() => { document.dispatchEvent(new Event("visibilitychange")); }); }

describe("C21 / C22 — code answer autosaves through the existing pipeline and restores byte-for-byte", () => {
  it("write code → autosave (existing saveDraft, canonical Answer) → unmount → remount → the exact source", async () => {
    seed("continuous");
    const first = await mount();
    await startAttempt();
    expect(JSON.stringify(calls.map(c => c.body))).not.toMatch(/hiddenTests|expectedOutput/);
    const ta = await editor();
    expect(ta.value).toBe("import sys\n");                                                            // starter code
    fireEvent.change(ta, { target: { value: SOURCE } });
    await waitFor(() => expect(doc()?.draftAnswers?.q1).toBeTruthy(), { timeout: 4000 });
    expect(doc().draftAnswers).toEqual({ q1: { kind: "code", language: "python", languageVersion: 1, source: SOURCE } });
    expect(doc().draftAnswers.q1.source).toBe(SOURCE);
    const saves = posts("saveDraft");
    expect(saves.length).toBeGreaterThan(0);
    expect(saves.at(-1)!.body.answers).toEqual({ q1: { kind: "code", language: "python", languageVersion: 1, source: SOURCE } });
    first.unmount(); cleanup();
    calls = [];
    await mount();
    const restored = await editor();
    expect(restored.value).toBe(SOURCE);
    expect(posts("saveDraft")).toHaveLength(0);                                                       // hydration is not an edit
  });
  it("the selected language persists through autosave and restore", async () => {
    seed("continuous");
    const first = await mount();
    await startAttempt();
    fireEvent.change(await screen.findByRole("combobox", { name: "لغة البرمجة" }), { target: { value: "csharp" } });
    fireEvent.change(await editor(), { target: { value: "Console.WriteLine(5);\n" } });
    await waitFor(() => expect(doc()?.draftAnswers?.q1?.language).toBe("csharp"), { timeout: 4000 });
    first.unmount(); cleanup();
    await mount();
    expect(((await screen.findByRole("combobox", { name: "لغة البرمجة" }, { timeout: 4000 })) as HTMLSelectElement).value).toBe("csharp");
    expect((await editor()).value).toBe("Console.WriteLine(5);\n");
  });
  it("no coding-specific persistence: the editor writes nothing to localStorage / sessionStorage and adds no request of its own", async () => {
    seed("continuous");
    localStorage.clear(); sessionStorage.clear();
    const ls = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    await startAttempt();
    fireEvent.change(await editor(), { target: { value: "print(1)\n" } });
    fireEvent.change(await editor(), { target: { value: "print(12)\n" } });
    fireEvent.change(await editor(), { target: { value: "print(123)\n" } });
    await waitFor(() => expect(doc()?.draftAnswers?.q1?.source).toBe("print(123)\n"), { timeout: 4000 });
    expect(ls.mock.calls.filter(c => /code|coding|q1/.test(String(c[0])))).toEqual([]);
    // the storages themselves (a spy on Storage.prototype does not see every implementation's writes): no key and no value
    // anywhere carries the code — the canonical Answer + server draft are the ONLY persistence
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i) || "", v = store.getItem(k) || "";
        expect(k, "storage key " + k).not.toMatch(/code|coding|q1/i);
        expect(v, "storage value of " + k).not.toMatch(/print\(1/);
      }
    }
    // Phase 17B (deliberate pin update): the coding renderer may ask ONCE which languages the trusted runner offers
    // (GET /api/coding/capabilities, through the exam page's attempt seam); it never runs code on its own and adds no
    // other request — persistence is still only the existing student-submission draft pipeline.
    expect(calls.filter(c => !/\/api\/student-(submission|assignment)\//.test(c.url)).map(c => c.method + " " + c.url)).toEqual(["GET /api/coding/capabilities"]);
    expect(posts("saveDraft").length).toBeLessThanOrEqual(2);                                          // debounced by the existing cadence, not per keystroke
  });
});

describe("C23 — pause / resume preserves the source; server-owned time unchanged", () => {
  it("«حفظ مؤقت والخروج» stores the code with the pause; «متابعة المحاولة» resumes the SAME attempt with the exact source", async () => {
    seed("pausable", 60);
    const first = await mount();
    await startAttempt();
    fireEvent.change(await editor(), { target: { value: SOURCE } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ مؤقت والخروج" }));
    fireEvent.click(await screen.findByRole("button", { name: "حفظ والخروج" }));
    await waitFor(() => expect(first.onBack).toHaveBeenCalled());
    expect(doc().activeAttempt).toMatchObject({ status: "paused", attemptNumber: 1 });
    expect(doc().draftAnswers).toEqual({ q1: { kind: "code", language: "python", languageVersion: 1, source: SOURCE } });
    const remaining = doc().activeAttempt.pausedRemainingMs;
    expect(remaining).toBeGreaterThan(59 * 60e3); expect(remaining).toBeLessThanOrEqual(60 * 60e3);
    first.unmount();
    calls = [];
    await mount();
    expect(await screen.findByText("لديك محاولة محفوظة مؤقتًا")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "متابعة المحاولة" }));
    await screen.findByText("سؤال البرمجة السري");
    expect((await editor()).value).toBe(SOURCE);
    expect(posts("startAttempt")).toHaveLength(0);
    expect(doc().activeAttempt).toMatchObject({ attemptNumber: 1, status: "draft" });
  });
});

describe("Strict policy and clipboard — the editor never bypasses the existing exam policy", () => {
  it("typing / Tab / Enter in the code editor never ends a strict exam; hiding the page still ends it exactly once", async () => {
    seed("strict");
    await mount();
    await startAttempt();
    const ta = await editor();
    fireEvent.change(ta, { target: { value: "x" } });
    fireEvent.keyDown(ta, { key: "Tab" }); fireEvent.keyDown(ta, { key: "Enter" }); fireEvent.keyDown(ta, { key: "Escape" });
    act(() => { window.dispatchEvent(new Event("blur")); });
    await new Promise(r => setTimeout(r, 30));
    expect(posts("finalizeIntegrityExit")).toHaveLength(0);
    hide();
    await waitFor(() => expect(posts("finalizeIntegrityExit")).toHaveLength(1));
  });
  it("paste / copy are not intercepted by the coding editor (the exam has no clipboard restriction to bypass or to add)", async () => {
    seed("continuous");
    await mount();
    await startAttempt();
    const ta = await editor();
    expect(fireEvent.paste(ta)).toBe(true);
    expect(fireEvent.copy(ta)).toBe(true);
    expect(fireEvent.cut(ta)).toBe(true);
  });
});
