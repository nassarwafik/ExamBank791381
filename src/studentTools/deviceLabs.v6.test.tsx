// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { withDeviceLabs } from "./deviceLabs";
import { bookDeviceRunner, leftOutOfLab, resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";
import { labRunFor } from "../coding/deviceGrading";
import type { CodingExecutionService } from "../coding/codingExecution";

// Visual lab V6 (docs/enterprise-csharp-visual-lab-plan.md §14) — the lab's download is trimmed; a program that needs a library it leaves
// out is refused BEFORE it runs (LAB0001, tools/csharp-lab/Lab.cs). Practice runs then go to the Runner, which has every library:
//   • the exam question (withDeviceLabs), when the server runs C#; the book editor (bookDeviceRunner), through the book's server route;
//   • if the Runner cannot answer, the lab's own answer stands (it names the type) — never an error that turns the editor off;
//   • teacher-device grading NEVER falls back (labRunFor): the compile error goes to the API, which refuses it (teacher review).
afterEach(() => { resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const LEFT_OUT = { status: "compile-error", stdout: "", stderr: "Program.cs: error LAB0001: 'System.Xml.XmlDocument' is not part of the C# lab on this device", runMs: 0 };
const frame = () => document.querySelector<HTMLIFrameElement>('iframe[data-testid="teacher-csharp-lab"]');
const win = () => {
  const f = frame()!;
  if (!(f as unknown as { __w?: unknown }).__w) {
    const w = { postMessage: vi.fn() };
    Object.defineProperty(f, "contentWindow", { value: w, configurable: true });
    (f as unknown as { __w?: unknown }).__w = w;
  }
  return f.contentWindow as unknown as { postMessage: ReturnType<typeof vi.fn> };
};
const fromLab = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, origin: "null", source: win() as unknown as MessageEventSource }));
/** Starts the lab, answers the n-th message with `result`. */
async function labAnswers(result: unknown, n = 0) {
  await waitFor(() => expect(frame()).toBeTruthy());
  if (n === 0) fromLab({ type: "lab-ready" });
  await waitFor(() => expect(win().postMessage.mock.calls.length).toBeGreaterThan(n));
  const [m] = win().postMessage.mock.calls[n] as unknown as [Record<string, unknown>];
  fromLab({ type: "result", id: m.id, result });
}
const remoteOf = (languages: { key: string; languageVersion: number }[], run = vi.fn(async () => ({ status: "success" as const, stdout: "<a/>\n", stderr: "" }))) =>
  ({ svc: { capabilities: { available: true, languages }, run } as CodingExecutionService, run });

describe("V6 — a program the trimmed lab leaves out goes to the Runner (practice only)", () => {
  it("leftOutOfLab: only a compile error naming LAB0001", () => {
    expect(leftOutOfLab({ status: "compile-error", stdout: "", stderr: LEFT_OUT.stderr })).toBe(true);
    expect(leftOutOfLab({ status: "compile-error", stdout: "", stderr: "Program.cs(3,1): error CS1002: ; expected" })).toBe(false);
    expect(leftOutOfLab({ status: "runtime-error", stdout: "", stderr: "LAB0001" })).toBe(false);
  });

  it("the exam question: LAB0001 → the server's C# runner answers; an ordinary compile error stays on the device", async () => {
    const { svc, run } = remoteOf([{ key: "csharp", languageVersion: 1 }]);
    const s = withDeviceLabs(svc);
    const req = { language: "csharp", languageVersion: 1, source: "using System.Xml; class P {}", stdin: "" };
    const p = s.run(req);
    await labAnswers(LEFT_OUT);
    expect(await p).toMatchObject({ status: "success", stdout: "<a/>\n" });
    expect(run).toHaveBeenCalledWith(req, {});
    const q = s.run({ ...req, source: "class P { int x = 1 }" });
    await labAnswers({ status: "compile-error", stdout: "", stderr: "Program.cs(1,22): error CS1002: ; expected" }, 1);
    expect(await q).toMatchObject({ status: "compile-error" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("the exam question: no server C# (or the server fails) → the lab's own LAB0001 answer stands", async () => {
    const none = remoteOf([{ key: "java", languageVersion: 1 }]);
    const p = withDeviceLabs(none.svc).run({ language: "csharp", languageVersion: 1, source: "x", stdin: "" });
    await labAnswers(LEFT_OUT);
    expect(await p).toMatchObject({ status: "compile-error", stderr: expect.stringContaining("LAB0001") });
    expect(none.run).not.toHaveBeenCalled();
    resetDeviceLabForTests();
    const failing = remoteOf([{ key: "csharp", languageVersion: 1 }], vi.fn(async () => { throw new Error("down"); }));
    const q = withDeviceLabs(failing.svc).run({ language: "csharp", languageVersion: 1, source: "x", stdin: "" });
    await labAnswers(LEFT_OUT);
    expect(await q).toMatchObject({ status: "compile-error", stderr: expect.stringContaining("LAB0001") });
  });

  it("the book editor: LAB0001 → the book's server route (with the reader's headers and the course); its failure → the lab's answer", async () => {
    const calls: { url: string; body: unknown; headers: unknown }[] = [];
    let serverUp = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
        if (!serverUp) return new Response(JSON.stringify({ ok: false, code: "EXECUTION_UNAVAILABLE" }), { status: 503 });
        return new Response(JSON.stringify({ ok: true, result: { status: "success", stdout: "server\n", stderr: "" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, library: "", available: true }), { status: 200 });
    }));
    const r = bookDeviceRunner("899271d", { Authorization: "Bearer T" });
    const p = r.run("using System.Xml;", "", undefined);
    await labAnswers(LEFT_OUT);
    expect(await p).toMatchObject({ status: "success", stdout: "server\n" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/student-tools/csharp-run", body: { courseId: "899271d", source: "using System.Xml;" }, headers: { Authorization: "Bearer T" } });
    serverUp = false;
    const q = r.run("using System.Xml;", "", undefined);
    await labAnswers(LEFT_OUT, 1);
    expect(await q).toMatchObject({ status: "compile-error", stderr: expect.stringContaining("LAB0001") });
  });

  it("pin: teacher-device grading never falls back — the lab's LAB0001 compile error is what the API receives", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const p = labRunFor("csharp", 1)!("using System.Xml;", "", undefined, { fresh: true });
    await labAnswers(LEFT_OUT);
    expect(await p).toMatchObject({ status: "compile-error", stderr: expect.stringContaining("LAB0001") });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
