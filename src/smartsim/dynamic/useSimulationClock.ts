import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clockAdvance, clockPause, clockPlay, clockRestart, clockSeek, clockSetRate, clockStep, createClock, type ClockState } from "./simulationClock";

// Phase 20E — the React binding of the presentation clock. Exactly ONE requestAnimationFrame loop exists while the clock plays: the effect
// is keyed on `playing` only (rate / seek changes during playback reuse the loop and its last timestamp), and it is cancelled on pause,
// unmount and duration change. The first frame after (re)starting contributes 0 s, so a long pause never turns into a jump. When the
// document becomes hidden the clock pauses and does not catch up on return (resume continues from the same simulation time). Reduced
// motion never autoplays. Nothing here touches academic state: callers derive their view from `state.time`.
export type SimulationClockApi = {
  state: ClockState;
  play: () => void; pause: () => void; toggle: () => void; restart: () => void;
  seek: (t: number) => void; step: (dt: number) => void; setRate: (r: number) => void;
};

export function useSimulationClock(duration: number, opts: { autoPlay?: boolean; reducedMotion?: boolean } = {}): SimulationClockApi {
  const autoPlay = !!opts.autoPlay && !opts.reducedMotion;
  const [state, setState] = useState<ClockState>(() => { const c = createClock(duration); return autoPlay ? clockPlay(c) : c; });
  // duration change ⇒ a fresh clock at the clamped current time (paused)
  const sameDuration = createClock(duration).duration === state.duration;
  if (!sameDuration) setState(s => clockSeek(createClock(duration, s.rate), s.time));
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!state.playing || typeof requestAnimationFrame !== "function") return;
    let id = 0;
    last.current = null;
    const frame = (ts: number) => {
      const elapsed = last.current === null ? 0 : ts - last.current;
      last.current = ts;
      setState(s => clockAdvance(s, elapsed));
      // the next frame is cancelled by this effect's cleanup as soon as the clock stops (end reached / paused / hidden)
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(id); last.current = null; };
  }, [state.playing, state.duration]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => { if (document.visibilityState === "hidden") setState(clockPause); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const play = useCallback(() => setState(clockPlay), []);
  const pause = useCallback(() => setState(clockPause), []);
  const toggle = useCallback(() => setState(s => (s.playing ? clockPause(s) : clockPlay(s))), []);
  const restart = useCallback(() => setState(clockRestart), []);
  const seek = useCallback((t: number) => setState(s => clockSeek(s, t)), []);
  const step = useCallback((dt: number) => setState(s => clockStep(s, dt)), []);
  const setRate = useCallback((r: number) => setState(s => clockSetRate(s, r)), []);
  return useMemo(() => ({ state, play, pause, toggle, restart, seek, step, setRate }), [state, play, pause, toggle, restart, seek, step, setRate]);
}
