// Phase 11D — deployment-recovery INVENTORY guard. Every user-facing code-split view below must stay wrapped in the
// one-shot stale-chunk recovery (`lazy(lazyWithRetry(() => import("<module>"), "<stable key>"))`), with its own stable,
// literal, unique key (a key is the sessionStorage marker `examBankChunkReload:<key>` — never user data). This is an
// explicit allowlist, not a blind scan of every "lazy": reverting one of these to a plain `lazy(() => import(...))`,
// changing its key, or reusing a key fails here by name.
import { describe, it, expect } from "vitest";

const RAW = import.meta.glob(["./App.tsx", "./teacher/TeacherIdentity.tsx", "./AssignmentReview.tsx", "./TeacherPlatform.tsx", "./StudentPortal.tsx", "./reports/ReportsCenter.tsx", "./learning/LearningMaterialsPage.tsx", "./learning/training/LearningReaderWithTraining.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const ALL = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** [file, component, module path, stable key] — the protected lazy views. */
const PROTECTED: [string, string, string, string][] = [
  // App.tsx — role gates and teacher / builder destinations
  ["./App.tsx", "StudentPortal", "./StudentPortal", "student-portal"],
  ["./App.tsx", "TeacherPlatform", "./TeacherPlatform", "teacher-platform"],
  ["./App.tsx", "ProjectTracker", "./projects/ProjectTracker", "teacher-project-tracker"],
  ["./App.tsx", "ProjectHub", "./projects/ProjectHub", "teacher-project-hub"],
  ["./App.tsx", "ReportsCenter", "./reports/ReportsCenter", "teacher-reports"],
  ["./App.tsx", "ExamBankPage", "./bank/ExamBankPage", "teacher-exam-bank"],
  ["./App.tsx", "LearningMaterialsPage", "./learning/LearningMaterialsPage", "teacher-learning-materials"],
  ["./App.tsx", "TeacherGamesPage", "./games/TeacherGamesPage", "teacher-games"],
  ["./App.tsx", "TeacherMessagesPage", "./messages/TeacherMessagesPage", "teacher-messages"],
  ["./App.tsx", "ReviewInboxPage", "./governance/ReviewInboxPage", "teacher-review-inbox"],
  ["./App.tsx", "StructuredExamBuilder", "./StructuredExamBuilder", "structured-exam-builder"],
  ["./App.tsx", "SmartStructuredExamImportWizard", "./SmartStructuredExamImportWizard", "smart-structured-import"],
  // Phase 19E bundle relief — the question import destination and the teacher profile dialog load on demand
  ["./App.tsx", "ImportQuestionsPanel", "./ImportQuestionsPanel", "teacher-import-questions"],
  ["./teacher/TeacherIdentity.tsx", "TeacherProfileDialog", "./TeacherProfileDialog", "teacher-profile-dialog"],
  // Phase 19E — the teacher rubric grading panel loads on demand inside the assignment review
  ["./AssignmentReview.tsx", "RubricGradingPanel", "./openResponse/RubricGradingPanel", "teacher-rubric-grading"],
  // Phase 20B — the trusted SmartSim review panel (and its plugin review chunk) loads on demand inside the assignment review
  ["./AssignmentReview.tsx", "SmartSimReviewView", "./trustedSim/SmartSimReviewView", "teacher-smartsim-review"],
  // Phase 20D — the composite review tree loads on demand inside the assignment review
  ["./AssignmentReview.tsx", "CompositeReviewView", "./composite/CompositeReviewView", "teacher-composite-review"],
  // Phase 21A.1 — the chart-selection review loads on demand inside the assignment review
  ["./AssignmentReview.tsx", "ChartSelectionReview", "./charts/ChartSelectionReview", "teacher-chart-review"],
  // nested views
  ["./TeacherPlatform.tsx", "TeacherDashboard", "./TeacherDashboard", "teacher-dashboard"],
  ["./reports/ReportsCenter.tsx", "ReportView", "./ReportViews", "teacher-report-views"],
  ["./StudentPortal.tsx", "StudentReader", "./student/StudentReader", "student-reader"],
  ["./learning/LearningMaterialsPage.tsx", "LearningReaderWithTraining", "./training/LearningReaderWithTraining", "learning-reader-with-training"],
  ["./learning/training/LearningReaderWithTraining.tsx", "LearningTrainingRunner", "./LearningTrainingRunner", "learning-training-runner"],
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

describe("deployment-recovery inventory (11D)", () => {
  it.each(PROTECTED)("%s: %s = lazy(lazyWithRetry(() => import(%j), %j))", (file, name, mod, key) => {
    const src = RAW[file];
    expect(src, file).toBeTruthy();
    const decl = new RegExp("const\\s+" + name + "\\s*=\\s*lazy\\(\\s*lazyWithRetry\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*\"" + esc(mod) + "\"\\s*\\)\\s*,\\s*\"" + esc(key) + "\"\\s*\\)\\s*\\)");
    expect(src, name + " must keep its one-shot deployment recovery").toMatch(decl);
  });

  it("no inventoried file declares a plain React.lazy(() => import(...)) any more", () => {
    for (const [file, src] of Object.entries(RAW)) expect(src, file).not.toMatch(/\blazy\(\s*\(\)\s*=>\s*import\(/);
  });

  it("recovery keys are stable literals and unique — in this table and across every lazyWithRetry call in src/", () => {
    const keys = PROTECTED.map(p => p[3]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9-]*$/);                         // no ids, no user data, no templates
    const literal = Object.entries(ALL).flatMap(([file, src]) => [...src.matchAll(/lazyWithRetry\(\s*\(\)\s*=>\s*import\([^)]*\)\s*,\s*"([^"]+)"\s*\)/g)].map(m => [file, m[1]] as const));
    const seen = new Map<string, string>();
    for (const [file, key] of literal) { expect(seen.has(key), `key "${key}" reused in ${file} and ${seen.get(key)}`).toBe(false); seen.set(key, file); }
    expect([...seen.keys()].sort()).toEqual([...keys].sort());                               // every literal key is inventoried here
    // the visual registry's keys live in their own namespace, so they can never collide with a view key
    for (const k of keys) expect(k.startsWith("learning-visual:")).toBe(false);
    expect(ALL["./learning/visuals/registry.ts"]).toMatch(/lazyWithRetry\(importer, "learning-visual:" \+ id\)/);
  });
});
