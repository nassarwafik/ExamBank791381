import { describe, it, expect } from "vitest";
import * as C from "./simulationClock";
import { countAtOrBefore, visiblePrefix, linearScale, niceTicks, pathData } from "./progressivePath";

// Phase 20E — the generic, domain-neutral dynamic runtime (pure). Fail-first on 78445fd: the modules do not exist.
// The clock is a PRESENTATION clock: deterministic, bounded, rate-scaled; it never touches academic state.

describe("20E-C1 deterministic simulation clock", () => {
  it("creation sanitizes the duration and the rate; the documented limits are frozen", () => {
    expect(C.SIMULATION_CLOCK_VERSION).toBe("SIMULATION_CLOCK_V1");
    expect(Object.isFrozen(C.DYNAMIC_LIMITS)).toBe(true);
    expect(C.DYNAMIC_LIMITS.rates).toEqual([0.25, 0.5, 1, 2]);
    expect(C.createClock(2)).toEqual({ time: 0, duration: 2, playing: false, rate: 1 });
    for (const bad of [NaN, Infinity, -1, 0, "3", null, undefined, 1e9]) expect(C.createClock(bad).duration, String(bad)).toBe(bad === 1e9 ? C.DYNAMIC_LIMITS.maxDurationSeconds : 0);
    expect(C.createClock(2, 0.5).rate).toBe(0.5);
    expect(C.createClock(2, 3).rate).toBe(1);
  });
  it("play / pause / restart / seek / step", () => {
    let s = C.createClock(4);
    s = C.clockPlay(s); expect(s.playing).toBe(true);
    s = C.clockPause(s); expect(s.playing).toBe(false);
    s = C.clockSeek(s, 1.5); expect(s.time).toBe(1.5);
    expect(C.clockSeek(s, -3).time).toBe(0);
    expect(C.clockSeek(s, 99).time).toBe(4);
    for (const bad of [NaN, Infinity, "1", undefined]) expect(C.clockSeek(s, bad).time, String(bad)).toBe(1.5);
    const playing = C.clockPlay(s);
    expect(C.clockSeek(playing, 2).playing).toBe(true);           // seeking does not change play state
    const stepped = C.clockStep(playing, 0.1);
    expect(stepped.time).toBeCloseTo(1.6, 12); expect(stepped.playing).toBe(false);
    expect(C.clockStep(s, -10).time).toBe(0);
    s = C.clockRestart(C.clockSeek(C.clockPlay(s), 3)); expect(s).toMatchObject({ time: 0, playing: false });
    // play at the end restarts from 0; a zero-duration clock never plays
    expect(C.clockPlay(C.clockSeek(C.createClock(2), 2))).toMatchObject({ time: 0, playing: true });
    expect(C.clockPlay(C.createClock(0)).playing).toBe(false);
  });
  it("advance uses elapsed monotonic time × rate, clamps pathological frame gaps and stops exactly at the end", () => {
    let s = C.clockPlay(C.createClock(10));
    s = C.clockAdvance(s, 16); expect(s.time).toBeCloseTo(0.016, 12);
    s = C.clockAdvance(s, 8000);                                       // tab frozen 8 s ⇒ bounded step, not a jump
    expect(s.time).toBeCloseTo(0.016 + C.DYNAMIC_LIMITS.maxFrameDeltaSeconds, 12);
    s = C.clockAdvance(s, -50); expect(s.time).toBeCloseTo(0.116, 12);
    s = C.clockAdvance(s, NaN); expect(s.time).toBeCloseTo(0.116, 12);
    let q = C.clockSetRate(C.clockPlay(C.createClock(10)), 0.25);
    q = C.clockAdvance(q, 100); expect(q.time).toBeCloseTo(0.025, 12);  // 0.25× ⇒ 0.1 s real → 0.025 s simulated
    q = C.clockSetRate(q, 2); q = C.clockAdvance(q, 50); expect(q.time).toBeCloseTo(0.125, 12);
    expect(C.clockSetRate(q, 7).rate).toBe(2);                          // only the documented rates
    let e = C.clockPlay(C.createClock(0.05));
    e = C.clockAdvance(e, 100);
    expect(e).toMatchObject({ time: 0.05, playing: false });
    const paused = C.clockPause(C.clockPlay(C.createClock(5)));
    expect(C.clockAdvance(paused, 100)).toBe(paused);                   // paused ⇒ no change (same object)
  });
  it("never mutates its input and reports progress", () => {
    const s = Object.freeze(C.clockPlay(C.createClock(4)));
    expect(() => { C.clockAdvance(s, 16); C.clockSeek(s, 1); C.clockPause(s); C.clockRestart(s); C.clockSetRate(s, 2); C.clockStep(s, 1); }).not.toThrow();
    expect(C.clockProgress(C.clockSeek(C.createClock(4), 1))).toBe(0.25);
    expect(C.clockProgress(C.createClock(0))).toBe(0);
  });
  it("seek / rate spam stays bounded and deterministic", () => {
    let s = C.clockPlay(C.createClock(3));
    for (let i = 0; i < 10000; i++) { s = C.clockSeek(s, (i * 7919) % 5 - 1); s = C.clockSetRate(s, [0.25, 0.5, 1, 2, 9][i % 5]); s = C.clockAdvance(s, i % 300); }
    expect(s.time).toBeGreaterThanOrEqual(0); expect(s.time).toBeLessThanOrEqual(3); expect(C.DYNAMIC_LIMITS.rates).toContain(s.rate);
  });
});

describe("20E-C2 progressive path and plot helpers", () => {
  const samples = Array.from({ length: 11 }, (_, i) => ({ t: i / 10, y: 10 - i }));
  it("countAtOrBefore is a binary search over sorted times", () => {
    expect(countAtOrBefore(samples, -1)).toBe(0);
    expect(countAtOrBefore(samples, 0)).toBe(1);
    expect(countAtOrBefore(samples, 0.35)).toBe(4);
    expect(countAtOrBefore(samples, 0.4)).toBe(5);
    expect(countAtOrBefore(samples, 99)).toBe(11);
    expect(countAtOrBefore([], 1)).toBe(0);
  });
  it("the visible path is the sample prefix strictly before t plus the EXACT current point (ordered, no duplicate)", () => {
    expect(visiblePrefix(samples, 0, { t: 0, y: 10 })).toEqual([{ t: 0, y: 10 }]);
    const p = visiblePrefix(samples, 0.35, { t: 0.35, y: 6.5 });
    expect(p.map(x => x.t)).toEqual([0, 0.1, 0.2, 0.3, 0.35]);
    expect(p.at(-1)).toEqual({ t: 0.35, y: 6.5 });
    const q = visiblePrefix(samples, 0.4, { t: 0.4, y: 6 });
    expect(q.map(x => x.t)).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(visiblePrefix(samples, 5, { t: 1, y: 0 }).length).toBe(11);
    // growth is monotonic with time
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) { const n = visiblePrefix(samples, t, { t, y: 0 }).length; expect(n).toBeGreaterThanOrEqual(prev); prev = n; }
  });
  it("scales, ticks and path data are finite and bounded", () => {
    const sx = linearScale(0, 10, 20, 220);
    expect(sx(0)).toBe(20); expect(sx(10)).toBe(220); expect(sx(5)).toBe(120);
    expect(linearScale(3, 3, 7, 9)(3)).toBe(7);
    const t = niceTicks(-2.3, 17.9, 6);
    expect(t.length).toBeGreaterThan(1); expect(t.length).toBeLessThanOrEqual(7);
    expect(t.every(Number.isFinite)).toBe(true); expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(niceTicks(NaN, 5).every(Number.isFinite)).toBe(true);
    expect(niceTicks(1, 1).every(Number.isFinite)).toBe(true);
    expect(niceTicks(-1e300, 1e300).length).toBeLessThanOrEqual(7);
    const d = pathData([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: NaN, y: 1 }, { x: 2, y: 3 }], v => v * 10, v => 100 - v * 10);
    expect(d).toMatch(/^M0\.00,100\.00 L10\.00,80\.00 M20\.00,70\.00$/);
    expect(pathData([], v => v, v => v)).toBe("");
    expect(pathData([{ x: 0, y: 0 }], v => v, v => v)).toBe("M0.00,0.00");
  });
});
