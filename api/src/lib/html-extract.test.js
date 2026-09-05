import { describe, it, expect } from "vitest";
import { extractPages } from "./html-extract.js";

describe("extractPages - an ordinary HTML page (no embedded quiz) is unaffected", () => {
  it("sanitizes and converts to markdown-like text as before", async () => {
    const html = "<html><body><h1>امتحان</h1><p>سؤال 1: ما هو 2+2؟</p></body></html>";
    const result = await extractPages(Buffer.from(html, "utf8"));
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toContain("امتحان");
    expect(result.pages[0].text).toContain("سؤال 1");
    expect(result.warnings).toEqual([]);
  });

  it("strips <script> content the same way as before when there is no QUESTIONS array in it", async () => {
    const html = "<html><body><p>نص</p><script>function noop(){}</script></body></html>";
    const result = await extractPages(Buffer.from(html, "utf8"));
    expect(result.pages[0].text).not.toContain("noop");
  });
});

describe("extractPages - a self-contained interactive quiz page (const QUESTIONS = [...])", () => {
  const html = `<!DOCTYPE html><html><head><title>اختبار</title></head><body></body>
    <script>
    const QUESTIONS = [
      { topic:"شبكات", text:"ما هي الشبكة؟", options:["تعريف خاطئ","مجموعة أجهزة متصلة"], answer:1 },
      { text:"سؤال ثانٍ", options:["أ","ب","ج"], answer:2 }
    ];
    </script></html>`;

  it("renders the embedded question bank as plain text instead of running it through the sanitize/markdown path", async () => {
    const result = await extractPages(Buffer.from(html, "utf8"));
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toContain("ما هي الشبكة؟");
    expect(result.pages[0].text).toContain("الإجابة الصحيحة: مجموعة أجهزة متصلة");
    expect(result.pages[0].text).toContain("سؤال ثانٍ");
    expect(result.pages[0].text).toContain("الإجابة الصحيحة: ج");
  });

  it("produces no images and no warnings for this path", async () => {
    const result = await extractPages(Buffer.from(html, "utf8"));
    expect(result.pages[0].images).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
