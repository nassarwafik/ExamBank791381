// Phase 21E — Premium SmartSim / 3D viewer: real-Chromium certification page (never shipped; only index.html is a production entry).
// Mounts the PRODUCTION viewer in the three ways a student meets it, with the app's design tokens and fonts:
//   • the real StudentQuestionCard with a scene3DSelection question (object selection on the heart preset) — the answer it emits is
//     printed in <output data-testid="exam-answer"> so the driver can prove presentation changes never reach an answer;
//   • a cube with FACE selection (multiple, max 2);
//   • the SmartSim sandbox host's error state (no valid package reference; the runtime itself needs the server).
// Driven by scripts/check-viewer-premium-21e.mjs.
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Interactive3DView from "../src/interactive3d/Interactive3DView";
import StudentQuestionCard from "../src/StudentQuestionCard";
import SimulationSandboxHost from "../src/smartsim/SimulationSandboxHost";
import { scene3DPreset } from "../src/interactive3d/scenePresets";
import type { Interactive3DSceneSpecV1 } from "../src/interactive3d/sceneSpec";

type CardProps = Parameters<typeof StudentQuestionCard>[0];
const examQuestion = {
  id: "q3d", examQuestionId: "q3d", type: "scene3DSelection", presentationType: "scene3DSelection", questionTypeVersion: 1,
  text: "اختر البطين الأيسر في نموذج القلب.", marks: 2,
  scene3DSelection: { v: 1, scene: scene3DPreset("heart", "exam-heart"), target: "object", mode: "single", maxSelections: 1, label: "اختر جزءًا من القلب" }
} as unknown as CardProps["q"];

function Exam() {
  const [answer, setAnswer] = useState<CardProps["answer"]>(undefined);
  return <section data-testid="exam" className="vp-block" aria-label="سؤال امتحان ثلاثي الأبعاد">
    <StudentQuestionCard q={examQuestion} index={0} id="q3d" answer={answer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setAnswer} disabled={false} />
    <output data-testid="exam-answer">{JSON.stringify(answer ?? null)}</output>
  </section>;
}

const cube = scene3DPreset("cube", "faces-cube") as Interactive3DSceneSpecV1;
function Faces() {
  const [value, setValue] = useState<string[]>([]);
  return <section data-testid="faces" className="vp-block">
    <Interactive3DView spec={cube} selection={{ kind: "face", mode: "multiple", max: 2, value, label: "اختر وجهين متقابلين من المكعب", onChange: setValue }} />
    <output data-testid="faces-answer">{JSON.stringify(value)}</output>
  </section>;
}

function App() {
  return <main style={{ maxWidth: 960, margin: "0 auto", padding: "16px", display: "grid", gap: 24 }}>
    <Exam />
    <Faces />
    <section data-testid="smartsim" className="vp-block"><SimulationSandboxHost reference={undefined} mode="student" onStateChange={() => {}} /></section>
  </main>;
}
export default App;
createRoot(document.getElementById("root")!).render(<App />);
