// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import StudentKpiStrip from "./StudentKpiStrip";
import StudentIdentityCard from "./StudentIdentityCard";
import StudentTodayHub from "./today/StudentTodayHub";
import { kpiNowHint, maskCode } from "./portalPresentation";
import type { StudentInfo } from "./types";

// UX-S1 (approved design docs/enterprise-ux-student-s1.md §2.1, §2.3, §2.4) — the «مطلوب الآن» hint never contradicts its number,
// the optional extra attempt reads neutral, the Strength breakdown has its own rule, and the login code (the identity number on new
// accounts) is masked but for its last 4 characters with «إظهار» / «إخفاء». Presentation only. TEST data only.
afterEach(cleanup);

describe("UX-S1 — «مطلوب الآن»", () => {
  it("the hint: in progress → «N قيد الحل»; else actionable → «متاح للحل الآن»; else «لا شيء مطلوب الآن»", () => {
    expect(kpiNowHint({ actionable: 2, inProgress: 1 })).toBe("1 قيد الحل");
    expect(kpiNowHint({ actionable: 1, inProgress: 0 })).toBe("متاح للحل الآن");
    expect(kpiNowHint({ actionable: 0, inProgress: 0 })).toBe("لا شيء مطلوب الآن");
    render(<StudentKpiStrip kpis={{ actionable: 1, inProgress: 0, pendingReview: 0, averageFinalized: null, stageNumber: 1, stageCount: 25 }} onOpenNow={() => {}} onOpenTasks={() => {}} onOpenProgress={() => {}} />);
    expect(screen.getByRole("button", { name: /مطلوب الآن/ }).textContent).toContain("متاح للحل الآن");
    expect(document.body.textContent).not.toContain("لا محاولات جارية");
  });
});

describe("UX-S1 — the optional extra attempt in the hub", () => {
  it("reads «محاولة إضافية (اختيارية)» with the neutral is-retry style, never «موعد قريب»", () => {
    render(<StudentTodayHub continueItem={{ type: "retry", priority: 5, title: "واجب الشبكات", label: "ابدأ محاولة جديدة", reason: "نتيجتك النهائية 40% · لديك محاولة متبقية", assignmentId: "a1" }}
      busy={false} onContinue={() => {}} messagesUnread={{ total: 0, capped: false }} progress={{ stageNumber: 1, stageCount: 25, medals: 0, finalized: 1, latest: null }} onOpenProgress={() => {}} onOpenTasks={() => {}} />);
    const hero = document.querySelector("[data-continue-type='retry']") as HTMLElement;
    expect(hero.className).toContain("is-retry");
    expect(hero.textContent).toContain("محاولة إضافية (اختيارية)");
    expect(hero.textContent).not.toContain("موعد قريب");
    const css = readFileSync(resolve(__dirname, "today", "today.css"), "utf8");
    expect(css).toMatch(/\.eb-sp-today-hero\.is-retry\{[^}]*border-inline-start-color:var\(--eb-line-2\)/);
  });
});

describe("UX-S1 — Strength breakdown style", () => {
  it("the breakdown list has a rule: no bullets, name and number on one row", () => {
    const css = readFileSync(resolve(__dirname, "..", "studentportal-pro.css"), "utf8");
    expect(css).toMatch(/\.eb-sp-strength-breakdown\{[^}]*list-style:none/);
    expect(css).toMatch(/\.eb-sp-strength-breakdown li\{[^}]*justify-content:space-between/);
  });
});

describe("UX-S1 — the login code is masked", () => {
  const student = (code: string): StudentInfo => ({ userId: "u1", code, displayName: "ليان حسن" } as unknown as StudentInfo);
  it("maskCode keeps the last 4 characters; 4 or fewer are shown as they are", () => {
    expect(maskCode("400000001")).toBe("•••••0001");
    expect(maskCode("S12")).toBe("S12");
    expect(maskCode("1234")).toBe("1234");
    expect(maskCode("")).toBe("");
  });
  it("masked by default; «إظهار» shows it (aria-pressed), «إخفاء» masks it again", () => {
    render(<StudentIdentityCard student={student("400000001")} classroom={null} displayName="" stageGroup={null} onChangeAvatar={() => {}} />);
    expect(document.body.textContent).not.toContain("400000001");
    expect(document.body.textContent).toContain("•••••0001");
    const toggle = screen.getByRole("button", { name: "إظهار الكود" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(document.body.textContent).toContain("400000001");
    expect(screen.getByRole("button", { name: "إخفاء الكود" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "إخفاء الكود" }));
    expect(document.body.textContent).not.toContain("400000001");
  });
  it("a short legacy code is shown as it is, without a toggle", () => {
    render(<StudentIdentityCard student={student("S12")} classroom={null} displayName="" stageGroup={null} onChangeAvatar={() => {}} />);
    expect(document.body.textContent).toContain("S12");
    expect(screen.queryByRole("button", { name: /الكود/ })).toBeNull();
  });
});
