// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { teacherLabRunner, resetTeacherLabForTests, LAB_URL } from "./teacherCSharpLab";
import CourseToolDock from "./CourseToolDock";

// Teacher C# lab — the app side (AGENTS.md §1 «Teacher C# lab»; docs/enterprise-teacher-csharp-lab-spike.md): nothing is created until
// the first run; the lab is a SANDBOXED iframe (allow-scripts only → opaque origin); only messages from that iframe AND from the opaque
// origin are accepted; results are normalised; a lab that never loads is a clear refusal; only the teacher's reader uses it.

afterEach(() => { cleanup(); resetTeacherLabForTests(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const labFrame = () => document.querySelector<HTMLIFrameElement>('iframe[data-testid="teacher-csharp-lab"]');
// Iframe page loading is off (no network in unit tests): each lab iframe gets a stand-in window, so the source check stays exact.
const labWindow = () => {
  const f = labFrame()!;
  if (!(f as unknown as { __win?: unknown }).__win) {
    const win = { postMessage: vi.fn() };
    Object.defineProperty(f, "contentWindow", { value: win, configurable: true });
    (f as unknown as { __win?: unknown }).__win = win;
  }
  return f.contentWindow as unknown as { postMessage: ReturnType<typeof vi.fn> };
};
const fromLab = (data: unknown, over: { origin?: string; source?: unknown } = {}) =>
  window.dispatchEvent(new MessageEvent("message", { data, origin: over.origin ?? "null", source: (over.source ?? labWindow()) as unknown as MessageEventSource }));

const TEACHER = { Authorization: "Bearer T" };
/** The API's answer to GET ?library=<courseId> (teacher session). */
function stubLibrary(answer: () => Response = () => new Response(JSON.stringify({ ok: true, library: "public class Stack<T> { }" }), { status: 200 })) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Teacher C# lab — the runner", () => {
  it("creates nothing until the first run; then the book's classes from the API (teacher session) and ONE sandboxed iframe", async () => {
    const fetchMock = stubLibrary();
    const r = teacherLabRunner("899271d", TEACHER);
    expect(r.where).toBe("device");
    expect(await r.available()).toBe(true);
    expect(labFrame()).toBeNull();                                         // opening the editor downloads nothing
    expect(fetchMock).not.toHaveBeenCalled();
    const pending = r.run("class P { static void Main() {} }", "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/student-tools/csharp-run?library=899271d");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer T");
    const f = labFrame()!;
    expect(f.getAttribute("src")).toBe(LAB_URL);
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");               // no allow-same-origin: an opaque origin
    expect(f.hidden).toBe(true);
    const post = labWindow().postMessage;
    fromLab({ type: "lab-ready" });
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [msg] = post.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(Object.keys(msg).sort()).toEqual(["id", "library", "source", "stdin", "type"]);   // no session, no course id, no token
    expect(msg).toMatchObject({ type: "run", source: "class P { static void Main() {} }", stdin: "", library: "public class Stack<T> { }" });
    fromLab({ type: "result", id: msg.id, result: { status: "success", stdout: "ok\n", stderr: "", runner: "smuggled" } });
    expect(await pending).toEqual({ status: "success", stdout: "ok\n", stderr: "" });   // normalised: unknown fields dropped
  });
  it("one lab per page; the library is read once per runner", async () => {
    const fetchMock = stubLibrary();
    const r = teacherLabRunner("899271d", TEACHER);
    r.run("a", "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    fromLab({ type: "lab-ready" });
    r.run("b", "");
    teacherLabRunner("899271d", TEACHER).run("c", "");
    await waitFor(() => expect(labWindow().postMessage).toHaveBeenCalledTimes(3));
    expect(document.querySelectorAll('iframe[data-testid="teacher-csharp-lab"]')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);                            // two runners → two reads; the same runner reads once
  });
  it("ignores messages from any other window or from a real origin (a same-origin or foreign sender is not the lab)", async () => {
    stubLibrary();
    const r = teacherLabRunner("899271d", TEACHER);
    let settled = false;
    const pending = r.run("x", "").then(v => { settled = true; return v; });
    await waitFor(() => expect(labFrame()).toBeTruthy());
    const post = labWindow().postMessage;
    fromLab({ type: "lab-ready" }, { origin: window.location.origin });  // not opaque → ignored
    fromLab({ type: "lab-ready" }, { source: window });                   // not the lab's window → ignored
    await new Promise(res => setTimeout(res, 20));
    expect(post).not.toHaveBeenCalled();
    fromLab({ type: "lab-ready" });
    await waitFor(() => expect(post).toHaveBeenCalled());
    const id = (post.mock.calls[0][0] as { id: string }).id;
    fromLab({ type: "result", id, result: { status: "success", stdout: "forged", stderr: "" } }, { origin: "https://evil.example" });
    await new Promise(res => setTimeout(res, 20));
    expect(settled).toBe(false);
    fromLab({ type: "result", id, result: { status: "timeout", stdout: "", stderr: "" } });
    expect((await pending).status).toBe("timeout");
  });
  it("a refused library read is a clear refusal and builds no lab; a book without classes (404) runs with none", async () => {
    stubLibrary(() => new Response(JSON.stringify({ ok: false }), { status: 403 }));
    expect(await teacherLabRunner("899271d", TEACHER).run("x", "").catch(e => e)).toMatchObject({ code: "LIBRARY_UNAVAILABLE" });
    expect(labFrame()).toBeNull();
    stubLibrary(() => new Response(JSON.stringify({ ok: false }), { status: 404 }));
    teacherLabRunner("791381", TEACHER).run("x", "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    fromLab({ type: "lab-ready" });
    await waitFor(() => expect(labWindow().postMessage).toHaveBeenCalled());
    expect((labWindow().postMessage.mock.calls[0][0] as { library: string }).library).toBe("");
  });
  it("a lab page that never answers is a clear refusal, and the next run tries again", async () => {
    stubLibrary();
    vi.useFakeTimers();
    const r = teacherLabRunner("899271d", TEACHER);
    const p = r.run("x", "").catch(e => e);
    await vi.advanceTimersByTimeAsync(30001);
    expect(await p).toMatchObject({ code: "LAB_UNAVAILABLE" });
    expect(labFrame()).toBeNull();                                         // removed: the next run builds a fresh one
    r.run("x", "").catch(() => {});
    await vi.advanceTimersByTimeAsync(1);
    expect(labFrame()).toBeTruthy();
  });
});

describe("Teacher C# lab — only the teacher's reader", () => {
  const openEditor = async () => {
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    return within(screen.getByRole("dialog", { name: "محرر C#" })).findByTestId("csharp-editor-tool");
  };
  it("teacherLab: the editor says it runs on this computer and «تشغيل» starts the lab — not the server", async () => {
    const fetchMock = stubLibrary();
    render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer T" }} teacherLab />);
    const tool = await openEditor();
    expect(within(tool).getByTestId("csharp-on-device").textContent).toContain("يعمل على جهازك");
    fireEvent.click(await within(tool).findByRole("button", { name: "تشغيل" }));
    await waitFor(() => expect(labFrame()).toBeTruthy());
    // no availability check and no run request to the API: only the book's classes are read, with the teacher's session
    expect(fetchMock.mock.calls.map(c => String(c[0]))).toEqual(["/api/student-tools/csharp-run?library=899271d"]);
  });
  it("without teacherLab (a student's reader): no lab, no on-device note — the Runner path as before", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, available: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer S" }} />);
    const tool = await openEditor();
    expect(within(tool).queryByTestId("csharp-on-device")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(labFrame()).toBeNull();
  });
  it("guard: only LearningReaderWithTraining sets teacherLab, and only for actor \"teacher\"; no student or exam page imports the lab", () => {
    expect(readFileSync("src/learning/training/LearningReaderWithTraining.tsx", "utf8")).toMatch(/teacherLab=\{actor === "teacher"\}/);
    for (const f of ["src/student/StudentReader.tsx", "src/StudentExamPage.tsx", "src/ExamPreview.tsx", "src/learning/reader/LearningReader.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect({ f, importsLab: /teacherCSharpLab/.test(src) }).toEqual({ f, importsLab: false });
      if (f !== "src/learning/reader/LearningReader.tsx") expect({ f, setsTeacherLab: /teacherLab/.test(src) }).toEqual({ f, setsTeacherLab: false });
    }
  });
});
