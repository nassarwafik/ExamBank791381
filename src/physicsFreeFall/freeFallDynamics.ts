// Phase 20E — physicsFreeFall@1 PRESENTATION adapter for the dynamic SmartSim runtime (pure, no DOM, no clock, no academic state).
//
// The presentation clock only says which simulation time is on screen; this adapter turns that time into what the workspace draws, by
// evaluating the SAME analytic formulas the trusted engine uses (heightAt / velocityAt / impactTime / impactSpeed / peakHeight). Nothing
// here is integrated frame by frame, nothing is graded and nothing reaches the answer.
//   frame(t)  : t clamped to [0, t_impact]; y = max(0, y(t)); v = v(t) — at and after impact v keeps the physical impact velocity
//               v(t_impact) = −impact speed (the body hits the ground moving; it is never shown as 0 m/s); a = −g; landed = t ≥ t_impact.
//   events    : the apex (v = 0, highest point) only for an upward throw whose apex precedes impact, then the impact.
//   samples   : a deterministic, bounded, strictly time-ordered sample set on [0, t_impact] that ends exactly at impact (computed once per
//               model; the progressive plots show a prefix of it plus the exact current point).
import { heightAt, impactSpeed, impactTime, peakHeight, velocityAt, type FreeFallModel } from "../physicsFreeFallModel";
import { DYNAMIC_LIMITS } from "../smartsim/dynamic/simulationClock";

export type FreeFallFrame = { t: number; y: number; v: number; a: number; landed: boolean };
export type FreeFallEventKind = "apex" | "impact";
export type FreeFallEvent = { kind: FreeFallEventKind; t: number; y: number; v: number; label: string };
export type FreeFallSample = { t: number; y: number; v: number };

export const FREE_FALL_EVENT_LABEL: Readonly<Record<FreeFallEventKind, string>> = Object.freeze({ apex: "أعلى نقطة", impact: "الارتطام بالأرض" });

/** The body's presentation state at simulation time t (non-finite t ⇒ 0; clamped to the flight [0, t_impact]). */
export function freeFallFrame(m: FreeFallModel, t: number): FreeFallFrame {
  const end = impactTime(m);
  const time = Number.isFinite(t) ? Math.min(end, Math.max(0, t)) : 0;
  const landed = time >= end;
  return { t: time, y: landed ? 0 : Math.max(0, heightAt(m, time)), v: velocityAt(m, landed ? end : time), a: -m.gravity, landed };
}

/** The meaningful moments of the flight, in time order: [apex (upward throw only)], impact. */
export function freeFallEvents(m: FreeFallModel): FreeFallEvent[] {
  const end = impactTime(m);
  const out: FreeFallEvent[] = [];
  if (m.initialVelocity > 0) {
    const tApex = m.initialVelocity / m.gravity;
    if (tApex < end) out.push({ kind: "apex", t: tApex, y: peakHeight(m), v: 0, label: FREE_FALL_EVENT_LABEL.apex });
  }
  out.push({ kind: "impact", t: end, y: 0, v: -impactSpeed(m), label: FREE_FALL_EVENT_LABEL.impact });
  return out;
}

/** Exactly n = clamp(floor(count), 2, plotPointsMax) samples on [0, t_impact]; t strictly increasing; the last t is exactly t_impact. */
export function freeFallSamples(m: FreeFallModel, count = 240): FreeFallSample[] {
  const n = Math.max(2, Math.min(DYNAMIC_LIMITS.plotPointsMax, Number.isFinite(count) ? Math.floor(count) : 2));
  const end = impactTime(m);
  const out: FreeFallSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = i === n - 1 ? end : (i * end) / (n - 1);
    out.push({ t, y: Math.max(0, heightAt(m, t)), v: velocityAt(m, t) });
  }
  return out;
}
