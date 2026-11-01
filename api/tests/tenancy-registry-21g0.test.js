// Phase 21G.0 — the tenancy registry: EVERY teacher-authenticated endpoint (a module that calls requireBuilderAuth) is classified
// exactly once, and an endpoint that holds teacher data carries the evidence of its tenancy guard. A new endpoint added without a
// decision, or a guard removed from a scoped one, fails here — tenancy can never be forgotten silently.
//
//   classScoped   data bound to a class (students, assignments, submissions, messages, projects, reports …): the class decides
//   teacherOwned  content the teacher authors (saved exams, templates, presets, simulators, assets, bank questions, imports …)
//   sharedByDesign platform content every teacher reads (the official library, the governance workflow, course content)
//   operator      platform-wide maintenance tools that rewrite shared state. Tadris+ P1-B: they call requireOperator (owner-only
//                 once an owner exists, owner decision D9) and never requireBuilderAuth directly
//   noData        stateless helpers (AI drafting, parsing, previews): nothing stored is read or returned
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS = join(__dirname, "..", "src", "functions");
const TENANT = /tenantOf\(/;
const REGISTRY = {
  classScoped: {
    "manage-classrooms.js": TENANT, "manage-students.js": TENANT, "manage-assignments.js": TENANT, "assignment-results.js": TENANT,
    "assignment-review.js": TENANT, "assignment-item-analysis.js": TENANT, "coding-grading.js": TENANT, "coding-grading-recovery.js": TENANT,
    "reports.js": TENANT, "teacher-today.js": TENANT, "teacher-achievement-feed.js": TENANT, "messages.js": TENANT, "project-tracker.js": TENANT,
    "game-live-session.js": TENANT, "teacher-analytics.js": TENANT, "teacher-analytics-ai.js": TENANT,
    "student-profile-photo.js": TENANT, "assignment-progress.js": TENANT,
    "learning-class-progress.js": /canAccessDocument\(classroom, tenantOf\(auth\.user\)\)/
  },
  teacherOwned: {
    "manage-saved-exams.js": /examOwnerOf\(/, "save-exam-artifact.js": /examOwnerOf\([\s\S]*tenantOf\(|tenantOf\([\s\S]*examOwnerOf\(/,
    "manage-templates.js": TENANT, "assessment-presets.js": /ownerId = String\(auth\.user\.sub\)/, "simulators.js": /ownerHashOf\(auth\.user\.sub\)/,
    "mesh-assets.js": /ownerHashOf\(auth\.user\.sub\)/, "teacher-profile.js": /profileDocName\(sub\)/, "game-live-challenge.js": /teacherId = String\(sess\.user/,
    "audit-history.js": TENANT, "bank-questions.js": TENANT, "bank-question-select.js": TENANT, "question-bank-action.js": TENANT,
    "generate-exam.js": TENANT, "bank-summary.js": TENANT, "bank-import-action.js": TENANT, "exam-question-availability.js": TENANT,
    "import-upload.js": TENANT, "import-fetch-url.js": TENANT, "import-analyze.js": TENANT
  },
  sharedByDesign: ["exam-library.js", "exam-governance.js", "governance-inbox.js", "learning-content.js", "learning-materials-catalog.js", "learning-study.js", "learning-training.js",
    // 791381s Phase 8C-1 — the learning book's advanced exam items: platform course content (a private store under api/data),
    // read-only for teachers (preview), practice for students; nothing stored per teacher is read or written.
    "learning-exam-item.js"],
  operator: ["assignment-index-control.js", "build-bank-2025.js", "classify-bank-batch.js", "classify-question-preview.js", "import-html-exam.js", "inspect-html.js", "storage-status.js"],
  noData: ["ai-exam-composer.js", "ai-question-author.js", "ai-scenario-author.js", "analyze-global-exam-instruction.js", "exam-quality-fix.js",
    "game-number-conversion-preview.js", "generate-question-image.js", "interpret-exam-request.js", "question-ai-action.js",
    "structured-exam-ai-fix.js",
    // D3 — client error / CSP reports: a teacher or student session sends a content-free report that becomes one log line; nothing stored is read.
    "client-error-report.js"]
};
const classified = () => [...Object.keys(REGISTRY.classScoped), ...Object.keys(REGISTRY.teacherOwned), ...REGISTRY.sharedByDesign, ...REGISTRY.operator, ...REGISTRY.noData];
const source = file => readFileSync(join(FUNCTIONS, file), "utf8");

describe("21G.0 tenancy registry", () => {
  it("every teacher-authenticated endpoint is classified exactly once", () => {
    const teacherEndpoints = readdirSync(FUNCTIONS).filter(f => f.endsWith(".js") && /requireBuilderAuth|requireOperator|requireTeacherSession/.test(source(f))).sort();
    const all = classified();
    expect(all.length).toBe(new Set(all).size);
    expect([...all].sort()).toEqual(teacherEndpoints);
  });
  it("every class-scoped and teacher-owned endpoint carries its tenancy guard", () => {
    for (const [file, evidence] of [...Object.entries(REGISTRY.classScoped), ...Object.entries(REGISTRY.teacherOwned)]) {
      expect({ file, guarded: evidence.test(source(file)) }).toEqual({ file, guarded: true });
    }
  });
  it("P1-B: every operator tool is gated by requireOperator, never by requireBuilderAuth directly; no other endpoint uses the gate", () => {
    for (const file of REGISTRY.operator) {
      const src = source(file);
      expect({ file, gated: /await (requireOperator|authFn)\(request/.test(src) && /require\("\.\.\/lib\/identity\/operator-gate"\)/.test(src) }).toEqual({ file, gated: true });
      expect({ file, teacherAuth: /requireBuilderAuth/.test(src) }).toEqual({ file, teacherAuth: false });
    }
    const users = readdirSync(FUNCTIONS).filter(f => f.endsWith(".js") && /requireOperator/.test(source(f))).sort();
    expect(users).toEqual([...REGISTRY.operator].sort());
  });
  it("P2-A1: the seam is the ONE teacher-session authority and delegates to requireBuilderAuth (honouring the deps injection)", () => {
    const seam = readFileSync(join(__dirname, "..", "src", "lib", "teacher-session.js"), "utf8");
    expect(seam).toMatch(/require\("\.\/builder-auth"\)/);
    expect(seam).toMatch(/\(deps\.requireBuilderAuth \|\| requireBuilderAuth\)\(request\)/);
  });
  it("P2-A1: every teacher endpoint awaits requireTeacherSession (operator tools: requireOperator); none calls requireBuilderAuth itself", () => {
    const code = file => source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const file of classified()) {
      const src = code(file);
      expect({ file, directCall: /requireBuilderAuth\s*\)?\s*\(/.test(src) }).toEqual({ file, directCall: false });
      if (REGISTRY.operator.includes(file)) continue;
      expect({ file, awaitsSeam: /await (requireTeacherSession|authFn)\(request/.test(src) && /require\("\.\.\/lib\/teacher-session"\)/.test(src) }).toEqual({ file, awaitsSeam: true });
    }
  });
  it("stateless endpoints read no stored teacher data", () => {
    const storage = /listJson\(|downloadJson[A-Za-z]*\(|mutateJson[A-Za-z]*\(|listBlobsFlat\(/;
    for (const file of REGISTRY.noData) expect({ file, reads: storage.test(source(file)) }).toEqual({ file, reads: false });
  });
});
