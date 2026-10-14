// BUG-001 / BUG-002 — real-browser harness of the Structured Exam Builder exactly as App.tsx mounts it (certification only; never
// shipped): the PRODUCTION builder inside the PRODUCTION `.structured-builder-overlay` shell, with the production stylesheets in the
// production order (design tokens → index → App → platform → page-parts → shell; the builder chunk loads structured-builder.css
// itself; the shells load ui/ui.css). The exam is a real import (parseStructuredExamJson) opened through the real history
// authority as "unsaved" — the exact state a teacher is in right after «فتح في باني الامتحان». The App-owned services are fakes
// that resolve to empty data so every toolbar action is offered; no token, no network. `window.__host` exposes the exit counter,
// the owner's Save Draft and the shared save vocabulary (SAVE_LABELS, the one authority the builder's save buttons read), so the
// script names buttons the way the builder does.
import { StrictMode, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/index.css";
import "../src/App.css";
import "../src/platform.css";
// App loads page-parts.css between platform.css and shell.css: it holds the shared ActionMenu panel (its surface and its layer
// above the builder overlay) and dialog parts. Since 21E.2 the builder's tools live in toolbar menus, so the harness loads it too.
import "../src/page-parts.css";
import "../src/shell.css";
import "../src/ui/ui.css";
import StructuredExamBuilder from "../src/StructuredExamBuilder";
import { useStructuredExamHistory } from "../src/useStructuredExamHistory";
import { examSaveState } from "../src/examHistory";
import { toSavedStructuredExam } from "../src/examBuilderState";
import { parseStructuredExamJson } from "../src/structuredExamImport";
import { SAVE_LABELS } from "../src/teacher/saveLabels";
import type { BankPickerService, GovernanceService } from "../src/StructuredExamBuilder";
import type { AssessmentPresetService } from "../src/presets/assessmentPresetClient";
import type { AiAuthorService } from "../src/aiAuthoring/aiAuthorService";
import type { StructuredExam } from "../src/examTypes";

const IMPORTED_JSON = JSON.stringify({
  title: "امتحان مستورد — شبكات الحاسوب",
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [
    { id: "q1", type: "multipleChoice", text: "ما هو عنوان الشبكة لـ 192.168.10.37/27؟", marks: 2, options: ["192.168.10.0", "192.168.10.32", "192.168.10.64"], answer: { correctOptionIndex: 1 } },
    { id: "q2", type: "shortAnswer", text: "اذكر طبقات نموذج OSI السبع بالترتيب.", marks: 3, answer: { text: "Physical, Data Link, Network, Transport, Session, Presentation, Application" } },
  ] }]
});

const imported = parseStructuredExamJson(IMPORTED_JSON, "imported-exam.json");
if (!imported.canOpen || !imported.exam) throw new Error("harness: the imported exam did not parse: " + JSON.stringify(imported.parseErrors));
const IMPORTED: StructuredExam = imported.exam;

const governance: GovernanceService = {
  status: async () => ({ governed: false, manifest: null, capabilities: ["author", "review", "approve", "publish"], capabilitySource: "default-single-teacher" }),
  enable: async () => ({ governed: false, manifest: null, capabilities: [], capabilitySource: "default-single-teacher" }),
  createRevision: async () => ({ governed: false, manifest: null, capabilities: [], capabilitySource: "default-single-teacher" }),
  transition: async () => ({ governed: false, manifest: null, capabilities: [], capabilitySource: "default-single-teacher" }),
  listRevisions: async () => ({ items: [], nextCursor: null }),
  loadRevision: async () => { throw new Error("harness: no revisions"); },
  listEvents: async () => ({ items: [], nextCursor: null })
};
const presets: AssessmentPresetService = {
  list: async () => ({ items: [], nextCursor: null, total: 0 }),
  load: async () => { throw new Error("harness: no presets"); },
  create: async () => { throw new Error("harness: read-only"); },
  update: async () => { throw new Error("harness: read-only"); },
  remove: async () => { throw new Error("harness: read-only"); }
};
const bankPicker: BankPickerService = { list: async () => [], select: async () => [] };
const aiAuthor: AiAuthorService = {
  author: async () => { throw new Error("harness: offline"); },
  authorScenario: async () => { throw new Error("harness: offline"); },
  composeExam: async () => { throw new Error("harness: offline"); }
};

declare global { interface Window { __host: { exits: number; saveDraft: () => Promise<void>; saveState: () => string; title: () => string; labels: typeof SAVE_LABELS } } }
window.__host = { exits: 0, saveDraft: async () => {}, saveState: () => "", title: () => "", labels: SAVE_LABELS };

// The App.tsx state owner, verbatim in shape (see App.tsx openImportedStructuredExam + saveStructuredExam): history hook opened
// "unsaved" for an import, functional updates, snapshot → persist → commitSaved on Save Draft.
function Host() {
  const hist = useStructuredExamHistory();
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(IMPORTED, "unsaved"); } }, [hist]);
  useEffect(() => {
    window.__host.saveDraft = async () => {
      const snapshot = hist.present!;
      setSaving(true);
      await new Promise(r => setTimeout(r, 30));
      hist.commitSaved(snapshot, { ...toSavedStructuredExam(snapshot), status: "draft" });
      setSaving(false);
    };
    window.__host.saveState = () => examSaveState(hist.history, saving);
    window.__host.title = () => hist.present?.title ?? "";
  }, [hist, saving]);
  if (!hist.present) return null;
  return (
    <>
      <main className="eb-shell-content" data-testid="teacher-workspace"><h1>مساحة عمل المعلم</h1><p>الامتحانات المحفوظة تظهر هنا بعد الرجوع من المحرر.</p></main>
      {open && (
        // App.tsx's overlay markup, attribute for attribute (21E.2: the overlay is the builder's aria-modal dialog surface, named by
        // the builder heading; the scripts check this tag against src/App.tsx, so the replica cannot drift from it again).
        <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
          <Suspense fallback={<div className="platform-loading">⏳ جارٍ تحميل مبنى الامتحان…</div>}>
            <StructuredExamBuilder
              exam={hist.present}
              onChange={hist.update}
              onSave={() => { void window.__host.saveDraft(); }}
              onExit={() => { window.__host.exits += 1; setOpen(false); }}
              saving={saving}
              onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
              saveState={examSaveState(hist.history, saving)}
              recoveryScope="harness-teacher"
              onRecover={hist.recover}
              backupStorage={null}
              bankPicker={bankPicker}
              governance={governance}
              presets={presets}
              onOpenExamFromPreset={next => { hist.open(next, "unsaved"); }}
              aiAuthor={aiAuthor}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Host /></StrictMode>);
