import { describe, it, expect } from "vitest";
import { COVER_TEMPLATES, findCoverTemplate, applyCoverTemplate } from "./coverTemplates";
import type { ExamCoverPage } from "./examCover";

// Roadmap #16 — cover templates are presets of the EXISTING cover model. Applying is explicit, preserves
// a safe banner, never introduces student identity or an unsafe banner, and stores no template id.
describe("R16 cover templates", () => {
  it("N: every built-in template applies to a valid normalized ExamCoverPage", () => {
    expect(COVER_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (const t of COVER_TEMPLATES) {
      const cover = applyCoverTemplate(undefined, t);
      expect(cover.enabled).toBe(true);
      expect(["exam", "training"]).toContain(cover.activityType);
      // normalized boolean display flags present
      for (const k of ["showStudentName", "showClassName", "showExamDate", "showDuration", "showTotalMarks", "showMarksDistribution"] as (keyof ExamCoverPage)[]) {
        expect(typeof cover[k]).toBe("boolean");
      }
    }
  });

  it("O: applying sets the template's cover fields (activityType/subtitle/instructions)", () => {
    const training = findCoverTemplate("training")!;
    const cover = applyCoverTemplate({ enabled: true, activityType: "exam", subtitle: "قديم" }, training);
    expect(cover.activityType).toBe("training");
    expect(cover.subtitle).toBe(training.preset.subtitle);
    expect(cover.instructions).toBe(training.preset.instructions);
  });

  it("P: an existing safe banner is preserved when applying a template", () => {
    const safe = "data:image/png;base64,AAAA";
    const cover = applyCoverTemplate({ enabled: true, banner: { dataUrl: safe } }, findCoverTemplate("formal-exam")!);
    expect(cover.banner?.dataUrl).toBe(safe);
  });

  it("Q: no template carries any student identity value", () => {
    for (const t of COVER_TEMPLATES) {
      const json = JSON.stringify(t.preset);
      expect(json).not.toMatch(/studentName|studentId|identityNumber|className"\s*:\s*"/);
    }
  });

  it("R: an unsafe/external banner cannot be introduced through a template application", () => {
    const cover = applyCoverTemplate({ enabled: true, banner: { dataUrl: "http://evil.example/x.png" } } as ExamCoverPage, findCoverTemplate("formal-exam")!);
    expect(cover.banner).toBeUndefined();
  });

  it("T: an applied cover stores no template id / template metadata", () => {
    const cover = applyCoverTemplate(undefined, findCoverTemplate("simple")!);
    const json = JSON.stringify(cover);
    expect(json).not.toMatch(/templateId|"template"/);
  });
});
