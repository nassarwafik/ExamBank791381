// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import vm from "node:vm";
import { render, cleanup, screen, act, waitFor } from "@testing-library/react";
import StudentExamPage from "../StudentExamPage";
import { answered } from "../answerState";
import { createMemoryContainer } from "../../api/tests/fixtures/memory-container.js";
import { vanillaPackage } from "../../api/tests/fixtures/smartsim-zip.js";
import { uploadHandler, runtimeHandler } from "../../api/src/functions/simulators.js";
import { packageAvailabilityIssues } from "../../api/src/lib/smartsim/package-store.js";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";
import * as structure from "../../api/src/lib/exam-structure.js";
import * as bridge from "./smartsimBridge";

// Phase 16B-A — VERTICAL PROOF with the counter simulator: upload the real .smartsim (memory container) → store → question
// pins the exact identity → the exam is sanitized for the student → StudentExamPage renders the sandbox host → the SERVED
// dist/index.html (fetched through the runtime route with its CSP headers) is executed by node:vm against a tiny fake DOM,
// wired to the REAL host through MessageEvents whose source is the real iframe window → click "+" ×3 → Answer state count 3 →
// autosave posts {kind:"simulation", state:{count:3}} through the EXISTING saveDraft pipeline → unmount → remount with the
// server draft → the simulator receives SMARTSIM_INIT savedState count 3 → its output shows 3 → the server grader gives the
// simulation ZERO authority (manual review). happy-dom does not run iframe scripts, hence the vm bridge (documented).
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeQuestion = (grading as unknown as { gradeQuestion: (q: unknown, r: unknown) => { score: number; manualReview: boolean; correct: boolean } }).gradeQuestion;
const isResponseAnswered = (structure as unknown as { isResponseAnswered: (r: unknown) => boolean }).isResponseAnswered;

const OWNER = { ok: true, user: { sub: "teacher-a", role: "teacher" } };
const makeDeps = (c: ReturnType<typeof createMemoryContainer>) => ({ getContainer: async () => c.container, requireBuilderAuth: () => OWNER });
const uploadReq = (buf: Buffer, name = "counter.smartsim") => ({ method: "POST", url: "https://app.example/api/simulators/upload", headers: new Map([["x-file-name", encodeURIComponent(name)], ["content-length", String(buf.length)]]), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });

/** Minimal DOM the counter's inline script needs: getElementById → elements with addEventListener / textContent / click. */
type FakeEl = { textContent: string; listeners: Record<string, Array<() => void>>; addEventListener: (t: string, f: () => void) => void; click: () => void };
function fakeSimulatorWindow(hostWindow: Window, iframeWindow: Window) {
  const elements = new Map<string, FakeEl>();
  const el = (id: string): FakeEl => {
    let e = elements.get(id);
    if (!e) {
      const listeners: Record<string, Array<() => void>> = {};
      e = { textContent: id === "count" ? "0" : "", listeners, addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, click: () => { for (const f of listeners.click || []) f(); } };   // mirrors <output id="count">0</output>
      elements.set(id, e);
    }
    return e;
  };
  const simListeners: Array<(e: { data: unknown }) => void> = [];
  // a real postMessage STRUCTURED-CLONES the data into the receiving realm; JSON round-trip stands in for that here (the vm realm's
  // Object.prototype is not the host realm's — exactly the class-instance case the host's normalizer refuses on purpose)
  const parent = { postMessage: (data: unknown) => { hostWindow.dispatchEvent(new MessageEvent("message", { data: JSON.parse(JSON.stringify(data)), source: iframeWindow, origin: "null" })); } };
  const win = { parent, addEventListener: (t: string, f: (e: { data: unknown }) => void) => { if (t === "message") simListeners.push(f); }, document: { getElementById: el } };
  const ctx = vm.createContext({ window: win, document: win.document, console });
  return { ctx, el, deliver: (data: unknown) => { for (const f of simListeners) f({ data: JSON.parse(JSON.stringify(data)) }); } };
}

const START = "2026-01-01T10:00:00.000Z", SERVER_NOW = "2026-01-01T10:30:00.000Z";
const stateWith = (draftAnswers: unknown) => ({ attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "", durationMinutes: 0, timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: SERVER_NOW, activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: true, draftAnswers, draftSavedAt: "", latestResult: null, attempts: [] });
const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 300, status, headers: { get: () => null }, json: async () => body } as unknown as Response);

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("E2E — counter simulator: upload → store → question → student → click ×3 → autosave → remount → restore", () => {
  it("runs the whole vertical", async () => {
    // 1. upload the real package (server validation + content addressing)
    const c = createMemoryContainer();
    const zip = vanillaPackage();
    const up = await uploadHandler(uploadReq(zip), makeDeps(c));
    expect(up.status).toBe(201);
    const pkg = up.jsonBody!.package!;
    expect(pkg.packageId).toBe("counter-sim"); expect(pkg.packageVersion).toBe(1); expect(pkg.packageHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const hex = pkg.packageHash.slice(7);

    // 2. the teacher question pins the EXACT identity; the server availability gate accepts it and refuses a different hash
    const ref = { packageId: pkg.packageId, packageVersion: pkg.packageVersion, packageHash: pkg.packageHash, runtimeVersion: 1, entry: pkg.entry, title: pkg.title };
    const teacherExam = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "simulation", questionTypeVersion: 1, text: "اضغط ثلاث مرات", marks: 5, simulation: ref, answer: { assertions: [{ path: "count", equals: 3 }] } }] }] };
    expect(await packageAvailabilityIssues(c.container, [ref])).toEqual([]);
    expect((await packageAvailabilityIssues(c.container, [{ ...ref, packageHash: "sha256:" + "00".repeat(32) }])).map((i: { code: string }) => i.code)).toEqual(["SIM_PACKAGE_UNAVAILABLE"]);

    // 3. the served entry document is the package's dist/index.html with the sandbox CSP headers
    const served = await runtimeHandler({ method: "GET", url: "https://app.example/api/simulators/runtime/counter-sim/1/" + hex + "/index.html", params: { packageId: "counter-sim", packageVersion: "1", hash: hex, assetPath: "index.html" }, headers: new Map() }, makeDeps(c));
    expect(served.status).toBe(200);
    const h = served.headers!;
    expect(h["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'"); expect(h["Content-Security-Policy"]).toContain("connect-src 'none'");
    expect(h["Cache-Control"]).toBe("no-cache");                                                             // RF: the entry DOCUMENT revalidates
    expect(h["Content-Security-Policy"]).toMatch(/^sandbox allow-scripts;/);
    const html = Buffer.from(served.body!).toString("utf8");
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    expect(html).not.toContain("answer"); expect(html).not.toContain("assertions");

    // 4. student view through the REAL StudentExamPage with a mocked API (existing autosave pipeline)
    const studentExam = sanitizeExamForStudent(teacherExam) as { sections: { questions: { simulation: unknown; answer?: unknown }[] }[] };
    expect(studentExam.sections[0].questions[0].simulation).toEqual(ref);
    expect(studentExam.sections[0].questions[0].answer ?? {}).toEqual({});
    const assignment = { assignmentId: "asg-sim", title: "واجب المحاكاة", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 5, exam: studentExam };
    const saves: unknown[] = [];
    let serverDraft: unknown = {};
    (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/api/student-submission/")) {
        if (!init || !init.method || init.method === "GET") return json(200, { ok: true, state: stateWith(serverDraft) });
        const b = JSON.parse(String(init.body));
        if (b.action === "saveDraft") { saves.push(b.answers); serverDraft = b.answers; return json(200, { ok: true, state: { ...stateWith(b.answers), draftSavedAt: SERVER_NOW } }); }
        return json(200, { ok: true, state: stateWith(serverDraft) });
      }
      return json(404, { ok: false });
    }) as unknown as typeof fetch;
    const mount = () => render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
    let r = mount();
    const frame = (await screen.findByTestId("smartsim-frame", {}, { timeout: 4000 })) as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/api/simulators/runtime/counter-sim/1/" + hex + "/index.html");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");

    // 5. run the SERVED script in a vm "iframe" wired to the real host
    const wire = (iframe: HTMLIFrameElement) => {
      const sim = fakeSimulatorWindow(window, iframe.contentWindow!);
      vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation((data: unknown) => { sim.deliver(data); });
      act(() => { vm.runInContext(script, sim.ctx); });                                                        // the package emits SMARTSIM_READY here
      return sim;
    };
    // in a browser the package script runs only after the frame document loaded, i.e. after the host committed and attached its
    // listener; give happy-dom the same ordering (its iframe window is created asynchronously after connect)
    const settle = () => act(async () => { await new Promise(res => setTimeout(res, 30)); });
    await settle();
    let sim = wire(frame);
    await settle();
    expect(sim.el("count").textContent).toBe("0");
    expect(screen.queryByText(/جارٍ تحميل المحاكاة/), "READY handshake completed").toBeNull();
    for (let i = 0; i < 3; i++) act(() => { sim.el("inc").click(); });
    expect(sim.el("count").textContent).toBe("3");
    await waitFor(() => { expect(document.querySelector(".iex-q.done"), "the card counts the simulation as answered").toBeTruthy(); }, { timeout: 2000 });
    await waitFor(() => { expect(saves.length).toBeGreaterThan(0); }, { timeout: 4000 });
    const last = saves[saves.length - 1] as Record<string, unknown>;
    expect(last.q1).toEqual({ kind: "simulation", state: { count: 3 } });
    expect(answered(last.q1 as never)).toBe(true); expect(isResponseAnswered(last.q1)).toBe(true);
    expect(JSON.stringify(saves)).not.toMatch(/SMARTSIM_SCORE|score/);

    // 6. unmount → remount → restore 3 through SMARTSIM_INIT savedState
    r.unmount(); cleanup();
    r = mount();
    const frame2 = (await screen.findByTestId("smartsim-frame", {}, { timeout: 4000 })) as HTMLIFrameElement;
    await settle();
    sim = wire(frame2);
    await settle();
    expect(screen.queryByText(/جارٍ تحميل المحاكاة/), "READY handshake completed after remount").toBeNull();
    expect(sim.el("count").textContent).toBe("3");

    // 7. the uploaded JavaScript has ZERO grading authority: the server grader routes simulation@1 to manual review
    const graded = gradeQuestion(teacherExam.sections[0].questions[0], { kind: "simulation", state: { count: 3 } });
    expect(graded).toMatchObject({ score: 0, manualReview: true, correct: false });
    expect(gradeQuestion(teacherExam.sections[0].questions[0], { kind: "simulation", state: { count: 3, score: 100, passed: true } })).toMatchObject({ score: 0, manualReview: true });
    expect(bridge.SMARTSIM_PROTOCOL_VERSION).toBe(1);
    r.unmount();
  }, 20_000);
});
