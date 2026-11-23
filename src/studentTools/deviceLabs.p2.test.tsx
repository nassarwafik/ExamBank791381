// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { withDeviceLabs, DEVICE_LANGUAGES } from "./deviceLabs";
import { devicePythonRun, resetDevicePythonLabForTests, PYTHON_LAB_URL, PYTHON_LAB_FILES } from "./devicePythonLab";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";
import type { CodingExecutionService } from "../coding/codingExecution";
import { runErrorMessage } from "../coding/codingExecution";
import { labRunFor } from "../coding/deviceGrading";

// Python phase 2 — the exam question's practice service on this device (C# and Python, desktop only) and the on-device Python lab's
// page side: nothing is created until the first run; a SANDBOXED iframe (allow-scripts only → opaque origin); messages only from that
// iframe AND the opaque origin; the interpreter's files from THIS page under /python-lab/pyodide/ only; results normalised.
afterEach(() => { resetDevicePythonLabForTests(); resetDeviceLabForTests(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const desktop = (matches: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY ? matches : false, media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(() => desktop(true));

const frameOf = (testid: string) => document.querySelector<HTMLIFrameElement>('iframe[data-testid="' + testid + '"]');
const windowOf = (testid: string) => {
  const f = frameOf(testid)!;
  if (!(f as unknown as { __win?: unknown }).__win) {
    const win = { postMessage: vi.fn() };
    Object.defineProperty(f, "contentWindow", { value: win, configurable: true });
    (f as unknown as { __win?: unknown }).__win = win;
  }
  return f.contentWindow as unknown as { postMessage: ReturnType<typeof vi.fn> };
};
const fromLab = (testid: string, data: unknown, over: { origin?: string; source?: unknown } = {}) =>
  window.dispatchEvent(new MessageEvent("message", { data, origin: over.origin ?? "null", source: (over.source ?? windowOf(testid)) as unknown as MessageEventSource }));
const PY = "python-lab", CS = "teacher-csharp-lab";

describe("withDeviceLabs — the exam question's practice (desktop)", () => {
  it("C# and Python run on THIS device (no course library); Java goes to the server; capabilities list all three", async () => {
    const remoteRun = vi.fn(async () => ({ status: "success" as const, stdout: "java", stderr: "" }));
    const remote: CodingExecutionService = { capabilities: { available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }] }, run: remoteRun };
    const svc = withDeviceLabs(remote);
    expect(svc.capabilities).toEqual({ available: true, languages: [{ key: "csharp", languageVersion: 1 }, { key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }] });
    expect(await svc.run({ language: "java", languageVersion: 1, source: "x", stdin: "" })).toMatchObject({ stdout: "java" });
    const py = svc.run({ language: "python", languageVersion: 1, source: "print(input())", stdin: "IN" });
    await waitFor(() => expect(frameOf(PY)).toBeTruthy());
    fromLab(PY, { type: "lab-ready" });
    await waitFor(() => expect(windowOf(PY).postMessage).toHaveBeenCalled());
    const [pm] = windowOf(PY).postMessage.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(Object.keys(pm).sort()).toEqual(["id", "source", "stdin", "type"]);                  // no session, no library, no token
    expect(pm).toMatchObject({ type: "run", source: "print(input())", stdin: "IN" });
    fromLab(PY, { type: "result", id: pm.id, result: { status: "success", stdout: "IN\n", stderr: "", runMs: 3, smuggled: 1 } });
    expect(await py).toEqual({ status: "success", stdout: "IN\n", stderr: "", durationMs: 3 });
    const cs = svc.run({ language: "csharp", languageVersion: 1, source: "class P {}", stdin: "" });
    await waitFor(() => expect(frameOf(CS)).toBeTruthy());
    fromLab(CS, { type: "lab-ready" });
    await waitFor(() => expect(windowOf(CS).postMessage).toHaveBeenCalled());
    const [cm] = windowOf(CS).postMessage.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(cm).toMatchObject({ type: "run", source: "class P {}", library: "" });
    fromLab(CS, { type: "result", id: cm.id, result: { status: "success", stdout: "", stderr: "" } });
    await cs;
    expect(remoteRun).toHaveBeenCalledTimes(1);                                                 // only Java reached the server
    expect(DEVICE_LANGUAGES).toEqual([{ key: "csharp", languageVersion: 1 }, { key: "python", languageVersion: 1 }]);
  });
  it("without the server's runner: C# and Python still run on the device; Java is unavailable (never a fake result)", async () => {
    const svc = withDeviceLabs(undefined);
    expect(svc.capabilities).toEqual({ available: true, languages: [{ key: "csharp", languageVersion: 1 }, { key: "python", languageVersion: 1 }] });
    await expect(svc.run({ language: "java", languageVersion: 1, source: "x", stdin: "" })).rejects.toMatchObject({ code: "EXECUTION_UNAVAILABLE" });
    await expect(svc.run({ language: "python", languageVersion: 2, source: "x", stdin: "" })).rejects.toMatchObject({ code: "EXECUTION_UNAVAILABLE" });
  });
  it("a PHONE or tablet: no lab at all — the server's service unchanged, or unavailable without it", () => {
    desktop(false);
    const remote: CodingExecutionService = { capabilities: { available: true, languages: [{ key: "python", languageVersion: 1 }] }, run: vi.fn() };
    expect(withDeviceLabs(remote)).toBe(remote);
    expect(withDeviceLabs(undefined).capabilities).toEqual({ available: false, languages: [] });
    expect(frameOf(PY)).toBeNull();
  });
});

describe("devicePythonRun — the on-device Python lab (page side)", () => {
  it("one sandboxed iframe at /python-lab/index.html, created on the first run; `fresh` only when asked", async () => {
    expect(frameOf(PY)).toBeNull();
    const a = devicePythonRun("print(1)", "", undefined, { fresh: true });
    await waitFor(() => expect(frameOf(PY)).toBeTruthy());
    const f = frameOf(PY)!;
    expect(f.getAttribute("src")).toBe(PYTHON_LAB_URL);
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");                                    // no allow-same-origin: an opaque origin
    expect(f.hidden).toBe(true);
    fromLab(PY, { type: "lab-ready" });
    await waitFor(() => expect(windowOf(PY).postMessage).toHaveBeenCalledTimes(1));
    const [m1] = windowOf(PY).postMessage.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(m1.fresh).toBe(true);
    fromLab(PY, { type: "result", id: m1.id, result: { status: "success", stdout: "1\n", stderr: "", runMs: 2 } });
    await a;
    const b = devicePythonRun("print(2)", "");
    await waitFor(() => expect(windowOf(PY).postMessage).toHaveBeenCalledTimes(2));
    const [m2] = windowOf(PY).postMessage.mock.calls[1] as unknown as [Record<string, unknown>];
    expect("fresh" in m2).toBe(false);
    expect(document.querySelectorAll('iframe[data-testid="python-lab"]')).toHaveLength(1);
    fromLab(PY, { type: "result", id: m2.id, result: { status: "weird", stdout: "", stderr: "" } });
    expect((await b).status).toBe("internal-error");                                            // normalised
  });
  it("ignores messages from another window or a real origin", async () => {
    const run = devicePythonRun("x", "");
    await waitFor(() => expect(frameOf(PY)).toBeTruthy());
    fromLab(PY, { type: "lab-ready" });
    await waitFor(() => expect(windowOf(PY).postMessage).toHaveBeenCalled());
    const [m] = windowOf(PY).postMessage.mock.calls[0] as unknown as [Record<string, unknown>];
    let settled = false;
    run.then(() => { settled = true; });
    fromLab(PY, { type: "result", id: m.id, result: { status: "success", stdout: "forged", stderr: "" } }, { origin: window.location.origin });
    fromLab(PY, { type: "result", id: m.id, result: { status: "success", stdout: "forged", stderr: "" } }, { source: window });
    await new Promise(r => setTimeout(r, 20));
    expect(settled).toBe(false);
    fromLab(PY, { type: "result", id: m.id, result: { status: "success", stdout: "real", stderr: "" } });
    expect((await run).stdout).toBe("real");
  });
  it("the interpreter's files come from THIS page: a plain name under /python-lab/pyodide/ only, bytes transferred", async () => {
    const fetchMock = vi.fn(async (_u: string) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    void devicePythonRun("x", "");
    await waitFor(() => expect(frameOf(PY)).toBeTruthy());
    const post = windowOf(PY).postMessage;
    fromLab(PY, { type: "fetch", id: "f1", name: "pyodide.asm.wasm" });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "fetched", id: "f1", buffer: expect.any(ArrayBuffer) }), "*", expect.any(Array)));
    expect(fetchMock).toHaveBeenCalledWith(PYTHON_LAB_FILES + "pyodide.asm.wasm");
    for (const [id, name] of [["f2", "../api/x"], ["f3", ".hidden"], ["f4", "a/b"], ["f5", 7]] as const) {
      fromLab(PY, { type: "fetch", id, name });
      await waitFor(() => expect(post).toHaveBeenCalledWith({ type: "fetched", id, error: true }, "*", undefined));
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("a lab page that never answers is a clear refusal (Arabic, Python), and the next run tries again", async () => {
    vi.useFakeTimers();
    const p = devicePythonRun("x", "");
    const caught = p.catch(e => e);
    await vi.advanceTimersByTimeAsync(30001);
    const e = await caught;
    expect(e).toMatchObject({ code: "PYTHON_LAB_UNAVAILABLE" });
    expect(runErrorMessage("PYTHON_LAB_UNAVAILABLE")).toContain("Python");
    expect(frameOf(PY)).toBeNull();
    void devicePythonRun("x", "").catch(() => {});
    expect(frameOf(PY)).toBeTruthy();
  });
});

describe("teacher-device grading picks the lab of the answer's language", () => {
  it("a Python job runs in the Python lab, fresh; a C# job in the C# lab", async () => {
    void labRunFor("python", 1)!("print(1)", "1\n", undefined, { fresh: true });
    await waitFor(() => expect(frameOf(PY)).toBeTruthy());
    expect(frameOf(CS)).toBeNull();
    fromLab(PY, { type: "lab-ready" });
    await waitFor(() => expect(windowOf(PY).postMessage).toHaveBeenCalled());
    expect(windowOf(PY).postMessage.mock.calls[0][0]).toMatchObject({ type: "run", source: "print(1)", stdin: "1\n", fresh: true });
    void labRunFor("csharp", 1)!("class P {}", "", undefined, {});
    await waitFor(() => expect(frameOf(CS)).toBeTruthy());
  });
});
