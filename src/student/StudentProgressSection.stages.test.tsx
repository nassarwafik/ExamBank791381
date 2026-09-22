// @vitest-environment happy-dom
// The 25-stage Strength presentation across EVERY stage and every threshold pair — rendered from server-shaped
// payloads (the component never computes a stage): the right image / title / group per stage, «المرحلة X من 25»,
// «X / 2000», «Y / 80», the percentage, the ring's aria values, the next-stage icon (never at stage 25), the
// completion wording at 2000, the raw-total note above 2000, and RTL / long Arabic titles wrapping safely.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import StudentProgressSection from "./StudentProgressSection";
import { STAGE_VISUALS, stageVisual } from "../studentStageVisuals";
import type { StudentStrength } from "./types";

afterEach(cleanup);
const stats = { assigned: 3, completed: 3, average: 80, pendingReview: 0, finalized: 3, inProgress: 0, averageFinalized: 80 };
/** A SERVER-shaped payload for a raw total (mirrors the API formula only to build mocks; the component reads the fields verbatim). */
function serverStrength(raw: number): StudentStrength {
  const stagePoints = Math.min(raw, 2000), max = stagePoints >= 1920, stageNumber = max ? 25 : Math.floor(stagePoints / 80) + 1, stageFloor = (stageNumber - 1) * 80, within = Math.min(80, stagePoints - stageFloor);
  return { rawTotalPoints: raw, totalPoints: raw, examPoints: raw, practicePoints: 0, studyPoints: 0, projectPoints: 0, stagePoints, stageMaxPoints: 2000, stageNumber, stageCount: 25, stageBlockSize: 80, stageFloor, withinStagePoints: within, stagePercent: Math.round(within * 100 / 80), nextStageNumber: max ? null : stageNumber + 1, nextStageRemaining: max ? 0 : 80 - within, pointsToMaximum: 2000 - stagePoints, isMaximumStage: max, pathComplete: stagePoints >= 2000, legacyRank: null, projects: [] };
}
const draw = (raw: number) => { render(<StudentProgressSection stats={stats} medals={[]} strength={serverStrength(raw)} recognition={null} averageFinalized={80} />); return within(screen.getByRole("region", { name: /تقدّمي/ })); };

describe("StudentProgressSection — every stage of the path", () => {
  it("renders each of the 25 stages with its own image, title, group and «المرحلة n من 25» (at the stage's first point: 0 / 80, 0%)", () => {
    for (const v of STAGE_VISUALS) {
      const region = draw((v.stageNumber - 1) * 80);
      expect(region.getByText(v.title).className, v.title).toContain("eb-sp-stage-title");
      expect(region.getByText("المرحلة " + v.stageNumber + " من 25"), v.title).toBeTruthy();
      expect(region.getByText(v.group.label), v.title).toBeTruthy();
      expect((region.getByRole("img", { name: v.alt }) as HTMLImageElement).getAttribute("src"), v.title).toBe(v.image);
      expect(region.getByText("0 / 80"), v.title).toBeTruthy(); expect(region.getByText("0%"), v.title).toBeTruthy();
      expect(region.getByText(/نقاط القوة:/).textContent, v.title).toBe("نقاط القوة: " + (v.stageNumber - 1) * 80 + " / 2000");
      const next = document.querySelector(".eb-sp-rank-next-art") as HTMLImageElement | null;
      if (v.stageNumber < 25) { expect(next?.getAttribute("src"), v.title).toBe(stageVisual(v.stageNumber + 1).image); expect(region.getByText("بقي 80 نقطة قوة للوصول إلى المرحلة " + (v.stageNumber + 1) + " — " + stageVisual(v.stageNumber + 1).title), v.title).toBeTruthy(); }
      else { expect(next, v.title).toBeNull(); expect(region.getByText("بقي 80 نقطة قوة لإكمال مسار القوة"), v.title).toBeTruthy(); }
      cleanup();
    }
  });
  it("every threshold pair: n × 80 − 1 stays on stage n (79 / 80, 99%), n × 80 opens stage n + 1 (0 / 80, 0%) — 79/80 … 1919/1920", () => {
    for (let n = 1; n <= 24; n++) {
      let region = draw(n * 80 - 1);
      expect(region.getByText("المرحلة " + n + " من 25"), String(n * 80 - 1)).toBeTruthy();
      expect(region.getByText("79 / 80"), String(n * 80 - 1)).toBeTruthy(); expect(region.getByText("99%"), String(n * 80 - 1)).toBeTruthy();
      expect(region.getByRole("progressbar", { name: /التقدم نحو/ }).getAttribute("aria-valuenow"), String(n * 80 - 1)).toBe("79");
      cleanup();
      region = draw(n * 80);
      expect(region.getByText("المرحلة " + (n + 1) + " من 25"), String(n * 80)).toBeTruthy();
      expect(region.getByText("0 / 80"), String(n * 80)).toBeTruthy(); expect(region.getByText("0%"), String(n * 80)).toBeTruthy();
      cleanup();
    }
  });
  it("0 → stage 1; 1999 → stage 25 at 79 / 80 with the completion wording; 2000 / 2001 / 9999 → 2000 / 2000, 80 / 80, 100%, «أكملت مسار القوة», no next, raw total shown above 2000 — never a stage 26", () => {
    let region = draw(0);
    expect(region.getByText("المرحلة 1 من 25")).toBeTruthy(); expect(region.getByText("بذرة القوة")).toBeTruthy();
    cleanup();
    region = draw(1999);
    expect(region.getByText("المرحلة 25 من 25")).toBeTruthy(); expect(region.getByText("79 / 80")).toBeTruthy(); expect(region.getByText("99%")).toBeTruthy();
    expect(region.getByText("بقيت نقطة قوة واحدة لإكمال مسار القوة")).toBeTruthy();
    expect(region.getByRole("progressbar", { name: "التقدم نحو إكمال مسار القوة" }).getAttribute("aria-valuenow")).toBe("79");
    cleanup();
    for (const raw of [2000, 2001, 9999]) {
      region = draw(raw);
      expect(region.getByText("المرحلة 25 من 25"), String(raw)).toBeTruthy();
      expect(region.getByText(/نقاط القوة:/).textContent, String(raw)).toBe("نقاط القوة: 2000 / 2000");
      expect(region.getByText("80 / 80"), String(raw)).toBeTruthy(); expect(region.getByText("100%"), String(raw)).toBeTruthy();
      expect(region.getByText("أكملت مسار القوة"), String(raw)).toBeTruthy();
      expect(region.getByRole("progressbar", { name: "اكتمال مسار القوة" }).getAttribute("aria-valuenow"), String(raw)).toBe("80");
      expect(document.querySelector(".eb-sp-rank-next-art"), String(raw)).toBeNull();
      expect(document.body.textContent, String(raw)).not.toMatch(/المرحلة 26/);
      if (raw > 2000) expect(region.getByText(/إجمالي نقاطك الفعلي:/).textContent, String(raw)).toContain(String(raw)); else expect(region.queryByText(/إجمالي نقاطك الفعلي:/), String(raw)).toBeNull();
      cleanup();
    }
  });
  it("accessibility: the ring is a progressbar (min 0, max 80, now = within-stage points, Arabic valuetext); the current image has a meaningful alt; the next image is decorative; the decorative SVG is aria-hidden", () => {
    const region = draw(510);
    const ring = region.getByRole("progressbar", { name: "التقدم نحو المرحلة 8 — سيد الأمواج" });
    expect(ring.getAttribute("aria-valuemin")).toBe("0"); expect(ring.getAttribute("aria-valuemax")).toBe("80"); expect(ring.getAttribute("aria-valuenow")).toBe("30"); expect(ring.getAttribute("aria-valuetext")).toBe("30 من 80 نقطة قوة");
    expect(document.querySelector(".eb-sp-rankring-svg")?.getAttribute("aria-hidden")).toBe("true");
    const current = region.getByRole("img", { name: "المرحلة 7 — ذئب الرياح" }) as HTMLImageElement;
    expect(current.className).toContain("eb-sp-rankring-art"); expect(current.getAttribute("src")).toBe(stageVisual(7).image);
    const next = document.querySelector(".eb-sp-rank-next-art") as HTMLImageElement;
    expect(next.getAttribute("alt")).toBe(""); expect(next.getAttribute("aria-hidden")).toBe("true");
    expect(region.queryByRole("img", { name: /سيد الأمواج/ })).toBeNull();
    // numbers are wrapped for RTL (dir="ltr" on the numeric tokens) and the long Arabic title is a block-level line that can wrap
    expect(region.getByText("30 / 80").getAttribute("dir")).toBe("ltr"); expect(region.getByText("38%").getAttribute("dir")).toBe("ltr");
    expect(region.getByText("ذئب الرياح").tagName).toBe("P");
  });
});
