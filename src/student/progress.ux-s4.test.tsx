// @vitest-environment happy-dom
// UX-S4 (docs/enterprise-ux-student-s4.md §2.1) — «التقدم»: no task-count cards, one line under the title, the stage sentence
// as the headline, the point sources folded under «من أين جاءت نقاطك؟» while there are none, one line for zero recognition,
// and a next step. Every value is the server's; nothing is computed here.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import StudentProgressSection from "./StudentProgressSection";
import type { StudentRecognition, StudentStrength } from "./types";

afterEach(cleanup);

/** A SERVER-shaped payload (the component reads the fields verbatim). */
function serverStrength(raw: number, over: Partial<StudentStrength> = {}): StudentStrength {
  const stagePoints = Math.min(raw, 2000), stageNumber = Math.floor(stagePoints / 80) + 1, stageFloor = (stageNumber - 1) * 80, within = stagePoints - stageFloor;
  return { rawTotalPoints: raw, totalPoints: raw, examPoints: raw, practicePoints: 0, studyPoints: 0, gamePoints: 0, projectPoints: 0, stagePoints, stageMaxPoints: 2000, stageNumber, stageCount: 25, stageBlockSize: 80, stageFloor, withinStagePoints: within, stagePercent: Math.round(within * 100 / 80), nextStageNumber: stageNumber + 1, nextStageRemaining: 80 - within, pointsToMaximum: 2000 - stagePoints, isMaximumStage: false, pathComplete: false, legacyRank: null, projects: [], ...over };
}
const ZERO_RECOGNITION: StudentRecognition = { medals: { total: 0, gold: 0, silver: 0, bronze: 0 }, reactionsReceived: { total: 0, byType: {} as StudentRecognition["reactionsReceived"]["byType"] }, achievements: { total: 0, byType: {} as StudentRecognition["achievements"]["byType"] } };
const region = () => screen.getByRole("region", { name: /تقدّمي/ });

describe("UX-S4 «التقدم» — one headline, no repeats", () => {
  it("has no task-count cards and one line under the title", () => {
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={null} averageFinalized={null} />);
    const r = within(region());
    for (const label of ["المهام", "قيد الحل", "بانتظار التصحيح", "مكتملة"]) expect(r.queryByText(label, { exact: true }), label).toBeNull();
    expect(region().querySelector(".eb-sp-stats")).toBeNull();
    expect(region().querySelector(".eb-section-header")!.textContent).toContain("مرحلتك في مسار القوة، ومعدّلك من النتائج النهائية، وتقديرك.");
    expect(region().textContent).not.toContain("أرقامك من الواجبات المنشورة لصفك");
  });

  it("the stage sentence is the headline, inside the stage text right under the group, before «N / 80»", () => {
    render(<StudentProgressSection medals={[]} strength={serverStrength(900, { stageNumber: 12, withinStagePoints: 20, stagePercent: 25, nextStageNumber: 13, nextStageRemaining: 60 })} recognition={null} averageFinalized={80} />);
    const headline = region().querySelector(".eb-sp-rank-hero-text .eb-sp-stage-headline") as HTMLElement;
    expect(headline).toBeTruthy();
    expect(headline.textContent).toMatch(/^بقي 60 نقطة قوة للوصول إلى المرحلة 13 — /);
    expect(headline.querySelector(".eb-sp-rank-next-art")).toBeTruthy();
    const order = [...region().querySelectorAll(".eb-sp-stage-group, .eb-sp-stage-headline, .eb-sp-rank-meta")].map(n => n.className.split(" ")[0]);
    expect(order).toEqual(["eb-sp-stage-group", "eb-sp-stage-headline", "eb-sp-rank-meta"]);
    expect(within(region()).getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 900 / 2000");     // the secondary total stays
  });

  it("«من أين جاءت نقاطك؟» is folded at zero and open with points; the five sources keep their order", () => {
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={null} averageFinalized={null} />);
    let details = region().querySelector("details.eb-sp-strength-details") as HTMLDetailsElement;
    expect(details.querySelector("summary")!.textContent).toBe("من أين جاءت نقاطك؟");
    expect(details.open).toBe(false);
    cleanup();
    render(<StudentProgressSection medals={[]} strength={serverStrength(120, { examPoints: 40, practicePoints: 0, studyPoints: 0, gamePoints: 0, projectPoints: 80 })} recognition={null} averageFinalized={null} />);
    details = region().querySelector("details.eb-sp-strength-details") as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect([...details.querySelectorAll("li > span")].map(s => s.textContent)).toEqual(["الواجبات النهائية", "التدريبات والامتحانات التدريبية", "تمارين الدراسة", "الألعاب التعليمية", "المشاريع"]);
  });

  it("zero recognition is one line; any non-zero count shows the three tiles", () => {
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={ZERO_RECOGNITION} averageFinalized={null} />);
    expect(screen.queryByRole("list", { name: "التقدير" })).toBeNull();
    expect(region().querySelector(".eb-sp-recognition-empty")!.textContent).toBe("لا ميداليات ولا تفاعلات ولا إنجازات بعد.");
    cleanup();
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={{ ...ZERO_RECOGNITION, achievements: { total: 1, byType: {} as StudentRecognition["achievements"]["byType"] } }} averageFinalized={null} />);
    expect(within(screen.getByRole("list", { name: "التقدير" })).getAllByRole("listitem")).toHaveLength(3);
    expect(region().querySelector(".eb-sp-recognition-empty")).toBeNull();
  });

  it("the next step opens «الواجبات» while something needs action, otherwise «المواد»; no next step when none is given", () => {
    const onOpenTasks = vi.fn(), onOpenLearning = vi.fn();
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={null} averageFinalized={null} nextStep={{ actionable: 2, onOpenTasks, onOpenLearning }} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الواجبات (2 مطلوب الآن)" }));
    expect(onOpenTasks).toHaveBeenCalledTimes(1); expect(onOpenLearning).not.toHaveBeenCalled();
    cleanup();
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={null} averageFinalized={null} nextStep={{ actionable: 0, onOpenTasks, onOpenLearning }} />);
    expect(screen.queryByRole("button", { name: /افتح الواجبات/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تابع القراءة في المواد" }));
    expect(onOpenLearning).toHaveBeenCalledTimes(1);
    cleanup();
    render(<StudentProgressSection medals={[]} strength={serverStrength(0)} recognition={null} averageFinalized={null} />);
    expect(region().querySelector(".eb-sp-progress-next")).toBeNull();
  });

  it("CSS: on a phone the Strength card takes the full width and the average goes under it; the disclosure is a 44 px target", () => {
    const css = readFileSync(path.join(process.cwd(), "src", "student", "student-portal-v2.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/@media \(max-width: 639px\)\{\s*\.eb-sp-v2 \.eb-sp-progress-row\{ grid-template-columns:minmax\(0,1fr\); \}\s*\.eb-sp-v2 \.eb-sp-progress-row > \.eb-sp-average\{ order:2; \}/);
    expect(css).toMatch(/\.eb-sp-v2 \.eb-sp-strength-details > summary\{[^}]*min-height:44px/);
  });
});
