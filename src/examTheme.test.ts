import { describe, it, expect } from "vitest";
import {
  EXAM_THEMES,
  THEME_LABELS,
  normalizeExamTheme,
  clampFocusIndex,
  nextFocusIndex,
  previousFocusIndex,
  focusProgressPercent
} from "./examTheme";

describe("normalizeExamTheme - legacy exams and invalid values always fall back to default", () => {
  it("returns default for undefined", () => {
    expect(normalizeExamTheme(undefined)).toBe("default");
  });

  it("returns default for null", () => {
    expect(normalizeExamTheme(null)).toBe("default");
  });

  it("returns default for an invalid/unrecognized string", () => {
    expect(normalizeExamTheme("not-a-real-theme")).toBe("default");
  });

  it("returns default for a non-string value", () => {
    expect(normalizeExamTheme(42)).toBe("default");
    expect(normalizeExamTheme({})).toBe("default");
  });

  it("passes through each of the six valid themes unchanged", () => {
    expect(normalizeExamTheme("cards")).toBe("cards");
    expect(normalizeExamTheme("classic")).toBe("classic");
    expect(normalizeExamTheme("focus")).toBe("focus");
    expect(normalizeExamTheme("compact")).toBe("compact");
    expect(normalizeExamTheme("modern")).toBe("modern");
    expect(normalizeExamTheme("default")).toBe("default");
  });
});

describe("EXAM_THEMES / THEME_LABELS - every theme has a real Arabic name and description", () => {
  it("has exactly six themes", () => {
    expect(EXAM_THEMES).toHaveLength(6);
  });

  it("has a non-empty name and description for every theme", () => {
    for (const theme of EXAM_THEMES) {
      expect(THEME_LABELS[theme].name.trim().length).toBeGreaterThan(0);
      expect(THEME_LABELS[theme].description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("focus navigation helpers - never wrap around or overflow the question list", () => {
  it("clamps an index below zero up to zero", () => {
    expect(clampFocusIndex(-5, 10)).toBe(0);
  });

  it("clamps an index past the last question down to the last question", () => {
    expect(clampFocusIndex(99, 10)).toBe(9);
  });

  it("returns 0 for a total of zero questions instead of a negative/NaN index", () => {
    expect(clampFocusIndex(3, 0)).toBe(0);
  });

  it("nextFocusIndex stops at the last question - does not wrap to the first", () => {
    expect(nextFocusIndex(9, 10)).toBe(9);
    expect(nextFocusIndex(3, 10)).toBe(4);
  });

  it("previousFocusIndex stops at the first question - does not wrap to the last", () => {
    expect(previousFocusIndex(0, 10)).toBe(0);
    expect(previousFocusIndex(3, 10)).toBe(2);
  });
});

describe("focusProgressPercent - position-based progress, not completion-based", () => {
  it("computes the percentage of the current position out of the total", () => {
    expect(focusProgressPercent(0, 4)).toBe(25);
    expect(focusProgressPercent(3, 4)).toBe(100);
    expect(focusProgressPercent(1, 3)).toBe(67);
  });

  it("returns 0 for zero total questions instead of dividing by zero", () => {
    expect(focusProgressPercent(0, 0)).toBe(0);
  });
});
