// Class gradebook GB10 — real-browser harness of «بناء المخطط بالذكاء الاصطناعي» (certification only; never shipped): the PRODUCTION
// gradebook panel, scheme builder and AI window with the production stylesheets in the App's order (main.tsx, then App.tsx), over a
// routed fetch fake that answers TEST data: an empty gradebook, two assignments, and a proposal with a column still to weigh, a mention
// not found and notes. No token, no network, no provider. Used to measure the window and the filled builder at phone and desktop widths
// (docs/enterprise-class-gradebook-gb.md §4.11). With `?edit` (GB10c, §4.12) the class already has a scheme, and the AI answers
// changes built from the draft the page sent, by its keys, as the server does.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/design-tokens-dark.css";
import "../src/fonts.css";
import "../src/index.css";
import "../src/App.css";
import "../src/platform.css";
import "../src/page-parts.css";
import "../src/shell.css";
import "../src/dashboard-pro.css";
import "../src/assignments-pro.css";
import "../src/ui/ui.css";
import ClassGradebookPanel from "../src/gradebook/ClassGradebookPanel";
import { TeacherAccessContext } from "../src/shell/teacherAccessContext";
import type { GbAiCurrent, GbAiProposal, GbGradebook } from "../src/gradebook/types";

const EDIT_MODE = new URLSearchParams(location.search).has("edit");
const BOOK: GbGradebook = { ok: true, classId: "c1", className: "العاشر أ", readOnly: false, students: [], etags: { scheme: EDIT_MODE ? "e1" : null, entries: null }, withheld: [], columns: [], rows: [], warnings: [],
  scheme: EDIT_MODE ? { revision: 1, updatedAt: "", categories: [
    { categoryId: "m", title: "علامة الشهري", weight: 40, items: [{ itemId: "i1", weight: 100, source: { kind: "assignment", assignmentId: "a1" } }] },
    { categoryId: "t", title: "علامة الفصل الأول", weight: 60, items: [{ itemId: "i2", weight: 100, source: { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 } }] }
  ] } : null };
const EDIT = (cur: GbAiCurrent) => {
  const [m, t] = cur.categories;
  return { ok: true, classId: "c1", edit: {
    ops: [
      { op: "addItem", categoryKey: m.key, source: { kind: "assignment", assignmentId: "a2" }, weight: null },
      { op: "addItem", categoryKey: m.key, source: { kind: "assignment", assignmentId: "a3" }, weight: null },
      { op: "equalizeItems", categoryKey: m.key },
      { op: "setCategoryWeight", categoryKey: m.key, weight: 30 },
      { op: "setCategoryWeight", categoryKey: t.key, weight: 70 }
    ],
    changes: ["إضافة «امتحان 1» إلى «علامة الشهري».", "إضافة «امتحان 2» إلى «علامة الشهري».", "توزيع أوزان «علامة الشهري» بالتساوي.",
      "نسبة «علامة الشهري» من العلامة النهائية: من 40% إلى 30%.", "نسبة «علامة الفصل الأول» من العلامة النهائية: من 60% إلى 70%."],
    unmatched: [{ category: "علامة الفصل الأول", title: "امتحان 4 النهائي", weight: null, code: "NOT_FOUND", reason: "لا يوجد في هذا الصف واجب أو امتحان أو مشروع يطابق هذا الوصف.", candidates: ["امتحان 2"] }],
    notes: [], assumptions: ["افترضت أن «الامتحانات» هي امتحان 1 وامتحان 2."]
  } };
};
const SOURCES = { ok: true, classId: "c1", withheld: [], projects: [], assignments: [
  { assignmentId: "a1", title: "الوظيفة 1 — الأنظمة العددية والتحويل بينها", status: "published", totalMarks: 10, publishedAt: "2026-09-10" },
  { assignmentId: "a2", title: "امتحان 1", status: "published", totalMarks: 20, publishedAt: "2026-10-01" },
  { assignmentId: "a3", title: "امتحان 2", status: "published", totalMarks: 20, publishedAt: "2026-10-20" }
] };
const PROPOSAL: GbAiProposal = {
  categories: [
    { title: "علامة الشهري", weight: 20, items: [
      { weight: 10, source: { kind: "assignment", assignmentId: "a1" }, title: "الوظيفة 1 — الأنظمة العددية والتحويل بينها" },
      { weight: 45, source: { kind: "assignment", assignmentId: "a2" }, title: "امتحان 1" },
      { weight: 45, source: { kind: "assignment", assignmentId: "a3" }, title: "امتحان 2" }
    ] },
    { title: "علامة الفصل الأول", weight: 80, items: [{ weight: null, source: { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 }, title: "الحضور والمشاركة" }] }
  ],
  unmatched: [{ category: "علامة الفصل الأول", title: "امتحان 4 النهائي", weight: 80, code: "NOT_FOUND", reason: "لا يوجد في هذا الصف واجب أو امتحان أو مشروع يطابق هذا الوصف.", candidates: ["امتحان 2"] }],
  notes: ["وُزّعت أوزان «علامة الشهري» بالتساوي.", "لم يبقَ من 100 ما يُوزَّع على بعض عناصر «علامة الفصل الأول»؛ اكتب أوزانها."],
  assumptions: ["افترضت أن «الامتحانات» في الشهري هي امتحان 1 وامتحان 2."],
  built: 4
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  await new Promise(r => setTimeout(r, 50));
  if (url.includes("/api/gradebook-scheme-ai")) {
    const body = JSON.parse(String(init?.body || "{}"));
    return json(body.mode === "edit" ? EDIT(body.current) : { ok: true, classId: "c1", proposal: PROPOSAL });
  }
  if (url.includes("resource=sources")) return json(SOURCES);
  return json(BOOK);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TeacherAccessContext.Provider value={null}>
      <main style={{ padding: 16 }}>
        <ClassGradebookPanel token="harness" classroom={{ classId: "c1", name: "العاشر أ" }} classActive />
      </main>
    </TeacherAccessContext.Provider>
  </StrictMode>
);
