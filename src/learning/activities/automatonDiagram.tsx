import type { Machine, RunStep } from "./automaton";
import { firstBaseline, KIND_TEXT, LINE_H, MIN_SCALE, type Placed, type Scene } from "./automatonScene";

// The VIEW of the state diagram (the layout is automatonScene.ts), shared by «تتبّع الآلة خطوة بخطوة» (AUTO-A1) and «صمّم الآلة»
// (AUTO-A3): a machine the learner builds is drawn exactly like the machines of the lessons. No state, no effects.

function Label({ pl, className, rtl }: { pl: Placed; className: string; rtl?: boolean }) {
  const y = firstBaseline(pl);
  // text-anchor follows the text's direction: in right-to-left text «start» is the RIGHT edge, so a side anchor is mirrored
  const anchor = rtl && pl.anchor !== "middle" ? (pl.anchor === "start" ? "end" : "start") : pl.anchor;
  return (
    <text className={className} x={pl.at.x} y={y} textAnchor={anchor} direction={rtl ? "rtl" : "ltr"}>
      {pl.lines.map((l, i) => <tspan key={i} x={pl.at.x} dy={i === 0 ? 0 : LINE_H}>{l}</tspan>)}
    </text>
  );
}

export function Diagram({ machine, scene, step, ids, live = true }: { machine: Machine; scene: Scene; step: Pick<RunStep, "active" | "used">; ids: string; live?: boolean }) {
  const { pos, box, r: R } = scene;
  const width = Math.ceil(box.x2 - box.x1), height = Math.ceil(box.y2 - box.y1);
  const summary = KIND_TEXT[machine.kind] + " حالاته " + machine.states.join("، ") + "؛ البداية " + machine.start
    + "؛ " + (machine.accept.length ? "القبول " + machine.accept.join("، ") : "لا حالة قبول") + "."
    + (live ? " الحالة الآن: " + (step.active.length ? step.active.join("، ") : "لا شيء") + "." : "");
  return (
    // LTR so a drawing wider than a phone scrolls from its LEFT edge, where the start state is
    <div className="learning-automaton-canvas" dir="ltr" tabIndex={0} role="region" aria-label="رسم الآلة">
      <svg className="learning-automaton-svg" viewBox={`${box.x1} ${box.y1} ${width} ${height}`} role="img" aria-label={summary}
        style={{ width: "100%", maxWidth: width + "px", minWidth: Math.round(width * MIN_SCALE) + "px" }}>
        <defs>
          <marker id={ids + "-a"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="learning-automaton-head" />
          </marker>
          <marker id={ids + "-u"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="learning-automaton-head is-used" />
          </marker>
        </defs>
        <path d={scene.start.d} className="learning-automaton-edge is-start" markerEnd={`url(#${ids}-a)`} />
        {scene.edges.map(({ e, d, label }) => {
          const used = step.used.includes(e.key);
          return (
            <g key={e.key} className={"learning-automaton-arrow" + (used ? " is-used" : "")}>
              <path d={d} className={"learning-automaton-edge" + (used ? " is-used" : "")} markerEnd={`url(#${ids}-${used ? "u" : "a"})`} />
              <Label pl={label} className="learning-automaton-label" rtl={machine.kind === "PDA"} />
            </g>
          );
        })}
        {machine.states.map(s => {
          const p = pos[s];
          const on = step.active.includes(s);
          const acc = machine.accept.includes(s);
          return (
            <g key={s} className={"learning-automaton-state" + (on ? " is-active" : "") + (acc ? " is-accept" : "")}>
              <circle cx={p.x} cy={p.y} r={R} className="learning-automaton-circle" />
              {acc && <circle cx={p.x} cy={p.y} r={R - 5} className="learning-automaton-ring" />}
              <text x={p.x} y={p.y + scene.font / 3} textAnchor="middle" className="learning-automaton-name" style={{ fontSize: scene.font + "px" }}>{s}</text>
              {scene.stateLabels[s] && <Label pl={scene.stateLabels[s]} className="learning-automaton-statelabel" rtl />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
