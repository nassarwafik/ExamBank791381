import { memo, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmtLab, type CircuitSolution, type LabFrame, type LabModel } from "../physics/labCore";
import { niceTicks } from "../smartsim/dynamic/progressivePath";

// Phase 21D-A.2 — the 2D scenes of physicsLab@1 (presentation only; trusted SVG primitives built from numbers). Pendulum (draggable bob
// when the teacher permits the start angle and the clock is at t = 0), vertical mass-spring with its equilibrium line, a body moving
// vertically above the ground, and a DC circuit schematic per topology with selectable resistors, voltmeter / ammeter and markers that
// show the CONVENTIONAL current direction (their speed is a schematic cue proportional to the current, not the drift velocity). Energy
// bars accompany the mechanical experiments; "conserved" is only ever said when there is no damping / drag.
export const SCENE_W = 360, SCENE_H = 240;
const F_MAX = 54, V_MAX = 50, MIN_LEN = 6;
export type LabSceneScales = { speedMax: number; forceMax: number; energyMax: number; qMax: number; extMin: number; extMax: number };

function Arrow({ x, y, dx, dy, len, cls, label, short, testId }: { x: number; y: number; dx: number; dy: number; len: number; cls: string; label: string; short: string; testId: string }) {
  const n = Math.hypot(dx, dy);
  if (!(n > 0) || !(len > 0)) return null;
  const ux = dx / n, uy = dy / n, tx = x + ux * len, ty = y + uy * len, head = Math.min(7, len * 0.5), bx = tx - ux * head, by = ty - uy * head, f = (v: number) => v.toFixed(2);
  return (
    <g className={"motion-vector " + cls} data-testid={testId}>
      <title>{label}</title>
      <line x1={f(x)} y1={f(y)} x2={f(bx)} y2={f(by)} />
      <polygon points={f(tx) + "," + f(ty) + " " + f(bx - uy * 4) + "," + f(by + ux * 4) + " " + f(bx + uy * 4) + "," + f(by - ux * 4)} />
      <text x={f(tx + ux * 4 + 2)} y={f(ty + uy * 4 + 4)}>{short}</text>
    </g>
  );
}
const lenOf = (mag: number, max: number, cap: number) => (mag > 1e-12 && max > 0 ? Math.max(MIN_LEN, Math.min(cap, (mag / max) * cap)) : 0);

function EnergyBars({ frame, max, conserved, x0 }: { frame: LabFrame; max: number; conserved: boolean; x0: number }) {
  const e = frame.energy;
  if (!e) return null;
  const bars = [
    { id: "ke", label: "حركية", v: e.kinetic, cls: "is-ke" }, { id: "pe", label: "وضع", v: e.potential, cls: "is-pe" },
    { id: "total", label: "كلية", v: e.total, cls: "is-total" }, ...(conserved ? [] : [{ id: "lost", label: "مبددة", v: e.dissipated, cls: "is-lost" }])
  ];
  const top = 34, bottom = SCENE_H - 34, h = bottom - top, w = 22, gap = 8;
  return (
    <g className="lab-bars" data-testid="lab-energy-bars" role="group" aria-label={"أعمدة الطاقة: حركية " + fmtLab(e.kinetic) + " J، وضع " + fmtLab(e.potential) + " J، كلية " + fmtLab(e.total) + " J" + (conserved ? " (محفوظة)" : "، مبددة " + fmtLab(e.dissipated) + " J")}>
      <text className="lab-bars-title" x={x0} y={18}>{conserved ? "الطاقة (J) — محفوظة" : "الطاقة (J) — تتبدد"}</text>
      <line className="lab-bars-axis" x1={x0} x2={x0 + bars.length * (w + gap)} y1={bottom} y2={bottom} />
      {bars.map((b, i) => {
        const bh = max > 0 ? Math.max(0, Math.min(1, b.v / max)) * h : 0, bx = x0 + i * (w + gap);
        return (
          <g key={b.id} className={"lab-bar " + b.cls} data-id={b.id}>
            <rect x={bx} y={(bottom - bh).toFixed(2)} width={w} height={bh.toFixed(2)} rx={2} />
            <text x={bx + w / 2} y={bottom + 12} textAnchor="middle">{b.label}</text>
          </g>
        );
      })}
    </g>
  );
}
function ScaleBar({ pxPerMetre, span, x, y, vertical }: { pxPerMetre: number; span: number; x: number; y: number; vertical?: boolean }) {
  const t = niceTicks(0, Math.max(span, 1e-9), 4), unit = t.length > 1 ? t[1] - t[0] : 0, px = unit * pxPerMetre;
  if (!(px > 4) || !Number.isFinite(px)) return null;
  return vertical
    ? <g className="motion-scalebar" data-testid="lab-scalebar"><line x1={x} x2={x} y1={(y - px).toFixed(2)} y2={y} /><text x={x + 4} y={(y - px / 2).toFixed(2)}>{fmtLab(unit)} m</text></g>
    : <g className="motion-scalebar" data-testid="lab-scalebar"><line x1={x} x2={(x + px).toFixed(2)} y1={y} y2={y} /><text x={(x + px + 4).toFixed(2)} y={y + 3}>{fmtLab(unit)} m</text></g>;
}

export type DragSpec = { min: number; max: number; step: number; onAngle: (deg: number) => void };
type Props = { model: LabModel; frame: LabFrame; scales: LabSceneScales; showVectors: boolean; conserved: boolean; drag?: DragSpec; selected?: string; onSelect?: (id: string) => void };
function LabScene({ model, frame, scales, showVectors, conserved, drag, selected, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const p = model.params;
  let body: ReactNode = null, vectors: ReactNode = null, bars = true;
  if (model.kind === "pendulum") {
    // fit the whole swing (amplitude ≤ θ₀; above 90° the bob rises over the pivot) inside the drawing area left of the energy bars
    const thMax = Math.min(180, Math.abs(scales.qMax)) * Math.PI / 180, c = Math.max(0, -Math.cos(thMax));
    const Lpx = Math.min(150, 186 / (1 + c), 104 / Math.max(Math.sin(Math.min(thMax, Math.PI / 2)), 1e-3)), px = 112, py = 14 + Lpx * c;
    const th = (frame.q * Math.PI) / 180, bx = px + Lpx * Math.sin(th), by = py + Lpx * Math.cos(th);
    const snap = (deg: number) => { const d = drag!; const v = Math.min(d.max, Math.max(d.min, Math.round((deg - d.min) / d.step) * d.step + d.min)); return Number(v.toPrecision(10)); };
    const fromPointer = (e: PointerEvent<SVGGElement>) => {
      const s = svg.current, m = s?.getScreenCTM?.();
      if (!s || !m || !drag) return;
      const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(m.inverse()), deg = (Math.atan2(q.x - px, q.y - py) * 180) / Math.PI;
      drag.onAngle(snap(deg));
    };
    const onKey = (e: KeyboardEvent<SVGGElement>) => {
      if (!drag) return;
      const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? drag.step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -drag.step : 0;
      if (d) { e.preventDefault(); drag.onAngle(snap(frame.q + d)); }
    };
    const r = (fo: string) => frame.forces.find(x => x.id === fo);
    body = (
      <>
        <line className="lab-ceiling" x1={px - 50} x2={px + 50} y1={py} y2={py} />
        <line className="lab-rest-line" x1={px} x2={px} y1={py} y2={py + Lpx + 14} />
        <line className="lab-rod" x1={px} y1={py} x2={bx.toFixed(2)} y2={by.toFixed(2)} />
        <text className="motion-axis-text" x={px + 6} y={py + Lpx + 26}>θ = {fmtLab(frame.q)}°</text>
        <text className="motion-axis-text" x={4} y={SCENE_H - 8}>L = {fmtLab(p.length)} m</text>
        <g className={"lab-bob" + (drag ? " is-draggable" : "")} data-testid="lab-body"
          {...(drag ? { role: "slider", tabIndex: 0, "aria-label": "زاوية الإزاحة الابتدائية (اسحب أو استخدم الأسهم)", "aria-valuemin": drag.min, "aria-valuemax": drag.max, "aria-valuenow": Number(frame.q.toFixed(2)), "aria-valuetext": fmtLab(frame.q) + " درجة",
            onPointerDown: (e: PointerEvent<SVGGElement>) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); fromPointer(e); }, onPointerMove: (e: PointerEvent<SVGGElement>) => { if (e.buttons) fromPointer(e); }, onKeyDown: onKey } : {})}>
          <circle cx={bx.toFixed(2)} cy={by.toFixed(2)} r={11} />
        </g>
      </>
    );
    if (showVectors) vectors = (
      <>
        <Arrow x={bx} y={by} dx={frame.velocity.x} dy={-frame.velocity.y} len={lenOf(frame.speed, scales.speedMax, V_MAX)} cls="is-velocity" label={"السرعة " + fmtLab(frame.speed) + " m/s"} short="v" testId="lab-vector-v" />
        {["tension", "weight", "damping"].map(id => { const fo = r(id); return fo ? <Arrow key={id} x={bx} y={by} dx={fo.vector.x} dy={-fo.vector.y} len={lenOf(fo.magnitude, scales.forceMax, F_MAX)} cls={"is-" + (id === "tension" ? "normal" : id === "weight" ? "weight" : "friction")} label={fo.label + " = " + fmtLab(fo.magnitude) + " N"} short={id === "tension" ? "T" : id === "weight" ? "mg" : "f"} testId={"lab-force-" + id} /> : null; })}
      </>
    );
  } else if (model.kind === "spring") {
    // the spring's extension over the run (including 0 = natural length and Δ = equilibrium) is mapped into the drawing height
    const ax = 112, top = 16, lo = Math.min(0, scales.extMin), hi = Math.max(scales.extMax, lo + 1e-9), k = 150 / (hi - lo), yOf = (e: number) => top + 24 + (e - lo) * k;
    const ext = -frame.position.y, delta = (p.mass * p.gravity) / p.springConstant, y = yOf(ext), natural = yOf(0) - top, span = hi - lo, coils = 10;
    const pts: string[] = [ax + "," + top];
    for (let i = 1; i < coils * 2; i++) pts.push((ax + (i % 2 ? -12 : 12)) + "," + (top + ((y - top) * i) / (coils * 2)).toFixed(2));
    pts.push(ax + "," + y.toFixed(2));
    body = (
      <>
        <line className="lab-ceiling" x1={ax - 50} x2={ax + 50} y1={top} y2={top} />
        <polyline className="lab-spring" points={pts.join(" ")} />
        <line className="lab-rest-line" x1={ax - 60} x2={ax + 60} y1={yOf(delta).toFixed(2)} y2={yOf(delta).toFixed(2)} />
        <text className="motion-axis-text" x={ax + 62} y={(yOf(delta) + 3).toFixed(2)}>اتزان</text>
        <line className="motion-start" x1={ax - 40} x2={ax + 40} y1={top + natural} y2={top + natural} />
        <text className="motion-axis-text" x={ax + 42} y={top + natural + 3}>طول طبيعي</text>
        <rect className="lab-mass" data-testid="lab-body" x={ax - 18} y={y.toFixed(2)} width={36} height={26} rx={3} />
        <ScaleBar pxPerMetre={k} span={span} x={20} y={SCENE_H - 14} vertical />
      </>
    );
    if (showVectors) vectors = ["spring", "weight", "damping"].map(id => {
      const fo = frame.forces.find(x => x.id === id);
      return fo ? <Arrow key={id} x={ax + (id === "weight" ? 8 : id === "damping" ? 26 : -8)} y={y + 13} dx={0} dy={-fo.vector.y} len={lenOf(fo.magnitude, scales.forceMax, F_MAX)} cls={"is-" + (id === "spring" ? "applied" : id === "weight" ? "weight" : "friction")} label={fo.label + " = " + fmtLab(fo.magnitude) + " N"} short={id === "spring" ? "F" : id === "weight" ? "mg" : "f"} testId={"lab-force-" + id} /> : null;
    });
  } else if (model.kind === "energy") {
    const ground = SCENE_H - 26, topY = 24, k = (ground - topY) / Math.max(scales.qMax, 1e-9), y = ground - frame.q * k - 9;
    body = (
      <>
        <rect className="motion-ground" x={0} y={ground} width={220} height={SCENE_H - ground} />
        <line className="motion-ground-line" x1={0} x2={220} y1={ground} y2={ground} />
        <circle className={"motion-body" + (frame.status === "landed" ? " is-done" : "")} data-testid="lab-body" cx={112} cy={y.toFixed(2)} r={9} />
        <ScaleBar pxPerMetre={k} span={scales.qMax} x={20} y={ground} vertical />
      </>
    );
    if (showVectors) vectors = (
      <>
        <Arrow x={128} y={y} dx={0} dy={-frame.velocity.y} len={lenOf(frame.speed, scales.speedMax, V_MAX)} cls="is-velocity" label={"السرعة " + fmtLab(frame.rate) + " m/s"} short="v" testId="lab-vector-v" />
        {p.drag > 0 && (() => { const fo = frame.forces.find(x => x.id === "drag")!; return <Arrow x={96} y={y} dx={0} dy={-fo.vector.y} len={lenOf(fo.magnitude, scales.forceMax, F_MAX)} cls="is-friction" label={fo.label + " = " + fmtLab(fo.magnitude) + " N"} short="f" testId="lab-force-drag" />; })()}
      </>
    );
  } else {
    bars = false;
    body = <CircuitSchematic sol={frame.circuit!} params={p} t={frame.t} selected={selected} onSelect={onSelect} showCurrent={showVectors} />;
  }
  return (
    <svg ref={svg} viewBox={"0 0 " + SCENE_W + " " + SCENE_H} role="img" aria-label={"مشهد تجربة " + model.kind} data-testid="lab-scene" data-kind={model.kind}>
      {body}{vectors}
      {bars && <EnergyBars frame={frame} max={scales.energyMax} conserved={conserved} x0={236} />}
    </svg>
  );
}
export default memo(LabScene);

// ── circuit schematic ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Seg = [number, number, number, number];
type Layout = { wires: Seg[]; resistors: Record<"r1" | "r2" | "r3", Seg>; main: Seg };
const TOP = 46, BOT = 196, BATX = 40;
const LAYOUTS: Record<number, Layout> = {
  1: { main: [BATX, BOT, BATX, TOP], wires: [[BATX, TOP, 100, TOP], [160, TOP, 200, TOP], [260, TOP, 320, TOP], [320, TOP, 320, 96], [320, 156, 320, BOT], [320, BOT, BATX, BOT]], resistors: { r1: [100, TOP, 160, TOP], r2: [200, TOP, 260, TOP], r3: [320, 96, 320, 156] } },
  2: { main: [BATX, BOT, BATX, TOP], wires: [[BATX, TOP, 300, TOP], [BATX, BOT, 300, BOT], [140, TOP, 140, 91], [140, 151, 140, BOT], [220, TOP, 220, 91], [220, 151, 220, BOT], [300, TOP, 300, 91], [300, 151, 300, BOT]], resistors: { r1: [140, 91, 140, 151], r2: [220, 91, 220, 151], r3: [300, 91, 300, 151] } },
  3: { main: [BATX, BOT, BATX, TOP], wires: [[BATX, TOP, 90, TOP], [150, TOP, 300, TOP], [BATX, BOT, 300, BOT], [220, TOP, 220, 91], [220, 151, 220, BOT], [300, TOP, 300, 91], [300, 151, 300, BOT]], resistors: { r1: [90, TOP, 150, TOP], r2: [220, 91, 220, 151], r3: [300, 91, 300, 151] } },
  4: { main: [BATX, BOT, BATX, TOP], wires: [[BATX, TOP, 300, TOP], [BATX, BOT, 300, BOT], [200, TOP, 200, 62], [200, 112, 200, 130], [200, 180, 200, BOT], [300, TOP, 300, 91], [300, 151, 300, BOT]], resistors: { r1: [200, 62, 200, 112], r2: [200, 130, 200, 180], r3: [300, 91, 300, 151] } }
};
function CircuitSchematic({ sol, params, t, selected, onSelect, showCurrent }: { sol: CircuitSolution; params: Record<string, number>; t: number; selected?: string; onSelect?: (id: string) => void; showCurrent: boolean }) {
  const L = LAYOUTS[sol.topology] ?? LAYOUTS[1], imax = Math.max(...sol.branches.map(b => Math.abs(b.current)), 1e-300);
  const markers = (seg: Seg, current: number, key: string) => {
    if (!showCurrent || !(Math.abs(current) > 0)) return null;
    const speed = 0.15 + 0.6 * (Math.abs(current) / imax), [x1, y1, x2, y2] = seg, out: ReactNode[] = [];
    for (let k = 0; k < 2; k++) {
      const f = ((t * speed + k / 2) % 1 + 1) % 1, x = x1 + (x2 - x1) * f, y = y1 + (y2 - y1) * f, a = Math.atan2(y2 - y1, x2 - x1);
      out.push(<polygon key={key + k} className="lab-current" points={[[6, 0], [-4, -4], [-4, 4]].map(([px, py]) => (x + px * Math.cos(a) - py * Math.sin(a)).toFixed(2) + "," + (y + px * Math.sin(a) + py * Math.cos(a)).toFixed(2)).join(" ")} />);
    }
    return out;
  };
  const sel = sol.branches.find(b => b.id === selected);
  return (
    <g data-testid="lab-circuit" data-topology={sol.topology}>
      {L.wires.map((w, i) => <line key={i} className="lab-wire" x1={w[0]} y1={w[1]} x2={w[2]} y2={w[3]} />)}
      <g className="lab-battery" aria-label={"المصدر " + fmtLab(params.voltage) + " V"}>
        <line className="lab-wire" x1={BATX} y1={BOT} x2={BATX} y2={128} /><line className="lab-wire" x1={BATX} y1={114} x2={BATX} y2={TOP} />
        <line className="lab-cell-long" x1={BATX - 14} x2={BATX + 14} y1={114} y2={114} /><line className="lab-cell-short" x1={BATX - 8} x2={BATX + 8} y1={128} y2={128} />
        <text className="motion-axis-text" x={BATX + 16} y={112}>+</text><text className="motion-axis-text" x={4} y={124}>{fmtLab(params.voltage)} V</text>
      </g>
      <g className="lab-ammeter" data-testid="lab-ammeter"><circle cx={BATX} cy={76} r={11} /><text x={BATX} y={80} textAnchor="middle">A</text><text className="motion-axis-text" x={BATX + 14} y={80}>{fmtLab(sol.sourceCurrent)} A</text></g>
      {showCurrent && markers([BATX, BOT, BATX, TOP], sol.sourceCurrent, "main")}
      {sol.branches.map(b => {
        const s = L.resistors[b.id], vertical = s[0] === s[2], cx = (s[0] + s[2]) / 2, cy = (s[1] + s[3]) / 2, isSel = selected === b.id;
        const box = vertical ? { x: cx - 8, y: s[1], w: 16, h: s[3] - s[1] } : { x: s[0], y: cy - 8, w: s[2] - s[0], h: 16 };
        return (
          <g key={b.id} className={"lab-resistor" + (isSel ? " is-selected" : "")} data-testid={"lab-resistor-" + b.id} role="button" tabIndex={0} aria-pressed={isSel}
            aria-label={b.id.toUpperCase() + " = " + fmtLab(b.resistance) + " Ω — اختر لقياس الجهد والتيار"} onClick={() => onSelect?.(b.id)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(b.id); } }}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={2} />
            <text className="motion-axis-text" x={vertical ? cx + 12 : cx} y={vertical ? cy + 3 : cy - 12} textAnchor={vertical ? "start" : "middle"}>{b.id.toUpperCase()} = {fmtLab(b.resistance)} Ω</text>
            {markers(s, b.current, b.id)}
          </g>
        );
      })}
      {sel && (() => {
        const s = L.resistors[sel.id], vertical = s[0] === s[2], mx = vertical ? s[0] - 34 : (s[0] + s[2]) / 2, my = vertical ? (s[1] + s[3]) / 2 : s[1] + 34;
        return (
          <g className="lab-voltmeter" data-testid="lab-voltmeter">
            <line className="lab-probe" x1={s[0]} y1={s[1]} x2={mx} y2={my} /><line className="lab-probe" x1={s[2]} y1={s[3]} x2={mx} y2={my} />
            <circle cx={mx} cy={my} r={11} /><text x={mx} y={my + 4} textAnchor="middle">V</text>
            <text className="motion-axis-text" x={mx} y={my + 24} textAnchor="middle">{fmtLab(Math.abs(sel.voltage))} V</text>
          </g>
        );
      })()}
    </g>
  );
}
