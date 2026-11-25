import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AutomatonDesignActivity from "../src/learning/activities/AutomatonDesignActivity";
import CourseToolDock from "../src/studentTools/CourseToolDock";
import type { SimulationBlock } from "../src/learning/content/types";
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";
import "../src/learning/activities/activities.css";

// AUTO-A7 — the real-browser harness of «صمّم الآلة» with the lab: one of the book's design exercises (a complete DFA, at most 3 states)
// beside the 899271 book's own tool bar, mounted as the reader mounts it (CourseToolDock). No check seam: the server's judge is not in
// this page. Driven by scripts/check-automata-lab-browser.mjs; never shipped.
const block: SimulationBlock = {
  id: "design-1", type: "simulation", origin: "teacher-enrichment", simulationType: "automaton-design", version: 1, title: "صمّم الآلة",
  capabilities: { fullscreen: true, reset: true, interactive: true },
  config: { task: { intro: "صمّم أوتومات حتميًا كاملًا للكلمات التي تنتهي بـ 1.", machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true } },
};
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <article style={{ maxWidth: 760, margin: "0 auto", padding: 16, lineHeight: 1.8 }}>
      <h1>تمرين: صمّم الآلة</h1>
      <AutomatonDesignActivity block={block} courseId="899271" reducedMotion fullscreen={false} commands={{ reset: 0, replay: 0 }} emit={() => {}} />
    </article>
    <CourseToolDock courseId="899271" />
  </StrictMode>
);
