// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { bookDeviceRunner, resetDeviceLabForTests, deviceCSharpRun, LAB_URL, DESKTOP_QUERY, isDesktopViewport } from "./deviceCSharpLab";
import CourseToolDock from "./CourseToolDock";

// Teacher C# lab — the app side (AGENTS.md §1 «Teacher C# lab»; docs/enterprise-teacher-csharp-lab-spike.md): nothing is created until
// the first run; the lab is a SANDBOXED iframe (allow-scripts only → opaque origin); only messages from that iframe AND from the opaque
// origin are accepted; results are normalised; a lab that never loads is a clear refusal; only the teacher's reader uses it.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
// Desktop only (owner decision 2026-11-23, docs/enterprise-csharp-visual-lab-plan.md): the dock and the exam practice read the viewport.
const desktop = (matches: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY ? matches : false, media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(() => desktop(true));

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
    const r = bookDeviceRunner("899271d", TEACHER);
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
    const r = bookDeviceRunner("899271d", TEACHER);
    r.run("a", "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    fromLab({ type: "lab-ready" });
    r.run("b", "");
    bookDeviceRunner("899271d", TEACHER).run("c", "");
    await waitFor(() => expect(labWindow().postMessage).toHaveBeenCalledTimes(3));
    expect(document.querySelectorAll('iframe[data-testid="teacher-csharp-lab"]')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);                            // two runners → two reads; the same runner reads once
  });
  it("ignores messages from any other window or from a real origin (a same-origin or foreign sender is not the lab)", async () => {
    stubLibrary();
    const r = bookDeviceRunner("899271d", TEACHER);
    let settled = false;
    const pending = r.run("x", "").then((v: unknown) => { settled = true; return v; });
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
    expect(((await pending) as { status: string }).status).toBe("timeout");
  });
  it("a refused library read is a clear refusal and builds no lab; a book without classes (404) runs with none", async () => {
    stubLibrary(() => new Response(JSON.stringify({ ok: false }), { status: 403 }));
    expect(await bookDeviceRunner("899271d", TEACHER).run("x", "").catch((e: unknown) => e)).toMatchObject({ code: "LIBRARY_UNAVAILABLE" });
    expect(labFrame()).toBeNull();
    stubLibrary(() => new Response(JSON.stringify({ ok: false }), { status: 404 }));
    bookDeviceRunner("791381", TEACHER).run("x", "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    fromLab({ type: "lab-ready" });
    await waitFor(() => expect(labWindow().postMessage).toHaveBeenCalled());
    expect((labWindow().postMessage.mock.calls[0][0] as { library: string }).library).toBe("");
  });
  it("the lab's runtime files come from THIS page (its HTTP cache): a plain name under /csharp-lab/_framework/ only, bytes transferred", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith("/api/")) return new Response(JSON.stringify({ ok: true, library: "" }), { status: 200 });
      if (url.endsWith("missing.wasm")) return new Response("", { status: 404 });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));
    bookDeviceRunner("899271d", TEACHER).run("x", "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    const post = labWindow().postMessage;
    fromLab({ type: "fetch", id: "f1", name: "dotnet.native.wasm" });
    await waitFor(() => expect(post.mock.calls.some(c => (c[0] as { id?: string }).id === "f1")).toBe(true));
    const [msg, target, transfer] = post.mock.calls.find(c => (c[0] as { id?: string }).id === "f1")! as unknown as [{ type: string; buffer: ArrayBuffer }, string, ArrayBuffer[]];
    expect(msg.type).toBe("fetched");
    expect([...new Uint8Array(msg.buffer)]).toEqual([1, 2, 3]);
    expect(target).toBe("*");
    expect(transfer).toEqual([msg.buffer]);
    expect(calls).toContain("/csharp-lab/_framework/dotnet.native.wasm");
    // anything but a plain file name is refused without a request; a missing file is a refusal the lab falls back from
    for (const [id, name] of [["b1", "../api/student-tools/csharp-run"], ["b2", "a/b.wasm"], ["b3", ".env"], ["b4", ""], ["b5", 7], ["b6", "x".repeat(129)], ["b7", "missing.wasm"]] as const) fromLab({ type: "fetch", id, name });
    await waitFor(() => expect(post.mock.calls.filter(c => /^b\d$/.test(String((c[0] as { id?: string }).id))).length).toBe(7));
    for (const c of post.mock.calls.filter(c => /^b\d$/.test(String((c[0] as { id?: string }).id)))) expect(c[0]).toMatchObject({ type: "fetched", error: true });
    expect(calls.filter(u => u.startsWith("/csharp-lab/"))).toEqual(["/csharp-lab/_framework/dotnet.native.wasm", "/csharp-lab/_framework/missing.wasm"]);
    // a fetch request that is not from the lab's window / opaque origin is ignored
    fromLab({ type: "fetch", id: "evil", name: "dotnet.native.wasm" }, { origin: window.location.origin });
    await new Promise(res => setTimeout(res, 20));
    expect(post.mock.calls.some(c => (c[0] as { id?: string }).id === "evil")).toBe(false);
  });
  it("a lab page that never answers is a clear refusal, and the next run tries again", async () => {
    stubLibrary();
    vi.useFakeTimers();
    const r = bookDeviceRunner("899271d", TEACHER);
    const p = r.run("x", "").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30001);
    expect(await p).toMatchObject({ code: "LAB_UNAVAILABLE" });
    expect(labFrame()).toBeNull();                                         // removed: the next run builds a fresh one
    r.run("x", "").catch(() => {});
    await vi.advanceTimersByTimeAsync(1);
    expect(labFrame()).toBeTruthy();
  });
});

describe("On-device lab — books (every reader) and exam C# practice", () => {
  const openEditor = async () => {
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    return within(screen.getByRole("dialog", { name: "محرر C#" })).findByTestId("csharp-editor-tool");
  };
  it("a book reader (teacher or student — the same dock): the editor runs on this device; only the book's classes are read from the API", async () => {
    const fetchMock = stubLibrary();
    render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer S" }} />);
    const tool = await openEditor();
    expect(within(tool).getByTestId("csharp-on-device").textContent).toContain("يعمل على جهازك");
    fireEvent.click(await within(tool).findByRole("button", { name: "تشغيل" }));
    await waitFor(() => expect(labFrame()).toBeTruthy());
    expect(fetchMock.mock.calls.map(c => String(c[0]))).toEqual(["/api/student-tools/csharp-run?library=899271d"]);   // no Runner request
  });
  it("a PHONE or tablet (teacher or student): no lab, no on-device note — the book editor keeps the Runner path, exactly as before", async () => {
    desktop(false);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, available: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer T" }} />);
    const tool = await openEditor();
    expect(within(tool).queryByTestId("csharp-on-device")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/student-tools/csharp-run", expect.objectContaining({ method: "GET" })));
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes("library="))).toBe(false);
    expect(labFrame()).toBeNull();
  });
  it("desktop = a wide screen with a precise pointer; no matchMedia (or a failing one) → not a desktop", () => {
    desktop(true);
    expect(isDesktopViewport()).toBe(true);
    desktop(false);
    expect(isDesktopViewport()).toBe(false);
    vi.stubGlobal("matchMedia", undefined);
    expect(isDesktopViewport()).toBe(false);
    vi.stubGlobal("matchMedia", () => { throw new Error("no"); });
    expect(isDesktopViewport()).toBe(false);
    expect(DESKTOP_QUERY).toBe("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  });
  it("guard: the exam page and the exam preview never hand the TOOL BAR a run transport (its editor stays write-only in exams)", () => {
    for (const f of ["src/StudentExamPage.tsx", "src/ExamPreview.tsx"]) {
      expect({ f, wiresToolRunner: /csharpRunner|bookDeviceRunner/.test(readFileSync(f, "utf8")) }).toEqual({ f, wiresToolRunner: false });
    }
    // the exam coding renderers use the device ONLY through withDeviceLabs (practice on the question's examples; deviceLabs.p2.test.tsx)
    for (const f of ["src/questionTypes/student/CodingResponse.tsx", "src/questionTypes/student/CodingTemplateResponse.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect({ f, usesPracticeSeam: /withDeviceLabs\(/.test(src), usesBookRunner: /bookDeviceRunner/.test(src) }).toEqual({ f, usesPracticeSeam: true, usesBookRunner: false });
    }
  });
});

describe("On-device lab — teacher-device grading needs", () => {
  it("`fresh` asks the lab for a new runtime (only when set), and the program's run time (runMs) becomes the case duration", async () => {
    const first = deviceCSharpRun("class P {}", "1 2\n", "", undefined, { fresh: true });
    await waitFor(() => expect(labFrame()).toBeTruthy());
    const post = labWindow().postMessage;
    fromLab({ type: "lab-ready" });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [m1] = post.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(m1).toMatchObject({ type: "run", source: "class P {}", stdin: "1 2\n", library: "", fresh: true });
    fromLab({ type: "result", id: m1.id, result: { status: "success", stdout: "3\n", stderr: "", compileMs: 250, runMs: 7 } });
    expect(await first).toEqual({ status: "success", stdout: "3\n", stderr: "", durationMs: 7 });
    const second = deviceCSharpRun("class P {}", "", "");
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const [m2] = post.mock.calls[1] as unknown as [Record<string, unknown>];
    expect("fresh" in m2).toBe(false);
    fromLab({ type: "result", id: m2.id, result: { status: "success", stdout: "", stderr: "", runMs: "x", durationMs: 9 } });
    expect((await second).durationMs).toBe(9);
  });
});
