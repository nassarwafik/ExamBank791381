import { describe, it, expect } from "vitest";
import { validateStructuredExam } from "../examQuality";
import { evaluateExamFinalization } from "../examFinalization";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { createRequire } from "node:module";
const serverFin = createRequire(import.meta.url)("../../api/src/lib/shared-finalization/examFinalization.js");

// Phase 20F — the two seams the composer adds to EXISTING authorities (behavioral fail-first on 20d5a48, which has neither):
//   1. an unresolved AI image request (`assetRequest`) BLOCKS finalization — client and server (shared build) identically;
//   2. the student sanitizer strips the request and the teacher-only composer metadata (coverage / authoring history).
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => Record<string, unknown> }).sanitizeExamForStudent;
const serverEvaluate = (serverFin as unknown as { evaluateExamFinalization: (e: unknown) => { canFinalize: boolean; structuralErrors: { code: string }[] } }).evaluateExamFinalization;
const exam = (q: Record<string, unknown>) => ({ examId: "E", title: "t", metadata: { aiComposer: { v: 1, catalog: "AI_COMPOSER_CATALOG_V1", coverage: [{ questionId: "q1", topic: "VLAN", difficulty: "easy" }], history: [{ at: "t", mode: "generate", summary: "s", baseRevision: "rev1-0000000000000000", status: "applied", operations: 0, warnings: 0 }] } }, sections: [{ id: "s", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "أي جهاز في الصورة؟", marks: 2, options: [{ text: "راوتر" }, { text: "سويتش" }], answer: { correctOptionIndex: 0 }, ...q }] }] });
describe("20F-SEAM existing authorities", () => {
  it("an unresolved image request blocks finalization (client and server shared build), and is gone once removed", () => {
    const withReq = exam({ assetRequest: { v: 1, description: "صورة راوتر" } });
    expect(validateStructuredExam(withReq as never).filter(i => i.severity === "error").map(i => i.code)).toEqual(["AI_ASSET_REQUEST_UNRESOLVED"]);
    expect(evaluateExamFinalization(withReq as never).canFinalize).toBe(false);
    expect(serverEvaluate(withReq).canFinalize).toBe(false);
    expect(serverEvaluate(withReq).structuralErrors.map(i => i.code)).toEqual(["AI_ASSET_REQUEST_UNRESOLVED"]);
    expect(evaluateExamFinalization(exam({}) as never).canFinalize).toBe(true);
  });
  it("the student payload carries neither the image request nor the composer's coverage / history metadata", () => {
    const out = sanitize(exam({ assetRequest: { v: 1, description: "صورة راوتر" } }));
    const s = JSON.stringify(out);
    expect(s).not.toMatch(/assetRequest|aiComposer|صورة راوتر|AI_COMPOSER_CATALOG_V1/);
  });
});
