// Phase 21E.1 (slice 1) — real-browser harness (certification only; never shipped) for the SHARED confirmation dialogs inside the
// PRODUCTION Structured Exam Builder, mounted exactly as App.tsx mounts it (production overlay shell + production stylesheets),
// on an imported exam that has a COVER with text, a SECTION with instructions and a QUESTION with an image — the three builder
// surfaces whose confirmations were native window.confirm before 21E.1. The App-owned services are offline fakes; no token, no
// network. scripts/check-shared-confirm-browser-21e1.mjs drives it: it listens for native `dialog` events (the fail-first signal on
// the baseline) and certifies the shared dialog's stacking, RTL, labels, keyboard path, focus restore, and layout at 390 / 820 /
// 1280 px and at 150 % / 200 % zoom.
import { StrictMode, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/index.css";
import "../src/App.css";
import "../src/platform.css";
import "../src/shell.css";
import "../src/ui/ui.css";
import StructuredExamBuilder from "../src/StructuredExamBuilder";
import { useStructuredExamHistory } from "../src/useStructuredExamHistory";
import { examSaveState } from "../src/examHistory";
import { toSavedStructuredExam } from "../src/examBuilderState";
import { parseStructuredExamJson } from "../src/structuredExamImport";
import type { BankPickerService, GovernanceService } from "../src/StructuredExamBuilder";
import type { AssessmentPresetService } from "../src/presets/assessmentPresetClient";
import type { AiAuthorService } from "../src/aiAuthoring/aiAuthorService";
import type { StructuredExam } from "../src/examTypes";

const IMPORTED_JSON = JSON.stringify({
  title: "امتحان مستورد — شبكات الحاسوب",
  coverPage: { enabled: true, activityType: "exam", subtitle: "الحادي عشر 7", instructions: "اقرأ الأسئلة بعناية قبل الإجابة.", allowedMaterials: "آلة حاسبة" },
  sections: [{ id: "s1", title: "القسم الأول", instructions: "أجب عن جميع أسئلة هذا القسم.", gradingPolicy: "all", questions: [
    { id: "q1", type: "multipleChoice", text: "ما هو عنوان الشبكة لـ 192.168.10.37/27؟", marks: 2, options: ["192.168.10.0", "192.168.10.32", "192.168.10.64"], answer: { correctOptionIndex: 1 }, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", origin: "uploaded" }] } },
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

declare global { interface Window { __host: { exits: number; saveDraft: () => Promise<void>; saveState: () => string; title: () => string } } }
window.__host = { exits: 0, saveDraft: async () => {}, saveState: () => "", title: () => "" };

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
        <div className="structured-builder-overlay" dir="rtl">
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
