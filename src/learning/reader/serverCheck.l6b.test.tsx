// @vitest-environment happy-dom
// Phase L.6b — the in-page exercises of a SERVED body (no key, no feedback, no hint in the browser): every answer is asked of the
// host and the verdict, the message, the hints and the explanation shown are the server's; a reply is awaited visibly; a transport
// failure is never a wrong answer (it says so and offers a retry); a distinct answer is asked once; a late reply to an older answer
// is not shown; without a host the block is static. Then end to end: the Reader over the REAL content and study handlers.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import PracticeBlockView from "./PracticeBlockView";
import PracticeTableView from "./PracticeTableView";
import LearningReaderWithTraining from "../training/LearningReaderWithTraining";
import { loadCourseManifest, hasModuleContent } from "../content/registry";
import { loadModuleBody } from "../content/moduleBodySource.server";
import { createStudyClient } from "../study/studyClient";
import { loadBundledModuleContent } from "../content/bundledModules";
import type { ReaderContentApi } from "./readerContentApi";
import type { StudyAttemptResponse, StudyHost, StudyResponse } from "../study/types";
import type { PracticeQuestion, PracticeTableBlock } from "../content/types";
import type { CheckIndex } from "../study/checkIndex";
// @ts-expect-error — the API handlers and fixture are untyped CommonJS modules, used here on purpose to run the real server.
import { handler as contentHandler } from "../../../api/src/functions/learning-content.js";
// @ts-expect-error — see above.
import { handler as studyHandler } from "../../../api/src/functions/learning-study.js";
import { createMemoryContainer } from "../../../api/tests/fixtures/memory-container.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const MC: PracticeQuestion = { kind: "multipleChoice", prompt: "أي وضع لجهاز واحد؟", options: [{ id: "o1", text: "Access" }, { id: "o2", text: "Trunk" }] };
const SI: PracticeQuestion = { kind: "shortInput", prompt: "اكتب اسم الأمر" };
const TABLE: PracticeTableBlock = { id: "tbl", type: "practice-table", origin: "book", serverCheck: true, headers: ["العنوان", "الحكم"], rows: [["10.0.0.1", { kind: "select", options: ["خاص", "عام"] }], ["8.8.8.8", { kind: "select", options: ["خاص", "عام"] }]] };
const reply = (over: Partial<StudyAttemptResponse> = {}): StudyAttemptResponse => ({ ok: true, actor: "student", correct: false, persisted: false, alreadyCompleted: false, gained: 0, study: true, page: { pageId: "p1", moduleId: "m1", completed: [], eligible: 3 }, module: { completed: 0, eligible: 3, points: 0, max: 20 }, totalPoints: 0, ...over });
const WRONG = reply({ feedback: { message: "راجع عدد الأجهزة", hints: ["تلميح الخادم الأول", "تلميح الخادم الثاني"] } });
const RIGHT = reply({ correct: true, persisted: true, gained: 7, feedback: { message: "أحسنت من الخادم", explanation: "شرح الخادم" }, module: { completed: 1, eligible: 3, points: 7, max: 20 } });
type Deferred = { promise: Promise<StudyAttemptResponse>; resolve: (r: StudyAttemptResponse) => void; reject: (e: unknown) => void };
const deferred = (): Deferred => { let resolve!: Deferred["resolve"], reject!: Deferred["reject"]; const promise = new Promise<StudyAttemptResponse>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function host(impl: (pageId: string, activityId: string, r: StudyResponse) => Promise<StudyAttemptResponse>) {
  const report = vi.fn(impl);
  return { pageStatus: () => ({ kind: "ready", completed: new Set<string>(), eligible: 3, module: null }), report } as StudyHost & { report: typeof report };
}
const mcJudge = async (_p: string, _a: string, r: StudyResponse) => (r.kind === "multipleChoice" && r.optionId === "o1" ? RIGHT : WRONG);

describe("PracticeBlockView — a served question is judged by the server", () => {
  it("every answer is asked; the reply is awaited visibly; the server's verdict, message, hint ladder and explanation are shown", async () => {
    const pending: Deferred[] = [];
    const h = host(() => { const d = deferred(); pending.push(d); return d.promise; });
    const { container } = render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} serverCheck />);
    expect(container.querySelector(".learning-reader-practice-verdict")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Trunk/ }));
    expect(h.report).toHaveBeenCalledWith("p1", "q1", { kind: "multipleChoice", optionId: "o2" });
    expect(screen.getByRole("status").textContent).toBe("جارٍ التحقق من إجابتك…");
    expect(screen.queryByText(/غير صحيح/)).toBeNull();
    pending[0].resolve(WRONG);
    await screen.findByText(/✕ غير صحيح — حاول مرة أخرى/);
    expect(screen.getByText("راجع عدد الأجهزة")).toBeTruthy();
    expect(screen.queryByText("شرح الخادم")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ماذا أفحص؟ (تلميح)" }));
    expect(within(screen.getByRole("list", { name: "التلميحات" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["تلميح 1تلميح الخادم الأول"]);
    fireEvent.click(screen.getByRole("button", { name: "تلميح آخر" }));
    expect(within(screen.getByRole("list", { name: "التلميحات" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "تلميح آخر" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    expect(h.report).toHaveBeenCalledTimes(2);
    pending[1].resolve(RIGHT);
    await screen.findByText(/✓ صحيح/);
    expect(screen.getByText("أحسنت من الخادم")).toBeTruthy();
    expect(screen.getByText("شرح الخادم")).toBeTruthy();
    expect(screen.getByText(/\+7 نقطة قوة/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "التلميحات" })).toBeNull();
  });

  it("a distinct answer is asked once: picking it again reuses the server's reply", async () => {
    const h = host(mcJudge);
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} serverCheck />);
    fireEvent.click(screen.getByRole("radio", { name: /Trunk/ }));
    await screen.findByText("راجع عدد الأجهزة");
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText("أحسنت من الخادم");
    fireEvent.click(screen.getByRole("radio", { name: /Trunk/ }));
    expect(screen.getByText("راجع عدد الأجهزة")).toBeTruthy();                    // at once, from the earlier reply
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    expect(screen.getByText("أحسنت من الخادم")).toBeTruthy();
    expect(screen.queryByText(/نقطة قوة/)).toBeNull();                              // a re-pick never repeats the +n line
    expect(h.report).toHaveBeenCalledTimes(2);
  });

  it("a transport failure is never a wrong answer: it says so and the retry asks again", async () => {
    let fail = true;
    const h = host(async (...a) => { if (fail) throw new Error("offline"); return mcJudge(...a); });
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} serverCheck />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText("تعذّر التحقق من إجابتك الآن. تحقق من الاتصال ثم أعد المحاولة.");
    expect(screen.queryByText(/غير صحيح/)).toBeNull();
    expect(screen.queryByText(/✓ صحيح/)).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    await screen.findByText("أحسنت من الخادم");
    expect(h.report).toHaveBeenCalledTimes(2);
  });

  it("a late reply to an older answer is never shown for the answer on screen", async () => {
    const pending: Deferred[] = [];
    const h = host(() => { const d = deferred(); pending.push(d); return d.promise; });
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} serverCheck />);
    fireEvent.click(screen.getByRole("radio", { name: /Trunk/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    pending[0].resolve(WRONG);                                                       // the reply to Trunk arrives first
    await waitFor(() => {});
    expect(screen.queryByText(/غير صحيح/)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("جارٍ التحقق من إجابتك…");
    pending[1].resolve(RIGHT);
    await screen.findByText("أحسنت من الخادم");
    fireEvent.click(screen.getByRole("radio", { name: /Trunk/ }));
    expect(screen.getByText("راجع عدد الأجهزة")).toBeTruthy();                       // the late reply was kept for reuse
    expect(h.report).toHaveBeenCalledTimes(2);
  });

  it("a short answer is sent on «تحقّق»; editing it withdraws the verdict", async () => {
    const h = host(async (_p, _a, r) => (r.kind === "shortInput" && r.text === "vlan" ? RIGHT : WRONG));
    render(<PracticeBlockView question={SI} activityId="q2" pageId="p1" study={h} serverCheck />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "vlan" } });
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await screen.findByText("أحسنت من الخادم");
    expect(h.report).toHaveBeenCalledWith("p1", "q2", { kind: "shortInput", text: "vlan" });
    fireEvent.change(input, { target: { value: "vla" } });
    expect(screen.queryByText("أحسنت من الخادم")).toBeNull();
  });

  it("a self-check block: judged, and never promises or shows a study point", async () => {
    const h = host(async () => ({ ...RIGHT, study: false, persisted: false, gained: 0 }));
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} serverCheck studyEligible={false} />);
    expect(screen.getByText("تمرين ذاتي: أجب لترى النتيجة فورًا. لا يُحفظ شيء ولا تُحسب نقاط.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText("أحسنت من الخادم");
    expect(document.querySelector(".learning-reader-study-outcome")).toBeNull();
  });

  it("without a host a served question is static: nothing to answer, nothing sent, an honest note", () => {
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" serverCheck />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("التحقق من هذه الإجابة يتم على المنصة، وهو غير متاح هنا.")).toBeTruthy();
  });
});

describe("PracticeTableView — a served worksheet is judged by the server, cell by cell", () => {
  const judge = async (_p: string, _a: string, r: StudyResponse) => {
    const choices = r.kind === "practice-table" ? r.choices : {};
    const key: Record<string, string> = { "0:1": "خاص", "1:1": "عام" };
    const cells = Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, key[k] === v]));
    const correct = Object.keys(key).every(k => choices[k] === key[k]);
    return correct ? { ...RIGHT, cells } : { ...WRONG, cells };
  };
  it("each change is asked with the choices on screen; each cell shows the server's verdict; all right shows the outcome", async () => {
    const h = host(judge);
    render(<PracticeTableView block={TABLE} pageId="p1" study={h} />);
    const [a, b] = screen.getAllByRole("combobox");
    fireEvent.change(a, { target: { value: "عام" } });
    expect(h.report).toHaveBeenLastCalledWith("p1", "tbl", { kind: "practice-table", choices: { "0:1": "عام" } });
    await screen.findByText(/✕ غير صحيح/);
    fireEvent.change(a, { target: { value: "خاص" } });
    fireEvent.change(b, { target: { value: "عام" } });
    await waitFor(() => expect(screen.getAllByText(/✓ صحيح/)).toHaveLength(2));
    expect(h.report).toHaveBeenLastCalledWith("p1", "tbl", { kind: "practice-table", choices: { "0:1": "خاص", "1:1": "عام" } });
    await screen.findByText(/\+7 نقطة قوة/);
    fireEvent.change(a, { target: { value: "عام" } });                                // a known wrong choice: shown at once, asked as a new set
    expect(screen.getByText(/✕ غير صحيح/)).toBeTruthy();
    expect(screen.queryByText(/نقطة قوة/)).toBeNull();
  });

  it("a transport failure marks nothing wrong; the retry asks again", async () => {
    let fail = true;
    const h = host(async (...x) => { if (fail) throw new Error("offline"); return judge(...x); });
    render(<PracticeTableView block={TABLE} pageId="p1" study={h} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "خاص" } });
    await screen.findByText("لم يتم التحقق");
    expect(screen.queryByText(/غير صحيح/)).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    await screen.findByText(/✓ صحيح/);
  });

  it("without a host the choices can be made but nothing is marked or sent", () => {
    render(<PracticeTableView block={TABLE} pageId="p1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "خاص" } });
    expect(screen.queryByText(/صحيح/)).toBeNull();
    expect(screen.getByText("التحقق من هذه الإجابات يتم على المنصة، وهو غير متاح هنا.")).toBeTruthy();
  });
});

describe("L.6b end to end — the Reader over the REAL content and study handlers", () => {
  const CHECKS: CheckIndex = JSON.parse(readFileSync(resolve(process.cwd(), "api/src/data/learning-check/791381.json"), "utf8"));
  // a real m01 multiple-choice study block with a wrong message, hints and an explanation
  const target = Object.entries(CHECKS.pages).flatMap(([pageId, p]) => Object.entries(p.activities).map(([id, a]) => ({ pageId, moduleId: p.moduleId, id, ...a })))
    .find(a => a.moduleId === "791381-m01" && a.study && a.key.kind === "multipleChoice" && a.feedback.incorrect && a.feedback.correct && a.feedback.explanation && (a.feedback.hints?.length ?? 0) > 0)!;

  function realServer() {
    const ctx = createMemoryContainer({
      "platform/users/u1.json": { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA" },
      "platform/classes/cA.json": { classId: "cA", status: "active", active: true, learningMaterials: [{ courseId: "791381", visibleModuleIds: ["791381-m01"] }] },
    });
    const deps = (headers: Record<string, string>) => ({
      requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }),
      requireStudentAuth: () => (headers["x-student-token"] === "s" ? { ok: true, user: { sub: "u1", sv: 1, role: "student" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }),
      container: ctx.container, getContainer: () => ctx.container,
    });
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input), req = (init ?? {}) as RequestInit, headers = (req.headers ?? {}) as Record<string, string>;
      const parts = url.split("/").map(decodeURIComponent);
      let r: { status: number; jsonBody: unknown };
      if (url.startsWith("/api/learning-content/")) {
        r = await contentHandler({ method: "GET", headers: { get: (k: string) => headers[k] ?? null }, params: { courseId: parts[3], moduleId: parts[4] } }, deps(headers));
        bodies.push(JSON.stringify(r.jsonBody));
      } else {
        r = await studyHandler({ method: req.method ?? "GET", url, headers: { get: (k: string) => headers[k] ?? null }, params: { courseId: parts[3], action: parts[4] }, json: async () => JSON.parse(String(req.body)) }, deps(headers));
      }
      return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
    });
    return { ctx, bodies };
  }
  const headers = { "x-student-token": "s" };
  const api: ReaderContentApi = { loadManifest: loadCourseManifest, hasModule: hasModuleContent, loadModule: (c, m) => loadModuleBody(c, m, headers) };

  it("the served page holds none of the block's feedback; a wrong answer gets the server's message and hints, a right one its message, explanation and the study point", async () => {
    const { ctx, bodies } = realServer();
    render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="خروج" client={null} actor="student" study={createStudyClient(headers)} initialPageId={target.pageId} />);
    const authored = (await loadBundledModuleContent("791381", "791381-m01")).lessons.flatMap(l => l.pages).flatMap(p => p.blocks).find(b => b.id === target.id)!;
    if (authored.type !== "practice" || authored.question.kind !== "multipleChoice" || target.key.kind !== "multipleChoice") throw new Error("not a multiple-choice block");
    const prompt = await screen.findByText(authored.question.prompt, undefined, { timeout: 10000 });
    const block = prompt.closest(".learning-reader-practice") as HTMLElement;
    for (const secret of [target.feedback.incorrect!, target.feedback.correct!, target.feedback.explanation!, ...target.feedback.hints!]) {
      expect(bodies.join("")).not.toContain(secret);                               // never sent with the body
      expect(document.body.textContent).not.toContain(secret);
    }
    const radios = within(block).getAllByRole("radio");
    const right = target.key.correct[0];
    const wrongIndex = authored.question.options.findIndex(o => o.id !== right), rightIndex = authored.question.options.findIndex(o => o.id === right);
    fireEvent.click(radios[wrongIndex]);
    await within(block).findByText(target.feedback.incorrect!, undefined, { timeout: 5000 });
    expect(within(block).queryByText(target.feedback.explanation!)).toBeNull();
    fireEvent.click(within(block).getByRole("button", { name: "ماذا أفحص؟ (تلميح)" }));
    expect(within(block).getByText(target.feedback.hints![0])).toBeTruthy();
    fireEvent.click(radios[rightIndex]);
    await within(block).findByText(target.feedback.correct!, undefined, { timeout: 5000 });
    expect(within(block).getByText(target.feedback.explanation!)).toBeTruthy();
    expect(within(block).getByText(/نقطة قوة|سُجّل التمرين/)).toBeTruthy();
    const stored = (ctx as { getJson: (name: string) => { pages: Record<string, { completed: Record<string, string> }> } }).getJson("platform/learning-study/u1.json");
    expect(Object.keys(stored.pages[target.pageId].completed)).toEqual([target.id]);
  }, 30000);
});
