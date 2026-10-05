import { describe, expect, it } from "vitest";
import { createEmptyImportSession } from "./importSession";
import { createEmptyImportSession as reExported } from "./ImportQuestionsPanel";

// Phase 19E — initial-bundle relief (before any 19E feature wiring): the question-import destination and the teacher profile dialog
// are user-opened views, so they load on demand through the existing one-shot deployment recovery (lazyWithRetry, inventoried in
// deploymentRecovery.inventory.11d.test.ts). Behaviour is unchanged: the import session factory (lifted state that must survive
// navigation) moved verbatim to a tiny module App.tsx imports statically; the panel re-exports it.
const RAW = import.meta.glob(["./App.tsx", "./teacher/TeacherIdentity.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("19E bundle relief — lazy edges and preserved behaviour", () => {
  it("App.tsx never imports the import panel statically; it renders it inside a Suspense boundary", () => {
    const app = RAW["./App.tsx"];
    expect(app).not.toMatch(/import\s+ImportQuestionsPanel\b|import\s*\{[^}]*\}\s*from\s*"\.\/ImportQuestionsPanel"/);
    expect(app).toMatch(/import \{ createEmptyImportSession \} from "\.\/importSession";/);
    expect(app).toMatch(/<Suspense fallback=\{<p className="eb-muted" role="status">جارٍ تحميل الاستيراد\.\.\.<\/p>\}>\s*<ImportQuestionsPanel/);
  });
  it("TeacherIdentity never imports the profile dialog statically; it renders it inside a Suspense boundary", () => {
    const tid = RAW["./teacher/TeacherIdentity.tsx"];
    expect(tid).not.toMatch(/import\s+TeacherProfileDialog\b/);
    expect(tid).toMatch(/<Suspense fallback=\{null\}><TeacherProfileDialog /);
  });
  it("the import session factory is unchanged (same empty shape, topics carried) and still exported by the panel", () => {
    expect(reExported).toBe(createEmptyImportSession);
    expect(createEmptyImportSession()).toEqual({ files: [], pool: [], selectedIds: [], filterSourceFile: "", filterTopic: "", filterDifficulty: 0, filterType: "", minConfidence: 0, effectiveTopics: [], duplicates: {}, duplicateDecisions: {}, unassignedAssets: [] });
    const topics = [{ id: "t1", name: "شبكات" }] as never[];
    expect(createEmptyImportSession(topics).effectiveTopics).toBe(topics);
    expect(createEmptyImportSession()).not.toBe(createEmptyImportSession());
  });
});
