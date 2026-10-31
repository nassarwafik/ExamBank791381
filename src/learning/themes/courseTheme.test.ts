// Course visual themes (courseTheme.ts): which course wears the booklet skin, which group colour each unit gets, and which
// icon/colour family each PRINTED box label of 791381s maps to. Presentation only — the content is never read for wording.
import { describe, it, expect } from "vitest";
import manifest791381s from "../content/791381s/manifest";
import { loadBundledModuleContent } from "../content/bundledModules";
import { CALLOUT_TONES, THEME_TONES, calloutTone, courseThemeId, pageThemeFor } from "./courseTheme";

describe("course themes — who wears the booklet skin", () => {
  it("only the summary booklet 791381s is themed; the full book 791381 and unknown courses keep the established look", () => {
    expect(courseThemeId("791381s")).toBe("booklet");
    expect(courseThemeId("791381")).toBeNull();
    expect(courseThemeId("nope")).toBeNull();
    expect(courseThemeId("__proto__")).toBeNull();
    expect(pageThemeFor("791381", manifest791381s, "791381s-m01")).toBeNull();
  });

  it("every 791381s unit takes the colour of its booklet group (introduction, the six «دفعات», the final summary)", () => {
    const tones = Object.fromEntries(manifest791381s.modules.map(m => [m.id, pageThemeFor("791381s", manifest791381s, m.id)?.tone]));
    expect(tones["791381s-m00"]).toBe("intro");
    expect(["m01", "m02", "m03", "m04"].map(n => tones["791381s-" + n])).toEqual(["b1", "b1", "b1", "b1"]);
    expect(tones["791381s-m05"]).toBe("b2");
    expect(tones["791381s-m09"]).toBe("b3");
    expect(tones["791381s-m15"]).toBe("b4");
    expect(tones["791381s-m20"]).toBe("b5");
    expect(tones["791381s-m26"]).toBe("b6");
    expect(["m31", "m32", "m33", "m34", "m35", "m36"].map(n => tones["791381s-" + n])).toEqual(Array(6).fill("summary"));
    for (const t of Object.values(tones)) expect(THEME_TONES).toContain(t);
  });

  it("a unit outside every batch, or an unknown batch id, falls back to the neutral tone (never an arbitrary string)", () => {
    expect(pageThemeFor("791381s", manifest791381s, "791381s-m99")).toEqual({ id: "booklet", tone: "base" });
    expect(pageThemeFor("791381s", { batches: [{ id: "<script>", label: "x", moduleIds: ["a"] }] }, "a")).toEqual({ id: "booklet", tone: "base" });
    expect(pageThemeFor("791381s", null, undefined)).toEqual({ id: "booklet", tone: "base" });
  });
});

describe("course themes — printed box labels → icon/colour family", () => {
  it("maps the booklet's own labels to their families", () => {
    const cases: Array<[string, Parameters<typeof calloutTone>[1], string]> = [
      ["تذكّر", "remember", "remember"], ["طريقة للحفظ", "remember", "remember"], ["احفظ", "summary", "remember"], ["لا تنسَ الحفظ", "summary", "remember"],
      ["انتبه", "warning", "warning"], ["انتبه!", "warning", "warning"], ["احذر", "summary", "warning"], ["إشارة تحذير", "summary", "warning"],
      ["مثال", "tip", "example"], ["مثال 2 (أسهل)", "tip", "example"], ["مثال على Phishing", "tip", "example"],
      ["الفكرة", "summary", "idea"], ["تشبيه", "summary", "analogy"],
      ["قاعدة", "summary", "rule"], ["القاعدة", "summary", "rule"], ["شرط أساسي", "summary", "rule"], ["التعيين", "summary", "rule"],
      ["لاحظ", "summary", "note"], ["ملاحظة", "summary", "note"], ["تأكّد", "summary", "note"], ["النتيجة", "summary", "note"], ["الخلاصة", "summary", "note"],
      ["خطأ شائع", "summary", "mistake"], ["مشكلة Bus", "summary", "mistake"],
      ["الوقاية", "summary", "prevention"], ["الفائدة", "summary", "benefit"],
      ["لماذا؟", "summary", "why"], ["لماذا نشفّر؟", "summary", "why"], ["متى نستعمل Static؟", "summary", "why"], ["كيف يعرف السويتش القسم؟", "summary", "why"],
      ["للامتحان", "summary", "exam"], ["مهم للامتحان", "important", "exam"], ["في الامتحان · الرفض الضمني", "summary", "exam"], ["للطالب", "summary", "exam"], ["الأهم للطالب", "summary", "exam"],
    ];
    for (const [title, kind, tone] of cases) expect(calloutTone(title, kind), title).toBe(tone);
  });

  it("an unknown or missing label falls back to the callout kind's family", () => {
    expect(calloutTone("SSH", "summary")).toBe("note");
    expect(calloutTone(undefined, "warning")).toBe("warning");
    expect(calloutTone("", "tip")).toBe("example");
    expect(calloutTone("شيء آخر", "important")).toBe("exam");
  });

  it("every callout of the 791381s booklet resolves to a known family, and the specific labels are not left on the fallback", async () => {
    const seen = new Map<string, string>();
    for (const m of manifest791381s.modules) {
      const mod = await loadBundledModuleContent("791381s", m.id);
      for (const l of mod.lessons) for (const p of l.pages) for (const b of p.blocks) {
        if (b.type !== "callout") continue;
        const tone = calloutTone(b.title, b.kind);
        expect(CALLOUT_TONES).toContain(tone);
        seen.set(b.title ?? "", tone);
      }
    }
    expect(seen.size).toBeGreaterThan(30);
    // The labels the booklet uses most each land in their own family.
    expect(seen.get("تذكّر")).toBe("remember");
    expect(seen.get("انتبه")).toBe("warning");
    expect(seen.get("مثال")).toBe("example");
    expect(seen.get("الفكرة")).toBe("idea");
    expect(seen.get("خطأ شائع")).toBe("mistake");
  }, 30000);
});
