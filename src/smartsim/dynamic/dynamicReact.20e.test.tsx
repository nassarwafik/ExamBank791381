// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect } from "react";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { useSimulationClock } from "./useSimulationClock";
import DynamicPlot2D from "./DynamicPlot2D";
import DynamicErrorBoundary from "./DynamicErrorBoundary";
import { DYNAMIC_LIMITS } from "./simulationClock";

// Phase 20E — the React side of the dynamic runtime: ONE requestAnimationFrame loop per running clock, cancelled on pause / unmount,
// hidden-tab auto-pause without catch-up, reduced motion never autoplays; the trusted SVG plot; the local error boundary.
// Fail-first on 78445fd (modules absent). A fake RAF drives frames deterministically (no real sleeping).

type Frame = { id: number; cb: FrameRequestCallback };
let frames: Frame[] = [], nextId = 1, cancelled: number[] = [];
const runFrame = (ts: number) => { const due = frames; frames = []; for (const f of due) f.cb(ts); };
beforeEach(() => {
  frames = []; nextId = 1; cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = nextId++; frames.push({ id, cb }); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { cancelled.push(id); frames = frames.filter(f => f.id !== id); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

let api: ReturnType<typeof useSimulationClock> | null = null;
function Probe({ duration, autoPlay, reducedMotion }: { duration: number; autoPlay?: boolean; reducedMotion?: boolean }) {
  const clock = useSimulationClock(duration, { autoPlay, reducedMotion });
  useEffect(() => { api = clock; });
  return <output data-testid="t">{clock.state.time.toFixed(3)}|{clock.state.playing ? "p" : "s"}|{clock.state.rate}</output>;
}
const out = (c: HTMLElement) => c.querySelector("[data-testid=t]")!.textContent!;

describe("20E-H1 useSimulationClock: one frame loop, deterministic advancement", () => {
  it("play starts exactly ONE loop; frames advance by elapsed time; pause cancels; re-renders never add loops", () => {
    const r = render(<Probe duration={5} />);
    expect(frames.length).toBe(0);
    act(() => api!.play());
    expect(frames.length).toBe(1);
    act(() => runFrame(1000));                       // first frame: elapsed 0
    act(() => runFrame(1100));
    expect(out(r.container)).toBe("0.100|p|1");
    r.rerender(<Probe duration={5} />); r.rerender(<Probe duration={5} />);
    expect(frames.length).toBe(1);
    act(() => runFrame(1200));
    expect(out(r.container)).toBe("0.200|p|1");
    act(() => api!.pause());
    expect(frames.length).toBe(0);
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    act(() => runFrame(5000));
    expect(out(r.container)).toBe("0.200|s|1");
  });
  it("rate scales simulated time; seek / step / restart are synchronous; reaching the end stops the loop", () => {
    const r = render(<Probe duration={1} />);
    act(() => { api!.setRate(0.5); api!.play(); });
    act(() => runFrame(0)); act(() => runFrame(100));
    expect(out(r.container)).toBe("0.050|p|0.5");
    act(() => api!.seek(0.6));
    expect(out(r.container)).toBe("0.600|p|0.5");
    act(() => api!.step(0.1));
    expect(out(r.container)).toBe("0.700|s|0.5");
    act(() => { api!.setRate(2); api!.play(); });
    for (let i = 0; i < 30; i++) act(() => runFrame(1000 + i * 100));
    expect(out(r.container)).toBe("1.000|s|2");
    expect(frames.length).toBe(0);
    act(() => api!.restart());
    expect(out(r.container)).toBe("0.000|s|2");
  });
  it("a huge frame gap advances at most the clamp; unmount during a running loop cancels it", () => {
    const r = render(<Probe duration={600} />);
    act(() => api!.play());
    act(() => runFrame(0)); act(() => runFrame(8000));
    expect(Number(out(r.container).split("|")[0])).toBeCloseTo(DYNAMIC_LIMITS.maxFrameDeltaSeconds, 6);
    const before = cancelled.length;
    r.unmount();
    expect(cancelled.length).toBe(before + 1);
    expect(frames.length).toBe(0);
  });
  it("hidden document pauses the presentation; returning does NOT catch up hidden wall time", () => {
    const r = render(<Probe duration={10} />);
    act(() => api!.play());
    act(() => runFrame(0)); act(() => runFrame(100));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(out(r.container)).toBe("0.100|s|1");
    expect(frames.length).toBe(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(out(r.container)).toBe("0.100|s|1");                       // by default nothing resumes on its own (the student presses play)
    expect(frames.length).toBe(0);
    act(() => api!.play());
    act(() => runFrame(60000)); act(() => runFrame(60050));
    expect(out(r.container)).toBe("0.150|p|1");
  });
  it("autoPlay starts playback, but never under reduced motion", () => {
    const a = render(<Probe duration={3} autoPlay />);
    expect(out(a.container)).toMatch(/\|p\|/);
    cleanup();
    const b = render(<Probe duration={3} autoPlay reducedMotion />);
    expect(out(b.container)).toMatch(/\|s\|/);
    expect(frames.length).toBe(0);
  });
});

describe("20E-P1 DynamicPlot2D: trusted SVG, progressive series, synchronized marker", () => {
  const full = Array.from({ length: 21 }, (_, i) => ({ x: i / 10, y: 20 - 4.9 * (i / 10) ** 2 }));
  const plot = (n: number, extra: Record<string, unknown> = {}) => (
    <DynamicPlot2D width={320} height={200} xDomain={[0, 2]} yDomain={[0, 20]} xLabel="t (s)" yLabel="y (m)" title="الارتفاع مع الزمن" testId="plot"
      progress={[{ id: "y", points: full.slice(0, n) }]} marker={full[n - 1]} nowX={full[n - 1].x} events={[{ x: 2, y: 0.4, label: "الارتطام", kind: "impact" }]} {...extra} />
  );
  it("renders an accessible role=img svg with axes, ticks, labels, the progressive path, the marker and the now line", () => {
    const r = render(plot(5));
    const svg = r.container.querySelector("svg.xp-dyn-plot")!;
    expect(svg.getAttribute("role")).toBe("img"); expect(svg.getAttribute("aria-label")).toBe("الارتفاع مع الزمن");
    expect(svg.textContent).toContain("t (s)"); expect(svg.textContent).toContain("y (m)");
    const path = svg.querySelector("path[data-series=y]")!;
    expect((path.getAttribute("d")!.match(/[ML]/g) || []).length).toBe(5);
    const marker = svg.querySelector("[data-testid=dyn-marker]")!;
    expect(Number(marker.getAttribute("cx"))).toBeGreaterThan(0);
    expect(svg.querySelector("line.xp-dyn-now")).toBeTruthy();
    expect(svg.querySelector("g.xp-dyn-event[data-kind=impact] title")!.textContent).toBe("الارتطام");
  });
  it("the path grows with the visible prefix and the marker moves with it", () => {
    const a = render(plot(3)); const da = a.container.querySelector("path[data-series=y]")!.getAttribute("d")!; const ma = a.container.querySelector("[data-testid=dyn-marker]")!.getAttribute("cx");
    cleanup();
    const b = render(plot(12)); const db = b.container.querySelector("path[data-series=y]")!.getAttribute("d")!; const mb = b.container.querySelector("[data-testid=dyn-marker]")!.getAttribute("cx");
    expect(db.length).toBeGreaterThan(da.length); expect(db.startsWith(da.split(" L").slice(0, 2).join(" L"))).toBe(true);
    expect(Number(mb)).toBeGreaterThan(Number(ma));
  });
  it("bounds: points beyond plotPointsMax and events beyond eventMarkersMax are ignored; no foreign markup", () => {
    const many = Array.from({ length: DYNAMIC_LIMITS.plotPointsMax + 500 }, (_, i) => ({ x: i / 1000, y: 1 }));
    const events = Array.from({ length: 50 }, (_, i) => ({ x: i / 25, y: 1, label: "<script>x</script>", kind: "impact" }));
    const r = render(<DynamicPlot2D width={300} height={150} xDomain={[0, 3]} yDomain={[0, 2]} xLabel="x" yLabel="y" title="t" progress={[{ id: "s", points: many }]} events={events} />);
    const d = r.container.querySelector("path[data-series=s]")!.getAttribute("d")!;
    expect((d.match(/[ML]/g) || []).length).toBeLessThanOrEqual(DYNAMIC_LIMITS.plotPointsMax);
    expect(r.container.querySelectorAll("g.xp-dyn-event").length).toBe(DYNAMIC_LIMITS.eventMarkersMax);
    expect(r.container.querySelector("script, foreignObject")).toBeNull();
    expect(r.container.innerHTML).not.toContain("<script>");
  });
  it("series beyond seriesMax are ignored; an event kind that is not a safe class token is replaced by \"event\"", () => {
    const series = Array.from({ length: DYNAMIC_LIMITS.seriesMax + 3 }, (_, i) => ({ id: "s" + i, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
    const r = render(<DynamicPlot2D width={300} height={150} xDomain={[0, 1]} yDomain={[0, 1]} xLabel="x" yLabel="y" title="t" progress={series} reference={series}
      events={[{ x: 0.5, y: 0.5, label: "e", kind: "impact\" onload=\"x" }, { x: 0.2, y: 0.2, label: "f", kind: "Apex Point" }]} />);
    expect(r.container.querySelectorAll("path[data-series]").length).toBe(DYNAMIC_LIMITS.seriesMax);
    expect(r.container.querySelectorAll("path[data-reference]").length).toBe(DYNAMIC_LIMITS.seriesMax);
    expect([...r.container.querySelectorAll("g.xp-dyn-event")].map(g => g.getAttribute("data-kind"))).toEqual(["event", "event"]);
  });
  it("RF1-F2: a finite but numerically extreme domain (5e-324) never produces NaN attributes", () => {
    const r = render(<DynamicPlot2D width={300} height={150} xDomain={[0, 1]} yDomain={[0, 5e-324 * 1.05]} xLabel="x" yLabel="y" title="t" zeroLine
      progress={[{ id: "s", points: [{ x: 0, y: 5e-324 }, { x: 1, y: 0 }] }]} marker={{ x: 0.5, y: 0 }} nowX={0.5} events={[{ x: 1, y: 0, label: "e", kind: "impact" }]} />);
    expect(r.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("non-finite domains / points never produce NaN attributes", () => {
    const r = render(<DynamicPlot2D width={300} height={150} xDomain={[NaN, Infinity]} yDomain={[5, 5]} xLabel="x" yLabel="y" title="t" progress={[{ id: "s", points: [{ x: NaN, y: 1 }, { x: 1, y: Infinity }] }]} marker={{ x: NaN, y: 2 }} nowX={Infinity} />);
    expect(r.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe("20E-E1 DynamicErrorBoundary keeps the exam alive", () => {
  it("a throwing dynamic renderer is replaced by the static fallback; siblings keep working", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never { throw new Error("renderer failure"); }
    const r = render(<div><DynamicErrorBoundary fallback={<p data-testid="fallback">عرض ثابت</p>}><Boom /></DynamicErrorBoundary><button>حفظ</button></div>);
    expect(r.getByTestId("fallback")).toBeTruthy();
    fireEvent.click(r.getByRole("button", { name: "حفظ" }));
  });
});
