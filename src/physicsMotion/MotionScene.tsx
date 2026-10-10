import { memo, type ReactNode } from "react";
import { fmtMotion, type MotionFrame, type MotionModel, type Vec } from "../physics/motionCore";
import type { SceneBounds, SceneScales } from "./motionView";
import { niceTicks } from "../smartsim/dynamic/progressivePath";

// Phase 21D-A.1 — the 2D scene of physicsMotion@1 (presentation only). Trusted SVG primitives built from numbers: the body of each
// experiment at the clock time, the ground / track / incline, and the velocity and force vectors (scaled to the largest value of the run
// so their lengths are comparable over time). World units are metres; the projectile and the incline keep a UNIFORM scale so angles and
// trajectory shapes are true; free fall and Newton's track only need their motion axis.
export const SCENE_W = 360, SCENE_H = 240;
const PAD = 26, GROUND_Y = SCENE_H - 26, BODY_R = 9, BLOCK = 22, V_MAX = 56, F_MAX = 62, MIN_LEN = 7;


const FORCE_SHORT: Readonly<Record<string, string>> = Object.freeze({ weight: "mg", normal: "N", applied: "F", friction: "f", net: "ΣF", gravityParallel: "mg∥", gravityPerpendicular: "mg⊥" });
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** An arrow of screen direction (dx, dy) (y down) and length len from (x, y). */
function Arrow({ x, y, dx, dy, len, cls, label, short, testId }: { x: number; y: number; dx: number; dy: number; len: number; cls: string; label: string; short: string; testId: string }) {
  const n = Math.hypot(dx, dy);
  if (!(n > 0) || !(len > 0)) return <g className={"motion-vector " + cls} data-testid={testId} data-direction="none"><title>{label}</title><circle cx={x} cy={y} r={2.5} /></g>;
  const ux = dx / n, uy = dy / n, tx = x + ux * len, ty = y + uy * len, head = Math.min(8, len * 0.5), bx = tx - ux * head, by = ty - uy * head;
  const f = (v: number) => v.toFixed(2);
  return (
    <g className={"motion-vector " + cls} data-testid={testId} data-direction={Math.abs(ux) >= Math.abs(uy) ? (ux > 0 ? "right" : "left") : uy > 0 ? "down" : "up"}>
      <title>{label}</title>
      <line x1={f(x)} y1={f(y)} x2={f(bx)} y2={f(by)} />
      <polygon points={f(tx) + "," + f(ty) + " " + f(bx - uy * 4.5) + "," + f(by + ux * 4.5) + " " + f(bx + uy * 4.5) + "," + f(by - ux * 4.5)} />
      <text x={f(tx + ux * 4 + 3)} y={f(ty + uy * 4 + 4)}>{short}</text>
    </g>
  );
}
/** A neutral scale bar (a "nice" length in metres and its pixel length) — never the run's exact extent, which would give away a measured
 *  quantity (range, displacement, peak height) before the experiment is run. */
function ScaleBar({ pxPerMetre, span, vertical }: { pxPerMetre: number; span: number; vertical?: boolean }) {
  const ticks = niceTicks(0, Math.max(span, 1e-9), 5), unit = ticks.length > 1 ? ticks[1] - ticks[0] : 0, px = unit * pxPerMetre;
  if (!(px > 4) || !Number.isFinite(px)) return null;
  const x = 8, y = SCENE_H - 8;
  return vertical
    ? <g className="motion-scalebar" data-testid="motion-scalebar"><line x1={x + 4} x2={x + 4} y1={(GROUND_Y - px).toFixed(2)} y2={GROUND_Y} /><text x={x + 8} y={(GROUND_Y - px / 2).toFixed(2)}>{fmtMotion(unit)} m</text></g>
    : <g className="motion-scalebar" data-testid="motion-scalebar"><line x1={x} x2={(x + px).toFixed(2)} y1={y} y2={y} /><text x={(x + px + 4).toFixed(2)} y={y + 3}>{fmtMotion(unit)} m</text></g>;
}
const lenOf = (mag: number, max: number, cap: number) => (mag > 1e-12 && max > 0 ? Math.max(MIN_LEN, Math.min(cap, (mag / max) * cap)) : 0);

/** World → screen with a uniform scale that fits `b` into the scene (centred), ground at the bottom. */
function uniform(b: SceneBounds) {
  const w = Math.max(b.x1 - b.x0, 1e-9), h = Math.max(b.y1 - b.y0, 1e-9);
  const sx = (SCENE_W - 2 * PAD) / w, sy = (GROUND_Y - PAD) / h, k = Math.min(sx, sy);
  const ox = PAD + ((SCENE_W - 2 * PAD) - w * k) / 2;
  return { k, X: (x: number) => ox + (x - b.x0) * k, Y: (y: number) => GROUND_Y - (y - b.y0) * k };
}

type Props = { model: MotionModel; frame: MotionFrame; scales: SceneScales; showVelocity: boolean; showForces: boolean };
function MotionScene({ model, frame, scales, showVelocity, showForces }: Props) {
  const p = model.params, kind = model.kind, b = scales.bounds;
  let body: { x: number; y: number }, ground: ReactNode = null, shape: ReactNode, extra: ReactNode = null, axis: ReactNode = null;
  const toScreen = (v: Vec) => ({ dx: v.x, dy: -v.y });
  if (kind === "freeFall") {
    const top = Math.max(b.y1, 1e-9), Y = (y: number) => GROUND_Y - (y / top) * (GROUND_Y - PAD);
    body = { x: SCENE_W / 2, y: Y(frame.position.y) - BODY_R };
    ground = <><rect className="motion-ground" x={0} y={GROUND_Y} width={SCENE_W} height={SCENE_H - GROUND_Y} /><line className="motion-ground-line" x1={0} x2={SCENE_W} y1={GROUND_Y} y2={GROUND_Y} /></>;
    extra = <line className="motion-start" x1={SCENE_W / 2 - 40} x2={SCENE_W / 2 + 40} y1={Y(p.initialHeight)} y2={Y(p.initialHeight)} />;
    axis = <><text className="motion-axis-text" x={4} y={PAD - 8}>y (m)</text><ScaleBar pxPerMetre={(GROUND_Y - PAD) / top} span={top} vertical /></>;
    shape = <circle className={"motion-body" + (frame.status === "landed" ? " is-done" : "")} data-testid="motion-body" cx={body.x.toFixed(2)} cy={body.y.toFixed(2)} r={BODY_R} />;
  } else if (kind === "projectile") {
    const u = uniform(b);
    body = { x: u.X(frame.position.x), y: u.Y(frame.position.y) - BODY_R };
    ground = <><rect className="motion-ground" x={0} y={GROUND_Y} width={SCENE_W} height={SCENE_H - GROUND_Y} /><line className="motion-ground-line" x1={0} x2={SCENE_W} y1={GROUND_Y} y2={GROUND_Y} /></>;
    if (p.launchHeight > 0) extra = <rect className="motion-platform" x={(u.X(0) - 14).toFixed(2)} y={u.Y(p.launchHeight).toFixed(2)} width={14} height={(GROUND_Y - u.Y(p.launchHeight)).toFixed(2)} />;
    axis = <ScaleBar pxPerMetre={u.k} span={Math.max(b.x1 - b.x0, b.y1 - b.y0)} />;
    // the trajectory: the whole path (dashed reference) and the part already travelled (solid), from the run's exact samples
    const pts = (list: readonly { x: number; y: number }[]) => list.map(q => u.X(q.x).toFixed(2) + "," + u.Y(q.y).toFixed(2)).join(" ");
    const done = [...scales.trail.filter(q => q.t <= frame.t), { x: frame.position.x, y: frame.position.y }];
    extra = <>{extra}<polyline className="motion-trail is-reference" points={pts(scales.trail)} /><polyline className="motion-trail" data-testid="motion-trail" points={pts(done)} /></>;
    shape = <circle className={"motion-body" + (frame.status === "landed" ? " is-done" : "")} data-testid="motion-body" cx={body.x.toFixed(2)} cy={body.y.toFixed(2)} r={BODY_R} />;
  } else if (kind === "newton2") {
    const span = Math.max(b.x1 - b.x0, 1e-9), X = (x: number) => PAD + BLOCK / 2 + ((x - b.x0) / span) * (SCENE_W - 2 * PAD - BLOCK);
    const surface = GROUND_Y - 30;
    body = { x: X(frame.position.x), y: surface - BLOCK / 2 };
    ground = <><rect className="motion-ground" x={0} y={surface} width={SCENE_W} height={SCENE_H - surface} /><line className="motion-ground-line" x1={0} x2={SCENE_W} y1={surface} y2={surface} /></>;
    axis = <ScaleBar pxPerMetre={(SCENE_W - 2 * PAD - BLOCK) / span} span={span} />;
    shape = <rect className={"motion-block" + (frame.status === "rest" ? " is-rest" : "")} data-testid="motion-body" x={(body.x - BLOCK / 2).toFixed(2)} y={(body.y - BLOCK / 2).toFixed(2)} width={BLOCK} height={BLOCK} rx={3} />;
  } else {
    const u = uniform(b), th = p.angle, rad = (th * Math.PI) / 180, top = { x: 0, y: p.length * Math.sin(rad) }, bottom = { x: p.length * Math.cos(rad), y: 0 };
    const contact = { x: u.X(frame.position.x), y: u.Y(frame.position.y) }, h = BLOCK / 2;
    body = { x: contact.x + Math.sin(rad) * h, y: contact.y - Math.cos(rad) * h };
    ground = <line className="motion-ground-line" x1={0} x2={SCENE_W} y1={GROUND_Y} y2={GROUND_Y} />;
    extra = <polygon className="motion-incline" points={[[u.X(top.x), u.Y(top.y)], [u.X(bottom.x), u.Y(bottom.y)], [u.X(top.x), u.Y(bottom.y)]].map(([x, y]) => x.toFixed(2) + "," + y.toFixed(2)).join(" ")} />;
    axis = <><text className="motion-axis-text" x={(u.X(bottom.x) - 40).toFixed(2)} y={(GROUND_Y - 6).toFixed(2)}>θ = {fmtMotion(th)}°</text><ScaleBar pxPerMetre={u.k} span={p.length} /></>;
    shape = <rect className={"motion-block" + (frame.status === "rest" ? " is-rest" : frame.status === "bottom" ? " is-done" : "")} data-testid="motion-body" x={-h} y={-h} width={BLOCK} height={BLOCK} rx={3} transform={"translate(" + body.x.toFixed(2) + " " + body.y.toFixed(2) + ") rotate(" + finite(th).toFixed(3) + ")"} />;
  }
  const v = toScreen(frame.velocity), vLen = lenOf(frame.speed, scales.speedMax, V_MAX);
  const label = "الجسم عند الزمن " + fmtMotion(frame.t) + " ثانية";
  return (
    <svg viewBox={"0 0 " + SCENE_W + " " + SCENE_H} role="img" aria-label={label} data-testid="motion-scene" data-kind={kind}>
      {ground}{extra}{axis}{shape}
      {showForces && frame.forces.map(fo => {
        const s = toScreen(fo.vector);
        return <Arrow key={fo.id} x={body.x} y={body.y} dx={s.dx} dy={s.dy} len={lenOf(fo.magnitude, scales.forceMax, F_MAX)} cls={"is-" + fo.id} label={fo.label + " = " + fmtMotion(fo.magnitude) + " N"} short={FORCE_SHORT[fo.id] ?? ""} testId={"motion-force-" + fo.id} />;
      })}
      {showForces && (kind === "freeFall" || kind === "projectile") && (
        <Arrow x={body.x - 14} y={body.y} dx={0} dy={1} len={V_MAX * 0.55} cls="is-acceleration" label={"التسارع g = " + fmtMotion(p.gravity) + " m/s² نحو الأسفل"} short="g" testId="motion-vector-a" />
      )}
      {showVelocity && <Arrow x={body.x} y={body.y} dx={v.dx} dy={v.dy} len={vLen} cls="is-velocity" label={"متجه السرعة: مقداره " + fmtMotion(frame.speed) + " m/s"} short="v" testId="motion-vector-v" />}
      {showVelocity && kind === "projectile" && <>
        <Arrow x={body.x} y={body.y} dx={frame.velocity.x} dy={0} len={lenOf(Math.abs(frame.velocity.x), scales.speedMax, V_MAX)} cls="is-component" label={"vx = " + fmtMotion(frame.velocity.x) + " m/s"} short="vx" testId="motion-vector-vx" />
        <Arrow x={body.x} y={body.y} dx={0} dy={-frame.velocity.y} len={lenOf(Math.abs(frame.velocity.y), scales.speedMax, V_MAX)} cls="is-component" label={"vy = " + fmtMotion(frame.velocity.y) + " m/s"} short="vy" testId="motion-vector-vy" />
      </>}
    </svg>
  );
}
export default memo(MotionScene);
