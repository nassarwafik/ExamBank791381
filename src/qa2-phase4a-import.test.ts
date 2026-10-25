import { describe, it, expect } from "vitest";
import { parseBulkStudents } from "./bulkStudentsParse";
import { importName } from "./projects/scoreImport";

// QA round 2 (main 36dc60e9), phase 4a — import parsing.
// QA2-12  with BOTH a student-number column («رقم الطالب», studentId, code) and an explicit identity column, the FIRST column won, so a
//         running number became the identity (accounts 000000001, 000000002 …) — a QA-2 gap.
// QA2-25  a name in the score file with an invisible mark (zero-width space, bidi mark) did not match the roster.

const ids = (text: string) => parseBulkStudents(text, "r.csv").students.map(r => r.identityNumber);

describe("QA2-12 an explicit identity column wins over a student-number column", () => {
  it("«رقم الطالب» (1, 2) before «رقم الهوية» → the identity column", () => {
    expect(ids("رقم الطالب,الاسم,اسم العائلة,رقم الهوية\r\n1,علي,حسن,123456789\r\n2,سارة,خالد,987654321\r\n")).toEqual(["123456789", "987654321"]);
  });
  it("studentId / code before identityNumber → identityNumber", () => {
    expect(ids("studentId,firstName,familyName,identityNumber\r\n1,Ali,Hasan,123456789\r\n")).toEqual(["123456789"]);
    expect(ids("code,firstName,familyName,idNumber\r\n7,Ali,Hasan,123456789\r\n")).toEqual(["123456789"]);
  });
  it("unchanged: a student-number column alone is still the identity, and wins over the weak «رقم» / id", () => {
    expect(ids("رقم,الاسم,اسم العائلة,رقم الطالب\r\n1,علي,حسن,123456789\r\n")).toEqual(["123456789"]);
    expect(ids("firstName,familyName,studentId\r\nAli,Hasan,123456789\r\n")).toEqual(["123456789"]);
  });
  it("unchanged: with two student-number columns and no identity column, the first one is the identity", () => {
    expect(ids("studentCode,firstName,familyName,studentId\r\n123456789,Ali,Hasan,5\r\n")).toEqual(["123456789"]);
  });
});

describe("QA2-25 invisible marks never decide a score-file name match", () => {
  it("a zero-width space, bidi marks or a BOM in the name compare equal to the roster name", () => {
    expect(importName("سارة​ خالد")).toBe(importName("سارة خالد"));
    expect(importName("‏منى‎ حسن﻿")).toBe("منى حسن");
  });
  it("unchanged: different names stay different; spaces still collapse", () => {
    expect(importName("سارة  خالد")).toBe("سارة خالد");
    expect(importName("سارة خالد")).not.toBe(importName("سارة حسن"));
  });
});
