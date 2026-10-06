// Phase 20E — the deterministic PRESENTATION clock of the dynamic SmartSim runtime (pure, domain-neutral, no DOM).
//
// It answers one question: "which simulation time is on screen?". Plugins then compute their state from their own analytic model at that
// time (state = modelAt(time)) — the clock never integrates physics, never decides connectivity and never produces an academic action.
// Wall-clock frame time is turned into simulation time by `clockAdvance` (elapsed monotonic milliseconds × playback rate, every frame gap
// clamped so a frozen tab cannot jump the simulation); seek / step / restart set the time directly (no accumulated frame error).
// Every function returns a new state (or the very same object when nothing changes) and never mutates its input.

export const SIMULATION_CLOCK_VERSION = "SIMULATION_CLOCK_V1";
export const DYNAMIC_LIMITS = Object.freeze({
  /** The largest simulated step one animation frame may contribute at 1× (a 8 s frozen tab ⇒ 0.1 s, never 8 s). */
  maxFrameDeltaSeconds: 0.1,
  maxDurationSeconds: 600,
  rates: Object.freeze([0.25, 0.5, 1, 2]) as readonly number[],
  plotPointsMax: 2001,
  eventMarkersMax: 16,
  seriesMax: 4,
  flowHopsMax: 32,
  stepSeconds: 0.1
});

export type ClockState = { readonly time: number; readonly duration: number; readonly playing: boolean; readonly rate: number };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const allowedRate = (v: unknown): v is number => finite(v) && DYNAMIC_LIMITS.rates.includes(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A paused clock at t = 0. Non-finite / non-positive durations give an inert zero-length clock; huge ones are capped. */
export function createClock(duration: unknown, rate?: unknown): ClockState {
  const d = finite(duration) && duration > 0 ? Math.min(duration, DYNAMIC_LIMITS.maxDurationSeconds) : 0;
  return { time: 0, duration: d, playing: false, rate: allowedRate(rate) ? rate : 1 };
}
/** Starts playback; at the end it restarts from 0. A zero-length clock never plays. */
export function clockPlay(s: ClockState): ClockState {
  if (!(s.duration > 0)) return s;
  if (s.time >= s.duration) return { ...s, time: 0, playing: true };
  return s.playing ? s : { ...s, playing: true };
}
export const clockPause = (s: ClockState): ClockState => (s.playing ? { ...s, playing: false } : s);
export const clockRestart = (s: ClockState): ClockState => (s.time === 0 && !s.playing ? s : { ...s, time: 0, playing: false });
/** Sets the time directly from the canonical value (clamped to [0, duration]); keeps the play state; ignores non-finite input. */
export function clockSeek(s: ClockState, t: unknown): ClockState {
  if (!finite(t)) return s;
  const time = clamp(t, 0, s.duration);
  return time === s.time ? s : { ...s, time };
}
/** A manual step (the reduced-motion path): seek by dt and pause. */
export function clockStep(s: ClockState, dt: unknown): ClockState {
  if (!finite(dt)) return clockPause(s);
  return clockPause(clockSeek(s, s.time + dt));
}
/** Only the documented playback rates are accepted. */
export const clockSetRate = (s: ClockState, r: unknown): ClockState => (allowedRate(r) && r !== s.rate ? { ...s, rate: r } : s);
/** One animation frame: elapsed monotonic milliseconds (clamped to [0, maxFrameDelta]) × rate; stops exactly at the end. */
export function clockAdvance(s: ClockState, elapsedMs: unknown): ClockState {
  if (!s.playing) return s;
  const seconds = finite(elapsedMs) ? clamp(elapsedMs / 1000, 0, DYNAMIC_LIMITS.maxFrameDeltaSeconds) : 0;
  const time = Math.min(s.duration, s.time + seconds * s.rate);
  if (time >= s.duration) return { ...s, time: s.duration, playing: false };
  return time === s.time ? s : { ...s, time };
}
export const clockProgress = (s: ClockState): number => (s.duration > 0 ? s.time / s.duration : 0);
