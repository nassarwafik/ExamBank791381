import { describe, it, expect } from "vitest";
import { count, spread, sinceText, exactTime, SUBMISSIONS, STUDENTS, STUDENTS_WORKING } from "./todayFormat";

// Phase 21H.0 — the hub's figures name their unit with correct Arabic agreement, and ages read as relative phrases.
const NOW = "2026-10-16T22:00:00.000Z", ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString(), M = 60e3, H = 60 * M, D = 24 * H;

describe("21H.0 todayFormat", () => {
  it("counts agree with the number (1, 2, 3–10, 11+)", () => {
    expect([1, 2, 8, 11, 100].map(n => count(n, SUBMISSIONS))).toEqual(["تسليم واحد", "تسليمان", "8 تسليمات", "11 تسليمًا", "100 تسليم"]);
    expect(count(40, STUDENTS)).toBe("40 طالبًا");
    expect(spread(9, SUBMISSIONS, 2)).toBe("9 تسليمات في واجبين");
    expect(spread(1, SUBMISSIONS, 1)).toBe("تسليم واحد في واجب واحد");
    expect(spread(12, STUDENTS, 0)).toBe("12 طالبًا");
    expect([1, 2, 5].map(n => count(n, STUDENTS_WORKING))).toEqual(["طالب واحد يعمل الآن", "طالبان يعملان الآن", "5 طلاب يعملون الآن"]);
  });

  it("relative ages: now, minutes, hours, days; skew reads «الآن»; garbage reads empty", () => {
    expect(sinceText(ago(20 * 1000), NOW)).toBe("الآن");
    expect(sinceText(ago(-5 * M), NOW)).toBe("الآن");
    expect(sinceText(ago(M), NOW)).toBe("منذ دقيقة");
    expect(sinceText(ago(2 * M), NOW)).toBe("منذ دقيقتين");
    expect(sinceText(ago(5 * M), NOW)).toBe("منذ 5 دقائق");
    expect(sinceText(ago(45 * M), NOW)).toBe("منذ 45 دقيقة");
    expect(sinceText(ago(2 * H), NOW)).toBe("منذ ساعتين");
    expect(sinceText(ago(6 * D + 3 * H), NOW)).toBe("منذ 6 أيام");
    expect(sinceText(ago(13 * D), NOW)).toBe("منذ 13 يومًا");
    expect(sinceText("garbage", NOW)).toBe("");
    expect(exactTime("garbage")).toBe("");
  });
});
