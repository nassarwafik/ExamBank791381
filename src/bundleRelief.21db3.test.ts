import { describe, expect, it } from "vitest";
import ExamPreview from "./ExamPreview";
import { ExamPreview as BuilderExamPreview } from "./StructuredExamBuilder";

// Phase 21D-B.3 — initial-bundle relief before the meshPartSelection@1 wiring: the flat-exam theme preview is a user-opened dialog
// (the "معاينة هذا التنسيق" button), so App.tsx loads it on demand through the one-shot deployment recovery (inventoried in
// deploymentRecovery.inventory.11d.test.ts) instead of pulling the whole student rendering closure into the initial graph. Behaviour
// is unchanged: the same component renders in the same portal, inside a Suspense boundary.
const RAW = import.meta.glob(["./App.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("21D-B.3 bundle relief — the theme preview dialog is a lazy edge of App", () => {
  it("App.tsx never imports ExamPreview statically", () => {
    const app = RAW["./App.tsx"];
    expect(app).not.toMatch(/import\s+ExamPreview\b|import\s*\{[^}]*\bExamPreview\b[^}]*\}\s*from\s*"\.\/(ExamPreview|StructuredExamBuilder)"/);
    expect(app).toMatch(/const ExamPreview = lazy\(lazyWithRetry\(\(\) => import\("\.\/ExamPreview"\), "teacher-theme-preview"\)\);/);
  });
  it("the preview still opens in its body portal, wrapped in a Suspense boundary", () => {
    const app = RAW["./App.tsx"];
    expect(app).toMatch(/themePreviewOpen && previewMode === "edit" && exam &&\s*createPortal\(\s*<Suspense fallback=\{null\}><ExamPreview exam=\{exam\} onClose=\{\(\) => setThemePreviewOpen\(false\)\} \/><\/Suspense>,\s*document\.body\s*\)/);
  });
  it("the builder keeps re-exporting the same preview component", () => {
    expect(typeof ExamPreview).toBe("function");
    expect(BuilderExamPreview).toBe(ExamPreview);
  });
});
