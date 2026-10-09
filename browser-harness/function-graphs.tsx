// Phase 21A.2 — isolated, production-Vite browser harness; NO preview or student answer-key exports.
// This fixture deliberately reuses the REAL editor/viewer and the SAME authored graph fixtures.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import GraphEditor from "../src/functionGraphs/GraphEditor";
import FunctionGraphView from "../src/functionGraphs/FunctionGraphView";
import { quadraticGraph, rationalGraph, sineGraph, tangentGraph, areaGraph, circleGraph } from "../src/functionGraphs/testing/graphFixtures";
import type { FunctionGraphSpecV1 } from "../src/functionGraphs/functionGraphSpec";
function Harness() {
  const [chosen, setChosen] = useState<string[]>([]);
  const [teacher, setTeacher] = useState<FunctionGraphSpecV1>(() => quadraticGraph());
  return (
    <main style={{ padding: "12px", maxWidth: "1200px", marginInline: "auto", boxSizing: "border-box" }}>
      <h1>اختبار محرك الدوال 21A.2</h1>
      <section data-testid="graph-question" aria-label="سؤال نقاط الرسم">
        <FunctionGraphView spec={quadraticGraph()} selection={{ kind: "point", mode: "multiple", max: 2, label: "اختر جذري الدالة", value: chosen, onChange: setChosen }} />
        <output data-testid="graph-answer">{JSON.stringify(chosen)}</output>
      </section>
      <section data-testid="graph-sine"><FunctionGraphView spec={sineGraph()} /></section>
      <section data-testid="graph-rational"><FunctionGraphView spec={rationalGraph()} /></section>
      <section data-testid="graph-tangent"><FunctionGraphView spec={tangentGraph()} /></section>
      <section data-testid="graph-area"><FunctionGraphView spec={areaGraph()} /></section>
      <section data-testid="graph-parametric"><FunctionGraphView spec={circleGraph()} /></section>
      <section data-testid="graph-editor"><h2>واجهة التأليف</h2><GraphEditor graph={teacher} onChange={setTeacher} name="دالة المدرسة" preview={false} /></section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
