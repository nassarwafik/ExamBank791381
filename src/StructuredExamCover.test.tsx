// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import StructuredExamCover from "./StructuredExamCover";
import { normalizeCoverPage } from "./examCover";
import type { ExamCoverPage } from "./examCover";

afterEach(cleanup);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAA";
const dist = { rows: [{ title: "القسم الأول", marks: 20 }, { title: "القسم الثاني", marks: 80 }], total: 100 };
const baseCover = (o: Partial<ExamCoverPage> = {}): ExamCoverPage => normalizeCoverPage({ enabled: true, ...o })!;

describe("StructuredExamCover", () => {
  it("E: renders a safe raster banner as an <img> with the data URL", () => {
    const { container } = render(<StructuredExamCover cover={baseCover({ banner: { dataUrl: PNG } })} title="امتحان" distribution={dist} onStart={() => {}} />);
    const img = container.querySelector(".iex-cover-banner img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe(PNG);
  });

  it("F: an unsafe/external banner is never rendered as an image", () => {
    // normalizeCoverPage drops it; even if a raw unsafe url is passed, the component guards rendering.
    const raw = { enabled: true, banner: { dataUrl: "https://tracker.example/a.png" } } as unknown as ExamCoverPage;
    const { container } = render(<StructuredExamCover cover={raw} title="امتحان" distribution={dist} onStart={() => {}} />);
    expect(container.querySelector(".iex-cover-banner img")).toBeNull();
    expect(container.innerHTML).not.toContain("tracker.example");
  });

  it("G & H: instructions render as bullets and any markup is inert text (no script execution)", () => {
    const cover = baseCover({ instructions: "أجب عن جميع الأسئلة.\nاقرأ جيدًا\n<script>globalThis.__coverPwned=true</script>" });
    const { container } = render(<StructuredExamCover cover={cover} title="امتحان" distribution={dist} onStart={() => {}} />);
    const items = Array.from(container.querySelectorAll(".iex-cover-instructions li")).map(li => li.textContent);
    expect(items).toContain("أجب عن جميع الأسئلة.");
    expect(items).toContain("اقرأ جيدًا");
    // the <script> line is present only as harmless text, and did not execute
    expect(items.some(t => (t || "").includes("<script>"))).toBe(true);
    expect(container.querySelector("script")).toBeNull();
    expect((globalThis as { __coverPwned?: boolean }).__coverPwned).toBeUndefined();
  });

  it("I & K: student identity comes from runtime props; preview mode uses a placeholder (never real)", () => {
    const cover = baseCover();
    const runtime = render(<StructuredExamCover cover={cover} title="امتحان" distribution={dist} runtime={{ studentName: "أحمد محمد", className: "الحادي عشر 7" }} onStart={() => {}} />);
    expect(runtime.container.textContent).toContain("أحمد محمد");
    cleanup();
    const preview = render(<StructuredExamCover cover={cover} title="امتحان" distribution={dist} preview onStart={() => {}} />);
    expect(preview.container.textContent).toContain("طالب تجريبي");
    expect(preview.container.textContent).not.toContain("أحمد محمد");
  });

  it("L & M: total marks and marks distribution are shown from the computed distribution", () => {
    const { container } = render(<StructuredExamCover cover={baseCover()} title="امتحان" distribution={dist} onStart={() => {}} />);
    const marks = container.querySelector(".iex-cover-marks")!;
    expect(marks.textContent).toContain("القسم الأول");
    expect(marks.textContent).toContain("20 علامة");
    expect(marks.textContent).toContain("80 علامة");
    expect(marks.textContent).toContain("المجموع");
    expect(container.querySelector(".iex-cover-info")!.textContent).toContain("100 علامة");
  });

  it("U: Start button wording follows activity type and fires onStart", () => {
    const onStart = vi.fn();
    const examR = render(<StructuredExamCover cover={baseCover({ activityType: "exam" })} title="ت" distribution={dist} onStart={onStart} />);
    const examBtn = examR.container.querySelector(".iex-cover-start") as HTMLButtonElement;
    expect(examBtn.textContent).toBe("ابدأ الامتحان");
    fireEvent.click(examBtn);
    expect(onStart).toHaveBeenCalledTimes(1);
    cleanup();
    const trainR = render(<StructuredExamCover cover={baseCover({ activityType: "training" })} title="ت" distribution={dist} onStart={() => {}} />);
    expect((trainR.container.querySelector(".iex-cover-start") as HTMLButtonElement).textContent).toBe("ابدأ التدريب");
  });

  it("hides marks distribution when the flag is off", () => {
    const { container } = render(<StructuredExamCover cover={baseCover({ showMarksDistribution: false })} title="امتحان" distribution={dist} onStart={() => {}} />);
    expect(container.querySelector(".iex-cover-marks")).toBeNull();
  });
});
