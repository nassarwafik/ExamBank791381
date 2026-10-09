// Phase 21B — isolated production-Vite browser harness using the real Surface3D viewer/editor.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Surface3DView from "../src/functionSurfaces/Surface3DView";
import Surface3DEditor from "../src/functionSurfaces/Surface3DEditor";
import { surfaceTemplate } from "../src/functionSurfaces/surfaceEditing";
import type { SurfaceSpecV1 } from "../src/functionSurfaces/surfaceSpec";

function Harness() {
  const [teacher, setTeacher] = useState<SurfaceSpecV1>(() => surfaceTemplate("paraboloid", "surface-editor"));
  return (
    <main style={{ padding: "12px", maxWidth: "1200px", marginInline: "auto", boxSizing: "border-box" }}>
      <h1>اختبار محرك الأسطح ثلاثية الأبعاد 21B</h1>
      <section data-testid="surface-paraboloid"><Surface3DView spec={surfaceTemplate("paraboloid", "surface-p")} /></section>
      <section data-testid="surface-saddle"><Surface3DView spec={surfaceTemplate("saddle", "surface-s")} /></section>
      <section data-testid="surface-wave"><Surface3DView spec={surfaceTemplate("wave", "surface-w")} /></section>
      <section data-testid="surface-dome"><Surface3DView spec={surfaceTemplate("dome", "surface-d")} /></section>
      <section data-testid="surface-editor"><h2>واجهة التأليف</h2><Surface3DEditor surface={teacher} onChange={setTeacher} name="سطح المعلم" /></section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
