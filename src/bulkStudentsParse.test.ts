import { describe, it, expect } from "vitest";
import { parseBulkStudents, normalizeImportedIdentity } from "./bulkStudentsParse";

// Roadmap #18 — Stage-1 local file parsing (JSON + CSV) into canonical rows. Server re-validates, so this
// only proves the file -> rows normalization (formats, header aliases, identity normalization).

describe("bulkStudentsParse — JSON", () => {
  it("parses a plain array", () => {
    const { students, format } = parseBulkStudents(JSON.stringify([{ firstName: "علي", familyName: "حسن", identityNumber: "123456789" }]), "x.json");
    expect(format).toBe("json");
    expect(students).toEqual([{ firstName: "علي", familyName: "حسن", identityNumber: "123456789" }]);
  });
  it("parses a {students:[...]} envelope and pads short ids", () => {
    const { students } = parseBulkStudents(JSON.stringify({ students: [{ givenName: "سارة", surname: "علي", idNumber: "12345" }] }), "x.json");
    expect(students[0]).toEqual({ firstName: "سارة", familyName: "علي", identityNumber: "000012345" });
  });
  it("throws a friendly error on invalid JSON", () => {
    expect(() => parseBulkStudents("{not json", "x.json")).toThrow();
  });
});

describe("bulkStudentsParse — CSV", () => {
  it("parses canonical English headers", () => {
    const csv = "firstName,familyName,identityNumber\nعلي,حسن,123456789\nمنى,خالد,222333444\n";
    const { students, format } = parseBulkStudents(csv, "roster.csv");
    expect(format).toBe("csv");
    expect(students).toEqual([
      { firstName: "علي", familyName: "حسن", identityNumber: "123456789" },
      { firstName: "منى", familyName: "خالد", identityNumber: "222333444" }
    ]);
  });
  it("supports Arabic headers and quoted cells with commas", () => {
    const csv = 'الاسم,العائلة,رقم الهوية\n"علي, أحمد",حسن,123456789\n';
    const { students } = parseBulkStudents(csv, "roster.csv");
    expect(students[0]).toEqual({ firstName: "علي, أحمد", familyName: "حسن", identityNumber: "123456789" });
  });
  it("supports common aliases (lastName / idNumber) and strips a BOM", () => {
    const csv = "﻿firstName,lastName,idNumber\nA,B,000111222\n";
    const { students } = parseBulkStudents(csv, "roster.csv");
    expect(students[0]).toEqual({ firstName: "A", familyName: "B", identityNumber: "000111222" });
  });
  it("splits a single full-name column when present", () => {
    const csv = "name,identityNumber\nعلي حسن الأحمد,123456789\n";
    const { students } = parseBulkStudents(csv, "roster.csv");
    expect(students[0]).toEqual({ firstName: "علي", familyName: "حسن الأحمد", identityNumber: "123456789" });
  });
  it("refuses a CSV with no recognizable headers", () => {
    expect(() => parseBulkStudents("colX,colY\n1,2\n", "roster.csv")).toThrow();
  });
});

describe("normalizeImportedIdentity", () => {
  it("pads to 9 and strips non-digits; keeps over-length as-is", () => {
    expect(normalizeImportedIdentity("12345")).toBe("000012345");
    expect(normalizeImportedIdentity("12-34-56-789")).toBe("123456789");
    expect(normalizeImportedIdentity("1234567890123")).toBe("1234567890123");
    expect(normalizeImportedIdentity("")).toBe("");
  });
});
