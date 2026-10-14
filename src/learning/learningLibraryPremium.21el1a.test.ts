/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEARNING_COURSES } from "./catalog";

const read = (p: string) => readFileSync(join(process.cwd(), "src", "learning", p), "utf8");
const page = read("LearningMaterialsPage.tsx");
const css = read("learning-library-premium.css");

describe("Phase 21E L1-A library invariants", () => {
  it("only derives available and upcoming shelves from the catalog", () => {
    expect(page).toContain('LEARNING_COURSES.filter(c => c.status === "available")');
    expect(page).toContain('LEARNING_COURSES.filter(c => c.status === "coming-soon")');
    expect(LEARNING_COURSES.every(c => c.id && c.title && c.subject)).toBe(true);
  });
  it("keeps the learning reader lazy and the library free of manifest access", () => {
    expect(page).toMatch(/lazy\(lazyWithRetry\(/);
    const library = page.slice(page.indexOf("const availableCourses ="), page.indexOf("/** One product entry"));
    expect(library).not.toMatch(/loadCourseManifest|fetch\(|createTrainingClient\(/);
  });
  it("preserves a single library heading and accessible course labels", () => {
    expect(page.match(/title="المواد التعليمية"/g)).toHaveLength(1);
    expect(page).toContain('aria-labelledby="eb-lm-title"');
    expect(page).toContain('aria-labelledby={headingId}');
  });
  it("uses only design tokens and logical layout properties", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(css).not.toMatch(/(?:margin|padding|border)-(?:left|right)\s*:|\b(?:left|right)\s*:/);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("min-block-size: 44px");
    expect(css).toContain(":focus-visible");
  });
});
