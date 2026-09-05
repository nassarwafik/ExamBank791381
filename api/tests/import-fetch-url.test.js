import { describe, it, expect } from "vitest";
import { deriveFileName, GOOGLE_FORM_HOSTS } from "../src/functions/import-fetch-url.js";

describe("deriveFileName", () => {
  it("uses the page's <title> when present", () => {
    const html = "<html><head><title>امتحان الشبكات 2024</title></head><body></body></html>";
    expect(deriveFileName(html, "https://example.github.io/exam.html")).toBe("امتحان الشبكات 2024");
  });

  it("collapses internal whitespace/newlines in the title", () => {
    const html = "<title>  امتحان  \n  الشبكات  </title>";
    expect(deriveFileName(html, "https://x.com")).toBe("امتحان الشبكات");
  });

  it("falls back to the URL itself when there is no <title>", () => {
    const html = "<html><body>no title here</body></html>";
    expect(deriveFileName(html, "https://example.github.io/exam.html")).toBe("https://example.github.io/exam.html");
  });
});

describe("GOOGLE_FORM_HOSTS - the gform-kind allowlist", () => {
  it("only allows Google's own form-hosting domains", () => {
    expect(GOOGLE_FORM_HOSTS).toEqual(["docs.google.com", "forms.gle"]);
  });
});
