import { describe, it, expect } from "vitest";
import { toAsciiDigits, identityDigits, foldArabic, matchesSearch, isTwelfthGrade, defaultSchoolYear, safeFileName, relativeTime } from "./rosterText";
import { buildCredentialsCsv, buildCredentialCardsHtml } from "./credentialSheets";
import { openCredentialBatch } from "../credentialBatch";
import { parseBulkStudents, normalizeImportedIdentity, readImportFileText, IMPORT_TEMPLATE_CSV } from "../bulkStudentsParse";

describe("rosterText", () => {
  it("digits: Arabic-Indic and Persian digits map to ASCII; identity input keeps 9 digits", () => {
    expect(toAsciiDigits("١٢٣ ۴۵۶")).toBe("123 456");
    expect(identityDigits("١٢٣-٤٥٦-٧٨٩٠")).toBe("123456789");
  });
  it("foldArabic: hamza / taa marbuta / alef maqsura / diacritics / tatweel fold together", () => {
    expect(foldArabic("أحمد")).toBe(foldArabic("احمد"));
    expect(foldArabic("إيمان")).toBe(foldArabic("ايمان"));
    expect(foldArabic("فاطمة")).toBe(foldArabic("فاطمه"));
    expect(foldArabic("مصطفى")).toBe(foldArabic("مصطفي"));
    expect(foldArabic("مُحَمَّد")).toBe("محمد");
    expect(foldArabic("محـــمد")).toBe("محمد");
  });
  it("matchesSearch: every term must match; empty query matches everything", () => {
    expect(matchesSearch(["أحمد", "العلي"], "احمد علي")).toBe(true);
    expect(matchesSearch(["أحمد", "العلي"], "احمد حسن")).toBe(false);
    expect(matchesSearch(["x"], "   ")).toBe(true);
    expect(matchesSearch(["123456789"], "٤٥٦")).toBe(true);
  });
  it("isTwelfthGrade: 12 in any digits or the Arabic ordinal, never 112", () => {
    for (const g of ["12", "١٢", "12-ب", "الصف 12", "الثاني عشر", "ثاني عشر", "الصف الثاني عشر"]) expect(isTwelfthGrade(g), g).toBe(true);
    for (const g of ["11", "112", "الحادي عشر", "", "عاشر"]) expect(isTwelfthGrade(g), g).toBe(false);
  });
  it("defaultSchoolYear: August starts the new year", () => {
    expect(defaultSchoolYear(new Date(2027, 1, 10))).toBe("2026-2027");
    expect(defaultSchoolYear(new Date(2027, 6, 31))).toBe("2026-2027");
    expect(defaultSchoolYear(new Date(2027, 7, 1))).toBe("2027-2028");
    expect(defaultSchoolYear(new Date(2026, 9, 17))).toBe("2026-2027");
  });
  it("relativeTime: short Arabic labels with Latin digits for 30 days, then a date; full timestamp kept for the tooltip", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    expect(relativeTime("", now)).toBeNull();
    expect(relativeTime("not a date", now)).toBeNull();
    expect(relativeTime("2026-10-17T11:59:40.000Z", now)?.label).toBe("الآن");
    expect(relativeTime("2026-10-17T11:55:00.000Z", now)?.label).toBe("قبل 5 دقائق");
    expect(relativeTime("2026-10-10T12:00:00.000Z", now)?.label).toBe("قبل 7 أيام");
    const old = relativeTime("2026-08-01T12:00:00.000Z", now);
    expect(old?.label).toMatch(/2026/);
    expect(old?.label).not.toMatch(/[\u0660-\u0669]/);
    expect(relativeTime("2026-10-10T12:00:00.000Z", now)?.full).toMatch(/2026/);
  });
  it("safeFileName: separators and reserved characters never reach the download name", () => {
    expect(safeFileName("الحادي عشر/3: أ", "x")).toBe("الحادي عشر 3 أ");
    expect(safeFileName(" \u0007 ", "students")).toBe("students");
  });
});

describe("credentialSheets", () => {
  const batch = openCredentialBatch("c1", "الحادي عشر 3", [{ userId: "u1", firstName: "<b>ريم</b>", familyName: "صالح", identityNumber: "555555555", code: "555555555", password: "Pw5\"x" }], "2026-10-01T08:00:00.000Z");
  it("CSV: BOM, the batch's own class, identity and password per row", () => {
    const csv = buildCredentialsCsv(batch);
    expect(csv.startsWith("﻿\"الاسم\"")).toBe(true);
    expect(csv).toContain('"<b>ريم</b>","صالح","الحادي عشر 3","555555555","Pw5""x"');
  });
  it("print cards: every value is HTML-escaped; one card per student", () => {
    const html = buildCredentialCardsHtml(batch, "ادخل برقم الهوية");
    expect(html).not.toContain("<b>ريم</b>");
    expect(html).toContain("&lt;b&gt;ريم&lt;/b&gt;");
    expect(html).toContain("Pw5&quot;x");
    expect(html.match(/<article class="card">/g)).toHaveLength(1);
    expect(html).toContain('dir="rtl"');
  });
});

describe("bulk import parsing", () => {
  it("semicolon- and tab-separated Excel exports are read like comma CSV", () => {
    expect(parseBulkStudents("الاسم;اسم العائلة;رقم الهوية\nعلي;حسن;123456789\n", "r.csv").students).toEqual([{ firstName: "علي", familyName: "حسن", identityNumber: "123456789" }]);
    expect(parseBulkStudents("firstName\tfamilyName\tidentityNumber\nA\tB\t12345\n", "r.csv").students).toEqual([{ firstName: "A", familyName: "B", identityNumber: "000012345" }]);
    expect(parseBulkStudents('firstName,familyName,identityNumber\n"علي; أحمد",حسن,123456789\n', "r.csv").students[0].firstName).toBe("علي; أحمد");
  });
  it("identity: Arabic-Indic digits are digits; letters are not silently stripped", () => {
    expect(normalizeImportedIdentity("١٢٣٤٥٦٧٨٩")).toBe("123456789");
    expect(normalizeImportedIdentity("12345678a")).not.toMatch(/^\d{9}$/);
  });
  it("a Windows-1256 (Excel «CSV» on Arabic Windows) file is decoded as Arabic, UTF-8 stays UTF-8", async () => {
    // "علي" in Windows-1256: ع=0xDA ل=0xE1 ي=0xED
    const cp1256 = new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0xda, 0xe1, 0xed, 0x0a]);
    expect(await readImportFileText(new Blob([cp1256]))).toBe("name\nعلي\n");
    expect(await readImportFileText(new Blob(["اسم\n"]))).toBe("اسم\n");
  });
  it("the template parses as a header-only file (no sample row to import by mistake)", () => {
    expect(parseBulkStudents(IMPORT_TEMPLATE_CSV, "template.csv").students).toEqual([]);
  });
});
