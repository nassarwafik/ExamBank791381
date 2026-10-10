// Phase 21D-A.4 — real-Chromium check page for the PRODUCTION multi-surface 3D plot viewer and editor (never a mock): the acceptance
// exam's plots through the real student rich-content renderer (as the exam delivers them), the unchanged V1 surface in the same renderer,
// and the teacher editor with its live preview. Driven by scripts/check-surface-plots-browser-21da4.mjs; never shipped (only index.html
// is a production entry).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import RichContentRenderer from "../src/richContent/RichContentRenderer";
import SurfacePlot3DEditor from "../src/functionSurfaces/SurfacePlot3DEditor";
import { surfacePlotPreset } from "../src/functionSurfaces/surfacePlotPresets";
import type { SurfacePlotSpecV2 } from "../src/functionSurfaces/surfacePlotSpec";
import exam from "../docs/fixtures/function-surfaces-21da4/ExamBank_21DA4_Advanced_3D_Plots_Acceptance.json";
import type { RichContentV1 } from "../src/richContent/richContentModel";

const only = new URLSearchParams(location.search).get("only");
export function Harness() {
  const [teacher, setTeacher] = useState<SurfacePlotSpecV2>(() => surfacePlotPreset("saddlePlane", "plot-editor"));
  const sections = (exam as { sections: { id: string; questions: { richContent: RichContentV1 }[] }[] }).sections.filter(s => !only || s.id === only);
  return (
    <main style={{ padding: "12px", maxWidth: "1100px", marginInline: "auto", boxSizing: "border-box" }}>
      <h1>اختبار الرسوم ثلاثية الأبعاد متعددة الأسطح 21D-A.4</h1>
      {sections.map(s => <section key={s.id} data-testid={s.id}><RichContentRenderer content={s.questions[0].richContent} /></section>)}
      {!only && <section data-testid="editor"><h2>واجهة التأليف</h2><SurfacePlot3DEditor surface={teacher} onChange={setTeacher} /></section>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
