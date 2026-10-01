// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, screen, act } from "@testing-library/react";
import SimulationSandboxHost from "./SimulationSandboxHost";
import { SMARTSIM_PROTOCOL_VERSION, SMARTSIM_RESIZE_MIN_PX, SMARTSIM_RESIZE_MAX_PX, parseSimulatorMessage, SIM_TO_HOST_TYPES, HOST_TO_SIM_TYPES } from "./smartsimBridge";
import { normalizeSimulationState, SIMULATION_STATE_MAX_BYTES } from "../smartsimState";
import { runtimeAssetUrl } from "./runtimeUrl";
import type { SimulationQuestionConfig } from "../smartsimManifest";

// Phase 16B-A — the sandbox host + SmartSimBridgeV1 contract tested against a REAL iframe element in happy-dom: the host
// accepts only messages whose `source` is its own iframe contentWindow, whose instanceId matches, whose protocolVersion is 1
// and whose type is allowed with a valid payload; every other message is ignored (never thrown, never applied). State
// changes are bounded JSON; resize is clamped; the preview host IS the student host. Fail-first on 6bb3b97 (module absent).
// happy-dom does NOT execute scripts inside iframe documents, so simulator messages are dispatched as MessageEvents whose
// `source` is the real iframe.contentWindow (or a foreign window for the negative cases). Browser-level sandbox / CSP
// properties are NOT claimed here — they are pinned as contract + architecture guards (api/tests/smartsim-guards-16b-a.test.js).

const REF: SimulationQuestionConfig = { packageId: "counter-sim", packageVersion: 1, packageHash: "sha256:" + "ab".repeat(32), runtimeVersion: 1, entry: "index.html" };
function Harness({ initial, disabled, mode }: { initial?: unknown; disabled?: boolean; mode?: "student" | "preview" }) {
  const [state, setState] = useState<unknown>(initial);
  const [count, setCount] = useState(0);
  return <>
    <SimulationSandboxHost reference={REF} savedState={state} disabled={disabled} mode={mode ?? "student"} onStateChange={s => { setState(s); setCount(c => c + 1); }} readyTimeoutMs={200} debounceMs={0} />
    <output data-testid="state">{JSON.stringify(state ?? null)}</output>
    <output data-testid="changes">{count}</output>
  </>;
}
const frame = () => screen.getByTestId("smartsim-frame") as HTMLIFrameElement;
const readState = () => JSON.parse(screen.getByTestId("state").textContent || "null");
const changes = () => Number(screen.getByTestId("changes").textContent);
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
/** Dispatch a message TO the host as if the simulator posted it (source = the real iframe window unless overridden). */
async function fromSim(data: unknown, source?: Window | null) {
  const src = source === undefined ? frame().contentWindow : source;
  await act(async () => { window.dispatchEvent(new MessageEvent("message", { data, source: src as Window, origin: "null" })); });
  await tick();
}
/** Capture what the host posts INTO the iframe. */
function captureHostMessages(): unknown[] {
  const out: unknown[] = [];
  const win = frame().contentWindow!;
  vi.spyOn(win, "postMessage").mockImplementation((msg: unknown) => { out.push(msg); });
  return out;
}
const instanceIdOf = (sent: unknown[]) => (sent.find(m => (m as { type: string }).type === "SMARTSIM_INIT") as { instanceId: string }).instanceId;
const msg = (type: string, payload: unknown, instanceId: string, protocolVersion: unknown = SMARTSIM_PROTOCOL_VERSION) => ({ protocolVersion, instanceId, type, payload });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("S24 — sandboxed iframe host", () => {
  it("renders exactly one iframe with sandbox='allow-scripts' only, no allow-same-origin / popups / top-navigation / forms / modals / downloads; src is the content-addressed runtime URL; title is Arabic; referrerpolicy no-referrer", async () => {
    render(<Harness />);
    const f = frame();
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");
    for (const bad of ["allow-same-origin", "allow-popups", "allow-top-navigation", "allow-forms", "allow-modals", "allow-downloads", "allow-pointer-lock", "allow-presentation", "allow-storage-access-by-user-activation", "allow-scripts-to-close"]) expect(f.getAttribute("sandbox")).not.toContain(bad);
    expect(f.getAttribute("src")).toBe(runtimeAssetUrl(REF, "index.html"));
    expect(f.getAttribute("src")).toBe("/api/simulators/runtime/counter-sim/1/" + "ab".repeat(32) + "/index.html");
    expect(f.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(f.getAttribute("title") || "").toMatch(/محاكاة/);
    expect(f.hasAttribute("srcdoc")).toBe(false);
    expect(document.querySelectorAll("iframe").length).toBe(1);
  });
  it("the runtime URL never comes from exam JSON: an `entry` / packageId containing a scheme, `..` or a slash is refused (throws), and the URL is always built from the validated identity", () => {
    expect(() => runtimeAssetUrl({ ...REF, entry: "../metadata.json" }, "../metadata.json")).toThrow();
    expect(() => runtimeAssetUrl({ ...REF, packageId: "https://evil.example" }, "index.html")).toThrow();
    expect(() => runtimeAssetUrl({ ...REF, packageId: "a/b" }, "index.html")).toThrow();
    expect(() => runtimeAssetUrl({ ...REF, packageHash: "latest" }, "index.html")).toThrow();
    expect(() => runtimeAssetUrl({ ...REF, packageVersion: 0 }, "index.html")).toThrow();
    expect(runtimeAssetUrl(REF, "assets/app.js")).toBe("/api/simulators/runtime/counter-sim/1/" + "ab".repeat(32) + "/assets/app.js");
  });
});

describe("S25/S26 — READY handshake and INIT payload", () => {
  it("after SMARTSIM_READY the host posts SMARTSIM_INIT with ONLY protocol/instance/scenario/publicConfig/savedState/disabled — never student identity, exam data, answers of other questions or a token", async () => {
    render(<Harness initial={{ count: 2 }} />);
    const sent = captureHostMessages();
    await fromSim({ protocolVersion: 1, instanceId: null, type: "SMARTSIM_READY", payload: {} });
    const init = sent.find(m => (m as { type: string }).type === "SMARTSIM_INIT") as Record<string, unknown>;
    expect(init).toBeTruthy();
    expect(Object.keys(init).sort()).toEqual(["instanceId", "payload", "protocolVersion", "type"]);
    expect(init.protocolVersion).toBe(1);
    const payload = init.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["disabled", "instanceId", "protocolVersion", "publicConfig", "savedState", "scenario"]);
    expect(payload.savedState).toEqual({ count: 2 });
    expect(payload.disabled).toBe(false);
    expect(JSON.stringify(init)).not.toMatch(/student|token|Authorization|examId|answers|sub\b/i);
  });
  it("READY is accepted only once per instance; before READY the host shows a loading status; a READY timeout renders the Arabic error panel with a retry control and no crash", async () => {
    render(<Harness />);
    expect(screen.getByText(/جارٍ تحميل المحاكاة/).getAttribute("role")).toBe("status");
    await tick(260);
    const panel = screen.getByTestId("smartsim-error");
    expect(panel.textContent).toMatch(/تعذّر تحميل المحاكاة/);
    expect(panel.getAttribute("data-error-code")).toBe("READY_TIMEOUT");
    expect(screen.getByRole("button", { name: /إعادة المحاولة/ })).toBeTruthy();
    expect(panel.textContent).not.toMatch(/sha256|stack|at /);
  });
});

describe("S27–S31 — message acceptance policy", () => {
  async function ready() {
    render(<Harness />);
    const sent = captureHostMessages();
    await fromSim({ protocolVersion: 1, instanceId: null, type: "SMARTSIM_READY", payload: {} });
    return { sent, id: instanceIdOf(sent) };
  }
  it("S27 — a valid STATE_CHANGED from the iframe window with the right instanceId is applied", async () => {
    const { id } = await ready();
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 3 } }, id));
    expect(readState()).toEqual({ count: 3 }); expect(changes()).toBe(1);
  });
  it("S28 — a message from a DIFFERENT window (not the iframe) is ignored even with the right instanceId", async () => {
    const { id } = await ready();
    const other = document.createElement("iframe"); document.body.appendChild(other);
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 99 } }, id), other.contentWindow);
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 98 } }, id), window);
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 97 } }, id), null);
    expect(readState()).toBeNull(); expect(changes()).toBe(0);
  });
  it("S29 — wrong instanceId, wrong / missing protocolVersion, unknown type, host→sim types echoed back, non-object data: all ignored", async () => {
    const { id } = await ready();
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 1 } }, "someone-else"));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 1 } }, id, 2));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 1 } }, id, "1"));
    await fromSim({ instanceId: id, type: "SMARTSIM_STATE_CHANGED", payload: { state: { count: 1 } } });
    await fromSim(msg("SMARTSIM_SCORE", { score: 10 }, id));
    await fromSim(msg("SMARTSIM_INIT", { savedState: { count: 5 } }, id));
    await fromSim(msg("SMARTSIM_RESTORE_STATE", { state: { count: 5 } }, id));
    await fromSim("SMARTSIM_STATE_CHANGED"); await fromSim(null); await fromSim(42); await fromSim([]);
    expect(readState()).toBeNull(); expect(changes()).toBe(0);
  });
  it("S30 — malformed payloads are ignored: missing state, functions, non-finite numbers, prototype-pollution keys, excessive depth", async () => {
    const { id } = await ready();
    await fromSim(msg("SMARTSIM_STATE_CHANGED", {}, id));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { n: NaN } }, id));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { n: Infinity } }, id));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: JSON.parse('{"__proto__":{"polluted":true}}') }, id));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { constructor: { prototype: {} } } }, id));
    let deep: unknown = 1; for (let i = 0; i < 40; i++) deep = [deep];
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: deep }, id));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { f: () => 1 } }, id));
    expect(readState()).toBeNull(); expect(changes()).toBe(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("S31 — an oversized state (> SIMULATION_STATE_MAX_BYTES) is rejected with the STATE_TOO_LARGE error panel and the previous state is kept", async () => {
    const { id } = await ready();
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 1 } }, id));
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { blob: "x".repeat(SIMULATION_STATE_MAX_BYTES + 10) } }, id));
    expect(readState()).toEqual({ count: 1 }); expect(changes()).toBe(1);
    expect(screen.getByTestId("smartsim-error").getAttribute("data-error-code")).toBe("STATE_TOO_LARGE");
  });
  it("SMARTSIM_ERROR from the simulator renders the safe Arabic panel with a code, never the raw message as HTML", async () => {
    const { id } = await ready();
    await fromSim(msg("SMARTSIM_ERROR", { code: "BOOM", message: "<img src=x onerror=alert(1)>" }, id));
    const panel = screen.getByTestId("smartsim-error");
    expect(panel.getAttribute("data-error-code")).toBe("SIMULATOR_ERROR");
    expect(panel.querySelector("img")).toBeNull();
  });
  it("SMARTSIM_RESIZE is clamped to [min, max] px and ignored when non-finite", async () => {
    const { id } = await ready();
    await fromSim(msg("SMARTSIM_RESIZE", { height: 99999 }, id));
    expect(frame().style.height).toBe(SMARTSIM_RESIZE_MAX_PX + "px");
    await fromSim(msg("SMARTSIM_RESIZE", { height: 10 }, id));
    expect(frame().style.height).toBe(SMARTSIM_RESIZE_MIN_PX + "px");
    await fromSim(msg("SMARTSIM_RESIZE", { height: 600 }, id));
    expect(frame().style.height).toBe("600px");
    await fromSim(msg("SMARTSIM_RESIZE", { height: NaN }, id));
    expect(frame().style.height).toBe("600px");
  });
  it("SMARTSIM_REQUEST_RESET is honoured by the host: it posts SMARTSIM_RESET and clears the saved state through onStateChange(null)", async () => {
    const { sent, id } = await ready();
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 4 } }, id));
    await fromSim(msg("SMARTSIM_REQUEST_RESET", {}, id));
    expect(sent.some(m => (m as { type: string }).type === "SMARTSIM_RESET")).toBe(true);
    expect(readState()).toBeNull();
  });
  it("disabled → the host posts SMARTSIM_SET_DISABLED {disabled:true} and ignores further STATE_CHANGED (submitted / ended / review)", async () => {
    const { rerender } = render(<Harness />);
    const sent = captureHostMessages();
    await fromSim({ protocolVersion: 1, instanceId: null, type: "SMARTSIM_READY", payload: {} });
    const id = instanceIdOf(sent);
    rerender(<Harness disabled />);
    await tick();
    expect(sent.some(m => (m as { type: string }).type === "SMARTSIM_SET_DISABLED" && (m as { payload: { disabled: boolean } }).payload.disabled === true)).toBe(true);
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 7 } }, id));
    expect(readState()).toBeNull();
  });
});

describe("S32 — preview host ≡ student host", () => {
  it("mode='preview' renders the SAME iframe contract (sandbox, src, referrerpolicy) plus a debug state inspector OUTSIDE the iframe", async () => {
    render(<Harness mode="preview" initial={{ count: 1 }} />);
    const f = frame();
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");
    expect(f.getAttribute("src")).toBe("/api/simulators/runtime/counter-sim/1/" + "ab".repeat(32) + "/index.html");
    const inspector = screen.getByTestId("smartsim-debug-state");
    expect(inspector.closest("iframe")).toBeNull();
    expect(inspector.textContent).toContain('"count": 1');
    const sent = captureHostMessages();
    await fromSim({ protocolVersion: 1, instanceId: null, type: "SMARTSIM_READY", payload: {} });
    await fromSim(msg("SMARTSIM_STATE_CHANGED", { state: { count: 9 } }, instanceIdOf(sent)));
    expect(screen.getByTestId("smartsim-debug-state").textContent).toContain('"count": 9');
  });
  it("mode='student' never renders the debug inspector", () => {
    render(<Harness initial={{ count: 1 }} />);
    expect(screen.queryByTestId("smartsim-debug-state")).toBeNull();
  });
});

describe("bridge parser + state normalizer (pure)", () => {
  it("parseSimulatorMessage accepts only sim→host types with a matching instanceId and protocolVersion 1", () => {
    expect(SIM_TO_HOST_TYPES).toEqual(expect.arrayContaining(["SMARTSIM_READY", "SMARTSIM_STATE_CHANGED", "SMARTSIM_REQUEST_RESET", "SMARTSIM_ERROR", "SMARTSIM_RESIZE"]));
    expect(HOST_TO_SIM_TYPES).toEqual(expect.arrayContaining(["SMARTSIM_INIT", "SMARTSIM_RESTORE_STATE", "SMARTSIM_SET_DISABLED", "SMARTSIM_RESET"]));
    expect(parseSimulatorMessage({ protocolVersion: 1, instanceId: "i", type: "SMARTSIM_STATE_CHANGED", payload: { state: 1 } }, "i")).toEqual({ type: "SMARTSIM_STATE_CHANGED", payload: { state: 1 } });
    expect(parseSimulatorMessage({ protocolVersion: 1, instanceId: "j", type: "SMARTSIM_STATE_CHANGED", payload: { state: 1 } }, "i")).toBeNull();
    expect(parseSimulatorMessage({ protocolVersion: 1, instanceId: "i", type: "SMARTSIM_INIT", payload: {} }, "i")).toBeNull();
    expect(parseSimulatorMessage({ protocolVersion: 1, instanceId: null, type: "SMARTSIM_READY", payload: {} }, "i")).toEqual({ type: "SMARTSIM_READY", payload: {} });
    expect(parseSimulatorMessage(null, "i")).toBeNull();
  });
  it("normalizeSimulationState: bounded JSON-safe values only", () => {
    expect(normalizeSimulationState({ a: 1, b: [true, null, "x"] })).toMatchObject({ ok: true, state: { a: 1, b: [true, null, "x"] } });
    expect(normalizeSimulationState({ n: NaN })).toMatchObject({ ok: false, code: "STATE_NON_FINITE" });
    expect(normalizeSimulationState(() => 1)).toMatchObject({ ok: false, code: "STATE_NOT_JSON" });
    expect(normalizeSimulationState(JSON.parse('{"__proto__":{"x":1}}'))).toMatchObject({ ok: false, code: "STATE_FORBIDDEN_KEY" });
    expect(normalizeSimulationState({ constructor: 1 })).toMatchObject({ ok: false, code: "STATE_FORBIDDEN_KEY" });
    expect(normalizeSimulationState({ s: "x".repeat(SIMULATION_STATE_MAX_BYTES) })).toMatchObject({ ok: false, code: "STATE_TOO_LARGE" });
    const cyc: Record<string, unknown> = {}; cyc.self = cyc;
    expect(normalizeSimulationState(cyc)).toMatchObject({ ok: false, code: "STATE_CYCLE" });
    let deep: unknown = 1; for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(normalizeSimulationState(deep)).toMatchObject({ ok: false, code: "STATE_TOO_DEEP" });
    expect(normalizeSimulationState(undefined)).toMatchObject({ ok: false, code: "STATE_NOT_JSON" });
  });
});
