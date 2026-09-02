import { describe, it, expect } from "vitest";
import { decodeFileNameHeader } from "../src/functions/import-upload.js";

describe("decodeFileNameHeader", () => {
  it("decodes an Arabic file name that the frontend encodeURIComponent()'d before sending it as a header", () => {
    const original = "امتحان الشبكات 2024.pdf";
    expect(decodeFileNameHeader(encodeURIComponent(original))).toBe(original);
  });

  it("decodes a plain ASCII file name unchanged", () => {
    expect(decodeFileNameHeader(encodeURIComponent("exam1.pdf"))).toBe("exam1.pdf");
  });

  it("falls back to the raw value if it isn't validly percent-encoded", () => {
    expect(decodeFileNameHeader("not%valid%encoding")).toBe("not%valid%encoding");
  });

  it("returns an empty string for a missing header", () => {
    expect(decodeFileNameHeader(null)).toBe("");
    expect(decodeFileNameHeader(undefined)).toBe("");
  });
});
