import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StudentToolDock from "../src/studentTools/StudentToolDock";
import { courseStudentTools } from "../src/studentTools/courseTools";
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";

// AUTO-A4 — the real-browser harness of «مختبر الآلات»: the 899271 book's own tool bar (its built-in tool set), on an RTL page with a
// little text behind it, exactly as the reader mounts it. Driven by scripts/check-automata-lab-browser.mjs; never shipped.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <article style={{ maxWidth: 760, margin: "0 auto", padding: 16, lineHeight: 1.8 }}>
      <h1>الأوتومات المنتهي الحتمي</h1>
      <p>صفحة من الكتاب: افتح «الأدوات» ثم «مختبر الآلات».</p>
    </article>
    <StudentToolDock studentTools={courseStudentTools("899271")} />
  </StrictMode>
);
