// Phase 21D-A.2 — real-Chromium check page for the PRODUCTION physicsLab@1 workspace and editor (never a mock): the four classroom
// experiments as a student sees them (through the real registry, as the exam does) and the teacher editor with its live preview. Driven by
// scripts/check-physics-lab-browser-21da2.mjs; never shipped (only index.html is a production entry).
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/trustedSimPlugins";
import LabWorkspace from "../src/physicsLab/LabWorkspace";
import LabEditor from "../src/physicsLab/LabEditor";
import { LAB_PRESETS } from "../src/physicsLab/labTemplates";
import { LAB_KINDS, type LabKind } from "../src/physics/labCore";

function Sim({ kind }: { kind: LabKind }) {
  const [actions, setActions] = useState<unknown[]>([]);
  const [config] = useState(() => LAB_PRESETS[kind]().config);
  return (
    <section data-sim={kind} style={{ padding: 12, borderBottom: "1px solid #ddd" }}>
      <h2>{kind}</h2>
      <LabWorkspace config={config} actions={actions} onChange={a => setActions(a)} label={kind} />
      <output data-testid="actions">{JSON.stringify(actions)}</output>
    </section>
  );
}
function Teacher() {
  const [s, setS] = useState(() => { const p = LAB_PRESETS.pendulum(); return { config: p.config as unknown, checks: p.checks as unknown[], scoring: "proportional" as unknown }; });
  return <section data-teacher style={{ padding: 12 }}><h2>teacher</h2><LabEditor config={s.config} checks={s.checks} scoring={s.scoring} onChange={n => setS(o => ({ ...o, ...n }))} /></section>;
}
const only = new URLSearchParams(location.search).get("only");
createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    {LAB_KINDS.filter(k => !only || only === k).map(k => <Sim key={k} kind={k} />)}
    {!only && <Teacher />}
  </Suspense>
);
