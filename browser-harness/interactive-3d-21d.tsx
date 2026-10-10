// Phase 21D — live demonstration + real-Chromium certification page for the PRODUCTION 3D renderer (never a mock viewer): every
// supported solid, the anatomy and chemistry presets, and an examination fixture that mounts the real student question card inside a
// parent that re-renders every second (as the exam timer does) and re-derives its scene objects on every render (as a parent that does
// not memoize would). Driven by scripts/check-interactive-3d-browser-21d.mjs; never shipped (only index.html is a production entry).
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Interactive3DView from "../src/interactive3d/Interactive3DView";
import StudentQuestionCard from "../src/StudentQuestionCard";
import { scene3DPreset } from "../src/interactive3d/scenePresets";
import type { Interactive3DSceneSpecV1, Scene3DObjectV1 } from "../src/interactive3d/sceneSpec";
import type { Answer, Question } from "../src/StudentQuestionCard";

const solid = (id: string, title: string, object: Omit<Scene3DObjectV1, "id" | "label" | "center"> & { label: string }): Interactive3DSceneSpecV1 => ({
  version: 1, id, title, description: "نموذج هندسي تفاعلي: " + title + ".", camera: { yaw: -0.65, pitch: 0.45, zoom: 1 },
  interaction: { rotate: true, zoom: true, select: false },
  objects: [{ id: "solid", center: { x: 0, y: 0, z: 0 }, ...object }], targets: []
});
const DEMO_SCENES: Record<string, () => Interactive3DSceneSpecV1> = {
  sphere: () => solid("demo-sphere", "كرة نصف قطرها 1.5", { label: "الكرة", kind: "sphere", size: { x: 3, y: 3, z: 3 }, palette: 3 }),
  cube: () => solid("demo-cube", "مكعب طول ضلعه 3", { label: "المكعب", kind: "box", size: { x: 3, y: 3, z: 3 }, palette: 2 }),
  cuboid: () => solid("demo-cuboid", "متوازي مستطيلات 4 × 2 × 2.5", { label: "متوازي المستطيلات", kind: "box", size: { x: 4, y: 2, z: 2.5 }, palette: 4 }),
  pyramid: () => scene3DPreset("pyramid", "demo-pyramid"),
  cylinder: () => solid("demo-cylinder", "أسطوانة نصف قطرها 1.2 وارتفاعها 3", { label: "الأسطوانة", kind: "cylinder", size: { x: 2.4, y: 3, z: 2.4 }, palette: 5 }),
  cone: () => solid("demo-cone", "مخروط نصف قطر قاعدته 1.4 وارتفاعه 3", { label: "المخروط", kind: "cone", size: { x: 2.8, y: 3, z: 2.8 }, palette: 7 }),
  ellipsoid: () => solid("demo-ellipsoid", "مجسم إهليلجي", { label: "المجسم الإهليلجي", kind: "ellipsoid", size: { x: 4, y: 2.2, z: 2.8 }, palette: 6 }),
  heart: () => scene3DPreset("heart", "demo-heart"),
  torso: () => scene3DPreset("torso", "demo-torso"),
  water: () => scene3DPreset("water", "demo-water")
};
const SCENES = Object.fromEntries(Object.entries(DEMO_SCENES).map(([k, make]) => [k, make()])) as Record<string, Interactive3DSceneSpecV1>;

const examQuestion = (): Question => ({
  id: "q3d", examQuestionId: "q3d", type: "scene3DSelection", presentationType: "scene3DSelection", questionTypeVersion: 1,
  text: "اختر البطين الأيسر في نموذج القلب.", marks: 2,
  scene3DSelection: { v: 1, scene: scene3DPreset("heart", "exam-heart"), target: "object", mode: "single", maxSelections: 1, label: "اختر جزءًا من القلب" }
} as unknown as Question);

function ExamFixture() {
  // the exam page re-renders every second (its timer); this fixture also RE-DERIVES the question object on every render, which a
  // viewer must survive without losing the student's camera
  const [tick, setTick] = useState(0);
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [note, setNote] = useState("");
  useEffect(() => { const id = window.setInterval(() => setTick(t => t + 1), 1000); return () => window.clearInterval(id); }, []);
  return <section data-testid="exam" aria-label="محاكاة صفحة الامتحان">
    <p data-testid="exam-tick">الوقت المنقضي: {tick} ث</p>
    <nav><button type="button" data-testid="exam-prev" onClick={() => setPage(0)}>السابق</button> <button type="button" data-testid="exam-next" onClick={() => setPage(1)}>التالي</button></nav>
    {page === 0
      ? <StudentQuestionCard q={examQuestion()} index={0} id="q3d" answer={answer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setAnswer} disabled={false} />
      : <div data-testid="exam-page-2"><label>ملاحظة الطالب <input data-testid="exam-note" value={note} onChange={e => setNote(e.target.value)} /></label></div>}
    <output data-testid="exam-answer">{JSON.stringify(answer ?? null)}</output>
  </section>;
}

/** Canonical views for visual certification: front, side, top and the authored perspective, with a fixed camera each. */
const VIEWS: Record<string, { yaw: number; pitch: number }> = { front: { yaw: 0, pitch: 0 }, side: { yaw: Math.PI / 2, pitch: 0 }, top: { yaw: 0, pitch: 1.35 }, perspective: { yaw: -0.65, pitch: 0.45 } };
function Views({ keys }: { keys: string[] }) {
  return <>{keys.flatMap(k => Object.entries(VIEWS).map(([v, cam]) => {
    const s = SCENES[k], spec = { ...s, id: s.id + "-" + v, camera: { ...s.camera, ...cam } };
    return <section key={k + v} data-testid={"view-" + k + "-" + v} style={{ display: "inline-block", width: "300px", verticalAlign: "top" }}><Interactive3DView spec={spec} /></section>;
  }))}</>;
}
function Remount() {
  const [n, setN] = useState(0);
  return <section data-testid="remount"><button type="button" data-testid="remount-button" onClick={() => setN(v => v + 1)}>إعادة تركيب النموذج ({n})</button>
    <Interactive3DView key={n} spec={n % 2 ? SCENES.heart : SCENES.sphere} /></section>;
}

function Harness() {
  const params = new URLSearchParams(location.search), only = params.get("only");
  const keys = only ? only.split(",") : Object.keys(SCENES);
  if (params.get("views")) return <main style={{ padding: "8px" }}><h1>المناظر المرجعية</h1><Views keys={keys.filter(k => SCENES[k])} /></main>;
  return <main style={{ padding: "12px", maxWidth: "1200px", marginInline: "auto", boxSizing: "border-box" }}>
    <h1>محرك النماذج ثلاثية الأبعاد — 21D</h1>
    {keys.filter(k => SCENES[k]).map(k => <section key={k} data-testid={"model-" + k}><Interactive3DView spec={SCENES[k]} /></section>)}
    {(!only || only.includes("exam")) && <ExamFixture />}
    {(!only || only.includes("remount")) && <Remount />}
  </main>;
}
export default Harness;
createRoot(document.getElementById("root")!).render(<Harness />);
