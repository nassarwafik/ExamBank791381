// Phase 21D-A.1 — real-Chromium certification page for the PRODUCTION physicsMotion@1 workspace and editor (never a mock): the four
// classroom experiments as a student sees them and the teacher editor with its live preview. Driven by
// scripts/check-physics-motion-browser-21da1.mjs; never shipped (only index.html is a production entry).
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import MotionWorkspace from "../src/physicsMotion/MotionWorkspace";
import MotionEditor from "../src/physicsMotion/MotionEditor";
import { MOTION_PRESETS } from "../src/physicsMotion/motionTemplates";
import { MOTION_KINDS, type MotionKind } from "../src/physics/motionCore";

function Sim({ kind }: { kind: MotionKind }) {
  const [actions, setActions] = useState<unknown[]>([]);
  const [config] = useState(() => MOTION_PRESETS[kind]().config);
  return (
    <section data-sim={kind} style={{ padding: 12, borderBottom: "1px solid #ddd" }}>
      <h2>{kind}</h2>
      <MotionWorkspace config={config} actions={actions} onChange={a => setActions(a)} label={kind} />
      <output data-testid="actions">{JSON.stringify(actions)}</output>
    </section>
  );
}
function Teacher() {
  const [s, setS] = useState(() => { const p = MOTION_PRESETS.projectile(); return { config: p.config as unknown, checks: p.checks as unknown[], scoring: "proportional" as unknown }; });
  return <section data-teacher style={{ padding: 12 }}><h2>teacher</h2><MotionEditor config={s.config} checks={s.checks} scoring={s.scoring} onChange={n => setS(o => ({ ...o, ...n }))} /></section>;
}
const only = new URLSearchParams(location.search).get("only");
createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    {MOTION_KINDS.filter(k => !only || only === k).map(k => <Sim key={k} kind={k} />)}
    {!only && <Teacher />}
  </Suspense>
);
