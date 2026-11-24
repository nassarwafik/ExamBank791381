// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import OfflineLabPage from "./OfflineLabPage";
import CSharpEditorTool from "../studentTools/CSharpEditorTool";
import { packChannel, readPackInfo, readReply } from "./offlinePack";
import { DESKTOP_QUERY, inlineLabFrame, plainDeviceRunner, resetDeviceLabForTests } from "../studentTools/deviceCSharpLab";
// @ts-expect-error — a plain ES module script of the build (no types)
import { labClosure, buildPack } from "../../scripts/build-offline-lab-pack.mjs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24; owner decision 2026-11-24) — the offline C# lab page:
//   • the pack (offlinePack.ts): the deployed pack read when online; the service worker's replies read strictly;
//   • the page: the lab on a desktop only; «تنزيل للعمل بلا إنترنت (نحو N ميغابايت)» → progress → «جاهز بلا إنترنت»; a newer deployed pack
//     → «تحديث»; «حذف من الجهاز»; offline, it says so; no service worker → it says the lab works while connected;
//   • the lab frame written from text (srcdoc, an opaque-origin sandbox), never a script that would close its tag; the page's runner
//     runs the learner's program with no book classes, and records it (the visual run);
//   • the build's pack list (scripts/build-offline-lab-pack.mjs): the lab page's whole import closure; no pack without a lab.
// The real thing, offline in Chromium with the real service worker: scripts/check-offline-lab-browser.mjs.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const desktop = (on: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: on && q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} })));
const PACK = { available: true, version: "aaaaaaaaaaaaaaaa", bytes: 31 * 1048576, files: ["/lab.html", "/x"] };

/** A fake service worker container: records what the page sends; `reply` sends a message as the worker would. */
function fakeWorker() {
  const sent: unknown[] = [];
  const listeners = new Set<(e: MessageEvent) => void>();
  const container = {
    controller: { postMessage: (m: unknown) => sent.push(m) },
    ready: Promise.resolve({ active: null }),
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.delete(fn),
  };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: container });
  const reply = (data: Record<string, unknown>) => act(() => { for (const fn of listeners) fn({ data: { type: "lab-pack", ...data } } as MessageEvent); });
  return { sent, reply };
}
const deployed = (pack: unknown) => vi.stubGlobal("fetch", vi.fn(async (u: string) => (u === "/offline-lab.json" ? new Response(JSON.stringify(pack)) : new Response("", { status: 404 }))));

describe("V14 — the pack, read strictly", () => {
  it("a worker reply: only lab-pack messages of a known state; the deployed pack: its version, size and count", async () => {
    expect(readReply({ type: "lab-pack", state: "installing", done: 3, total: 9 })).toEqual({ state: "installing", done: 3, total: 9 });
    expect(readReply({ type: "lab-pack", state: "installed", version: "v", files: 2 })).toEqual({ state: "installed", version: "v", files: 2 });
    expect(readReply({ type: "lab-pack", state: "whatever" })).toBeNull();
    expect(readReply({ type: "other", state: "none" })).toBeNull();
    deployed(PACK);
    expect(await readPackInfo()).toEqual({ available: true, version: "aaaaaaaaaaaaaaaa", bytes: 31 * 1048576, files: 2 });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await readPackInfo()).toBeNull();
  });
  it("no service worker in this browser → no channel", () => {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    expect(packChannel()).toBeNull();
  });
});

describe("V14 — the page", () => {
  it("download → progress → ready; a newer deployed pack offers «تحديث»; «حذف من الجهاز»", async () => {
    desktop(true); deployed(PACK);
    const w = fakeWorker();
    render(<OfflineLabPage />);
    await waitFor(() => expect(w.sent).toEqual([{ type: "lab-pack", action: "status" }]));
    await w.reply({ state: "none" });
    fireEvent.click(await screen.findByRole("button", { name: "تنزيل للعمل بلا إنترنت (نحو 31 ميغابايت)" }));
    expect(w.sent.at(-1)).toEqual({ type: "lab-pack", action: "install" });
    await w.reply({ state: "installing", done: 40, total: 107 });
    expect(screen.getByText("جارٍ التنزيل… 40 / 107")).toBeTruthy();
    expect((screen.getByRole("progressbar", { name: "تنزيل المختبر" }) as HTMLProgressElement).value).toBe(40);
    await w.reply({ state: "installed", version: "aaaaaaaaaaaaaaaa", files: 107 });
    expect(screen.getByText("جاهز بلا إنترنت على هذا الجهاز.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تحديث" })).toBeNull();
    await w.reply({ state: "installed", version: "bbbbbbbbbbbbbbbb", files: 107 });
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));
    expect(w.sent.at(-1)).toEqual({ type: "lab-pack", action: "install" });
    fireEvent.click(screen.getByRole("button", { name: "حذف من الجهاز" }));
    expect(w.sent.at(-1)).toEqual({ type: "lab-pack", action: "remove" });
  });
  it("offline it says so (and offers no download); a failed download says so and offers it again", async () => {
    desktop(true); deployed(PACK);
    const w = fakeWorker();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineLabPage />);
    expect(screen.getByText(/^أنت الآن بلا اتصال/)).toBeTruthy();
    await w.reply({ state: "none" });
    expect(screen.queryByRole("button", { name: /تنزيل/ })).toBeNull();
    cleanup();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineLabPage />);
    await w.reply({ state: "error", message: "x" });
    expect((await screen.findByRole("alert")).textContent).toBe("تعذّر التنزيل. تحقّق من الاتصال وحاول مرة أخرى.");
    expect(screen.getByRole("button", { name: /^تنزيل للعمل بلا إنترنت/ })).toBeTruthy();
  });
  it("on a phone or tablet: no lab (desktop only, as every use of the lab); a build without a lab offers no download", async () => {
    desktop(false); deployed({ available: false, version: "", bytes: 0, files: [] });
    const w = fakeWorker();
    render(<OfflineLabPage />);
    expect(screen.getByText("المختبر يعمل على الحاسوب فقط (شاشة عريضة وفأرة).")).toBeTruthy();
    expect(screen.queryByLabelText("كود C#")).toBeNull();
    await w.reply({ state: "none" });
    expect(screen.queryByRole("button", { name: /تنزيل/ })).toBeNull();
  });
  it("no service worker: it says the lab works while connected", () => {
    desktop(true); deployed(PACK);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    render(<OfflineLabPage />);
    expect(screen.getByRole("note").textContent).toMatch(/^هذا المتصفح لا يحفظ الصفحات للعمل بلا إنترنت/);
  });
});

describe("V14 — the lab frame and the runner", () => {
  it("written from text: a sandbox with allow-scripts only (an opaque origin), the script inline; a script closing its tag is refused", async () => {
    inlineLabFrame("window.parent.postMessage({ type: 'x' }, '*');");
    void plainDeviceRunner().run("class P {}", "", undefined).catch(() => {});
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    expect([frame.getAttribute("sandbox"), frame.hasAttribute("src"), frame.getAttribute("srcdoc")]).toEqual(
      ["allow-scripts", false, '<!doctype html><meta charset="utf-8"><title>C# lab</title><script type="module">window.parent.postMessage({ type: \'x\' }, \'*\');</script>']);
    expect(() => inlineLabFrame("a</script><script>b")).toThrow();
  });
  it("the page's runner: on this device, the visual run offered, no book classes asked (no request)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = plainDeviceRunner();
    expect([r.where, typeof r.trace]).toEqual(["device", "function"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("V14 — the way there", () => {
  it("the book's C# editor on this device links to the lab page (a new tab); the lab page itself does not link to itself", async () => {
    const runner = { where: "device" as const, available: async () => true, run: vi.fn() };
    render(<CSharpEditorTool runner={runner} />);
    const link = await screen.findByTestId("csharp-offline-lab");
    expect([link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")]).toEqual(["/lab.html", "_blank", "noopener"]);
    cleanup();
    window.history.pushState({}, "", "/lab.html");
    render(<CSharpEditorTool runner={runner} />);
    await screen.findByTestId("csharp-on-device");
    expect(screen.queryByTestId("csharp-offline-lab")).toBeNull();
    window.history.pushState({}, "", "/");
    cleanup();
    render(<CSharpEditorTool />);   // write only (an exam): no link
    expect(screen.queryByTestId("csharp-offline-lab")).toBeNull();
  });
});

describe("V14 — the build's pack list", () => {
  it("the lab page's whole closure: its file, css, assets, static and lazy imports (once each, cycles included)", () => {
    const manifest = {
      "lab.html": { file: "assets/lab-1.js", css: ["assets/lab-1.css"], imports: ["_shared-2.js"], dynamicImports: ["src/Editor.tsx"] },
      "_shared-2.js": { file: "assets/shared-2.js", imports: ["lab.html"] },
      "src/Editor.tsx": { file: "assets/Editor-3.js", assets: ["assets/font-4.woff2"], dynamicImports: ["src/Trace.tsx"] },
      "src/Trace.tsx": { file: "assets/Trace-5.js" },
      "index.html": { file: "assets/index-9.js" },
    };
    expect(labClosure(manifest)).toEqual(["/assets/Editor-3.js", "/assets/Trace-5.js", "/assets/font-4.woff2", "/assets/lab-1.css", "/assets/lab-1.js", "/assets/shared-2.js"]);
  });
  it("a build without the lab: no pack (the page offers no download)", () => {
    const dist = mkdtempSync(join(tmpdir(), "olab-"));
    mkdirSync(join(dist, ".vite"));
    writeFileSync(join(dist, ".vite", "manifest.json"), JSON.stringify({ "lab.html": { file: "assets/lab.js" } }));
    expect(buildPack(dist)).toEqual({ available: false, version: "", bytes: 0, files: [] });
  });
});
