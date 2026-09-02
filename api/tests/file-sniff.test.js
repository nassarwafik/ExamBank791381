import { describe, it, expect } from "vitest";
import { detectAndValidateKind, isPdfBuffer, isDocxBuffer } from "../src/lib/file-sniff.js";

function zipBuffer(entryNames) {
  // Minimal fake zip: real magic bytes + entry names appended as plain text, matching what
  // isDocxBuffer actually checks (magic bytes + presence of the "word/document.xml" entry name
  // somewhere in the byte stream) without needing a real zip-writing dependency in tests.
  const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  return Buffer.concat([header, Buffer.from(entryNames.join("\n"))]);
}

describe("isPdfBuffer / isDocxBuffer", () => {
  it("accepts a buffer starting with the real PDF magic bytes", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.7\n..."))).toBe(true);
  });

  it("rejects a buffer without PDF magic bytes", () => {
    expect(isPdfBuffer(Buffer.from("not a pdf"))).toBe(false);
  });

  it("accepts a real DOCX-shaped zip (magic bytes + word/document.xml entry)", () => {
    expect(isDocxBuffer(zipBuffer(["word/document.xml", "[Content_Types].xml"]))).toBe(true);
  });

  it("rejects a plain zip renamed to .docx (right magic bytes, no document.xml entry)", () => {
    expect(isDocxBuffer(zipBuffer(["readme.txt", "photo.jpg"]))).toBe(false);
  });

  it("rejects a non-zip buffer even if named .docx", () => {
    expect(isDocxBuffer(Buffer.from("plain text file"))).toBe(false);
  });
});

describe("detectAndValidateKind", () => {
  it("accepts a matching pdf extension + mime + content", () => {
    const result = detectAndValidateKind("exam.pdf", "application/pdf", Buffer.from("%PDF-1.4"));
    expect(result).toEqual({ ok: true, kind: "pdf" });
  });

  it("accepts a matching docx extension + mime + content", () => {
    const result = detectAndValidateKind(
      "exam.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      zipBuffer(["word/document.xml"])
    );
    expect(result).toEqual({ ok: true, kind: "docx" });
  });

  it("rejects an unsupported extension", () => {
    expect(detectAndValidateKind("exam.exe", "application/octet-stream", Buffer.from("MZ")).ok).toBe(false);
  });

  it("rejects when the declared MIME type doesn't match the extension", () => {
    const result = detectAndValidateKind("exam.pdf", "text/html", Buffer.from("%PDF-1.4"));
    expect(result).toEqual({ ok: false, reason: "extension-mime-mismatch" });
  });

  it("rejects a plain zip renamed to .docx even with a correct declared MIME type", () => {
    const result = detectAndValidateKind(
      "exam.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      zipBuffer(["not-a-word-doc.txt"])
    );
    expect(result).toEqual({ ok: false, reason: "content-not-docx" });
  });

  it("rejects content that isn't actually a PDF despite the .pdf extension", () => {
    const result = detectAndValidateKind("exam.pdf", "application/pdf", Buffer.from("<html>fake</html>"));
    expect(result).toEqual({ ok: false, reason: "content-not-pdf" });
  });

  it("accepts .html/.htm with no strong content check beyond looking like text", () => {
    expect(detectAndValidateKind("exam.html", "text/html", Buffer.from("<html></html>"))).toEqual({ ok: true, kind: "html" });
    expect(detectAndValidateKind("exam.htm", "text/html", Buffer.from("<html></html>"))).toEqual({ ok: true, kind: "html" });
  });
});
