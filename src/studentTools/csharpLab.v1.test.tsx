// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { teacherCSharpLab, isDesktopViewport, DESKTOP_QUERY, LAB_PATH, HELLO_TIMEOUT_MS, LAB_TIMEOUT_SECONDS, type FrameFactory } from "./csharpLab";
import { CSharpToolRunError } from "./csharpToolRun";
import CourseToolDock from "./CourseToolDock";
import StudentToolDock from "./StudentToolDock";

// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md) — the page side of the teacher's in-browser C# lab:
//   • the protocol with the hidden frame (tools/csharp-lab/wwwroot/bridge.js): hello → warm → ready; one run → one result; only
//     messages from THAT frame and THIS origin count; a cancelled run tells the frame;
//   • the ONE server read (the book's classes), with the teacher's session, once; a refusal is the server's message and runs nothing;
//   • who gets it: the TEACHER's reader on a DESKTOP only — a phone, or the student's reader, keeps the editor exactly as it was;
//   • the editor says the code runs in this browser, and its time-out message says the lab's limit.
// The real frame, worker and compiler are proven in Chromium by tools/csharp-lab/smoke.mjs (CI: csharp-lab.yml).

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

type Sent = Record<string, unknown>;
function fakeFrame() {
  const sent: Sent[] = [];
  const win = { postMessage: (m: Sent, origin: string) => { sent.push({ ...m, __origin: origin }); } } as unknown as Window;
  const made: string[] = [];
  let removed = 0;
  const factory: FrameFactory = src => { made.push(src); return { window: win, remove: () => { removed++; } }; };
  const say = (data: unknown, opts: { origin?: string; source?: unknown } = {}) =>
    window.dispatchEvent(new MessageEvent("message", { data, origin: opts.origin ?? location.origin, source: (opts.source ?? win) as Window }));
  return { factory, sent, made, say, removed: () => removed, win };
}
const LIB = "public class Stack<T> { }";
function stubLibrary(body: unknown = { ok: true, courseId: "899271d", library: LIB }, status = 200) {
  const calls: [string, RequestInit | undefined][] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push([url, init]); return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }));
  return calls;
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe("Teacher C# lab — the frame protocol", () => {
  it("available(): makes the frame once, warms it on hello, and is up when the runtime says ready", async () => {
    const f = fakeFrame();
    const lab = teacherCSharpLab({ Authorization: "Bearer t" }, "899271d", f.factory);
    expect(f.made).toEqual([]);                                     // nothing is made before the editor asks
    const up = lab.available();
    expect(f.made).toEqual([LAB_PATH]);
    f.say({ type: "csharp-lab:hello", version: 1 });
    expect(f.sent).toEqual([{ type: "csharp-lab:warm", __origin: location.origin }]);
    f.say({ type: "csharp-lab:state", state: "booting" });
    f.say({ type: "csharp-lab:state", state: "ready" });
    await expect(up).resolves.toBe(true);
    await expect(lab.available()).resolves.toBe(true);
    expect(f.made).toHaveLength(1);
    lab.dispose();
    expect(f.removed()).toBe(1);
  });

  it("no hello in time (the lab is not deployed here) → unavailable; asking again makes a fresh frame", async () => {
    vi.useFakeTimers();
    const f = fakeFrame();
    const lab = teacherCSharpLab({}, "899271d", f.factory);
    const up = lab.available();
    vi.advanceTimersByTime(HELLO_TIMEOUT_MS + 1);
    await expect(up).resolves.toBe(false);
    void lab.available();
    expect(f.made).toEqual([LAB_PATH, LAB_PATH]);
    expect(f.removed()).toBe(1);
    lab.dispose();
  });

  it("a runtime that failed to start → unavailable", async () => {
    const f = fakeFrame();
    const lab = teacherCSharpLab({}, "899271d", f.factory);
    const up = lab.available();
    f.say({ type: "csharp-lab:hello", version: 1 });
    f.say({ type: "csharp-lab:state", state: "failed" });
    await expect(up).resolves.toBe(false);
    lab.dispose();
  });

  it("run(): reads the book's classes ONCE with the teacher's session, posts the program, returns the frame's result", async () => {
    const calls = stubLibrary();
    const f = fakeFrame();
    const lab = teacherCSharpLab({ Authorization: "Bearer t" }, "899271d", f.factory);
    const p1 = lab.run("SRC", "IN", undefined);
    await flush(); await flush();
    const run1 = f.sent.find(m => m.type === "csharp-lab:run")!;
    expect(run1).toMatchObject({ source: "SRC", stdin: "IN", library: LIB, __origin: location.origin });
    f.say({ type: "csharp-lab:result", id: run1.id, result: { status: "success", stdout: "hi\n", stderr: "", durationMs: 12 } });
    await expect(p1).resolves.toEqual({ status: "success", stdout: "hi\n", stderr: "", durationMs: 12 });
    const p2 = lab.run("SRC2", "", undefined);
    await flush(); await flush();
    const run2 = f.sent.filter(m => m.type === "csharp-lab:run")[1];
    f.say({ type: "csharp-lab:result", id: run2.id, result: { status: "timeout", stdout: "", stderr: "" } });
    await expect(p2).resolves.toMatchObject({ status: "timeout" });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("/api/teacher-tools/csharp-lab?courseId=899271d");
    expect(calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer t" }, cache: "no-store" });
    lab.dispose();
  });

  it("only THAT frame and THIS origin count: a result from elsewhere, or for another run, is ignored", async () => {
    stubLibrary();
    const f = fakeFrame();
    const lab = teacherCSharpLab({}, "899271d", f.factory);
    let settled: unknown = "pending";
    void lab.run("S", "", undefined).then(r => { settled = r; });
    await flush(); await flush();
    const id = f.sent.find(m => m.type === "csharp-lab:run")!.id;
    const forged = { type: "csharp-lab:result", id, result: { status: "success", stdout: "FORGED", stderr: "" } };
    f.say(forged, { origin: "https://evil.example" });
    f.say(forged, { source: window });
    f.say({ ...forged, id: Number(id) + 100 });
    await flush();
    expect(settled).toBe("pending");
    f.say({ type: "csharp-lab:result", id, result: { status: "success", stdout: "real", stderr: "" } });
    await flush();
    expect(settled).toMatchObject({ stdout: "real" });
    lab.dispose();
  });

  it("the server refuses the book's classes → its message, and nothing is run", async () => {
    stubLibrary({ ok: false, code: "COURSE_NOT_AVAILABLE", error: "هذا المقرر غير متاح لحسابك حاليًا." }, 403);
    const f = fakeFrame();
    const lab = teacherCSharpLab({}, "899271d", f.factory);
    const err = await lab.run("S", "", undefined).catch(e => e);
    expect(err).toBeInstanceOf(CSharpToolRunError);
    expect(err).toMatchObject({ code: "COURSE_NOT_AVAILABLE", message: "هذا المقرر غير متاح لحسابك حاليًا." });
    expect(f.sent.some(m => m.type === "csharp-lab:run")).toBe(false);
    lab.dispose();
  });

  it("a cancelled run tells the frame to stop, and the lab's own failure is «unavailable» (the editor offers to check again)", async () => {
    stubLibrary();
    const f = fakeFrame();
    const lab = teacherCSharpLab({}, "899271d", f.factory);
    const c = new AbortController();
    const p = lab.run("S", "", c.signal);
    await flush(); await flush();
    c.abort();
    await expect(p).rejects.toMatchObject({ code: "ABORTED" });
    expect(f.sent.at(-1)).toMatchObject({ type: "csharp-lab:cancel" });
    const p2 = lab.run("S", "", undefined);
    await flush(); await flush();
    const id = f.sent.filter(m => m.type === "csharp-lab:run").at(-1)!.id;
    f.say({ type: "csharp-lab:result", id, result: { status: "internal-error", stdout: "", stderr: "runtime did not start" } });
    await expect(p2).rejects.toMatchObject({ code: "LAB_UNAVAILABLE" });
    lab.dispose();
  });

  it("the lab's time limit is the bridge's (one number, two places)", () => {
    const bridge = readFileSync("tools/csharp-lab/wwwroot/bridge.js", "utf8");
    expect(bridge).toContain("export const RUN_TIMEOUT_MS = " + LAB_TIMEOUT_SECONDS * 1000 + ";");
    expect(teacherCSharpLab({}, "x").timeoutSeconds).toBe(LAB_TIMEOUT_SECONDS);
    expect(teacherCSharpLab({}, "x").mode).toBe("lab");
  });
});

const desktop = (matches: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY ? matches : false, media: q, addEventListener() {}, removeEventListener() {} })));

describe("Teacher C# lab — who gets it (presentation; the server guards the book's classes)", () => {
  it("desktop = a wide screen with a precise pointer; no matchMedia → not a desktop", () => {
    desktop(true);
    expect(isDesktopViewport()).toBe(true);
    desktop(false);
    expect(isDesktopViewport()).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", undefined);
    expect(isDesktopViewport()).toBe(false);
  });

  async function openBookEditor(props: { labHeaders?: Record<string, string>; runHeaders?: Record<string, string> }) {
    render(<CourseToolDock courseId="899271d" {...props} />);
    fireEvent.click(await screen.findByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    const panel = screen.getByRole("dialog", { name: "محرر C#" });
    await within(panel).findByTestId("csharp-editor-tool");
    return panel;
  }

  it("the TEACHER's reader on a DESKTOP: the editor runs in this browser (the frame is made, the note says so)", async () => {
    desktop(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, available: true }))));
    const panel = await openBookEditor({ labHeaders: { Authorization: "Bearer t" }, runHeaders: { Authorization: "Bearer t" } });
    expect(within(panel).getByTestId("csharp-lab-note").textContent).toContain("يعمل الكود في متصفحك");
    await waitFor(() => expect(document.querySelector("iframe[data-testid='csharp-lab-frame']")?.getAttribute("src")).toBe(LAB_PATH));
    expect(panel.textContent).toContain("جارٍ تحميل مختبر \u2066C#\u2069 في متصفحك");
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/student-tools/csharp-run"), expect.anything());
    cleanup();
    expect(document.querySelector("iframe[data-testid='csharp-lab-frame']")).toBeNull();   // removed with the dock
  });

  it("the teacher on a PHONE, or the STUDENT's reader: no lab, no frame — the editor uses the Runner as before", async () => {
    for (const [isDesktop, props] of [[false, { labHeaders: { a: "1" }, runHeaders: { a: "1" } }], [true, { runHeaders: { a: "1" } }]] as const) {
      desktop(isDesktop);
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, available: true })));
      vi.stubGlobal("fetch", fetchMock);
      const panel = await openBookEditor(props);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/student-tools/csharp-run", expect.objectContaining({ method: "GET" })));
      expect(within(panel).queryByTestId("csharp-lab-note")).toBeNull();
      expect(document.querySelector("iframe[data-testid='csharp-lab-frame']")).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("the editor's time-out message says the runner's own limit: 10 s in the lab, 2 s on the Runner", async () => {
    for (const [timeoutSeconds, text] of [[LAB_TIMEOUT_SECONDS, "(10 ثوانٍ)"], [undefined, "(ثانيتان)"]] as const) {
      const runner = { mode: timeoutSeconds ? "lab" as const : undefined, timeoutSeconds, available: async () => true, run: async () => ({ status: "timeout" as const, stdout: "", stderr: "" }) };
      render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "csharpEditor", allowRun: true }] }} csharpRunner={runner} />);
      fireEvent.click(screen.getByTestId("student-tools-button"));
      fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
      const panel = screen.getByRole("dialog", { name: "محرر C#" });
      const run = await within(panel).findByRole("button", { name: "تشغيل" });
      await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(run);
      await waitFor(() => expect(panel.textContent).toContain("تجاوز الوقت المسموح " + text));
      cleanup();
    }
  });
});
