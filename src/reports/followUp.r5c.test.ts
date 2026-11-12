// Phase R-5c — the words of «طلاب يحتاجون متابعة» (followUp.ts). The client only words what the server sent; a reason it does
// not know is not worded at all.
import { describe, it, expect } from "vitest";
import { reasonText, criteriaText, assessmentsCount, studentsNeedFollowUp } from "./followUp";

describe("R-5c follow-up wording", () => {
  it("Arabic counted nouns, Western digits", () => {
    expect([1, 2, 3, 10, 11, 25].map(assessmentsCount)).toEqual(["تقييمًا واحدًا", "تقييمين", "3 تقييمات", "10 تقييمات", "11 تقييمًا", "25 تقييمًا"]);
    expect([1, 2, 3, 10, 11].map(studentsNeedFollowUp)).toEqual(["طالب واحد يحتاج متابعة", "طالبان يحتاجان متابعة", "3 طلاب يحتاجون متابعة", "10 طلاب يحتاجون متابعة", "11 طالبًا يحتاجون متابعة"]);
  });
  it("each reason is said with its own number", () => {
    expect(reasonText({ code: "missing", count: 3 })).toBe("لم يسلّم 3 تقييمات");
    expect(reasonText({ code: "missing", count: 2 })).toBe("لم يسلّم تقييمين");
    expect(reasonText({ code: "belowClass", gap: 22.5 })).toBe("أقل من متوسط الصف بـ 22.5 نقطة");
    expect(reasonText({ code: "belowClass", gap: 15 })).toBe("أقل من متوسط الصف بـ 15 نقطة");
    expect(reasonText({ code: "project", projectCode: "P", title: "مشروع الشبكات", reasons: ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"] })).toBe("مشروع الشبكات: بلا تحديث 7+ أيام، تقدّم أقل من 40%");
  });
  it("an unknown or malformed reason is not worded (never guessed into another reason)", () => {
    expect(reasonText({ code: "failing" })).toBeNull();
    expect(reasonText({ code: "missing" })).toBeNull();
    expect(reasonText({ code: "missing", count: Number.NaN } as never)).toBeNull();
    expect(reasonText({ code: "belowClass", gap: "20" } as never)).toBeNull();
    expect(reasonText({ code: "project", projectCode: "P", title: "م", reasons: [] })).toBeNull();
    expect(reasonText({})).toBeNull();
  });
  it("the criteria sentence carries the server's numbers and says what it is not", () => {
    const text = criteriaText({ missingAtLeast: 2, belowClassBy: 15 }, 72.5);
    expect(text).toContain("لم يسلّم تقييمين أو أكثر");
    expect(text).toContain("أقل من متوسط الصف (73%) بـ 15 نقطة أو أكثر");
    expect(text).toContain("بانتظار التصحيح لا يُحسب على الطالب");
    expect(text).toContain("ليست هذه علامة نجاح أو رسوب");
    expect(criteriaText({ missingAtLeast: 3, belowClassBy: 10 }, null)).toContain("لم يسلّم 3 تقييمات أو أكثر");
    expect(criteriaText({ missingAtLeast: 3, belowClassBy: 10 }, null)).toContain("أقل من متوسط الصف بـ 10 نقطة أو أكثر");
  });
});
