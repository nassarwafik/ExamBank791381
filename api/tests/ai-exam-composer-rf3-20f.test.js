import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handler } from "../src/functions/ai-exam-composer.js";
import * as F from "../../src/aiComposer/testing/composerFakeAi";

// Phase 20F — Review Fix 3 (fresh re-review of bd71428, MINOR-1): a valid client-echoed `previous` draft is judged ONCE (the judgement
// is reused for the reply), not judged and then re-judged. Observable through the clock seam: each dry-run apply of a patch reads `now`
// exactly once. Fail-first on bd71428 (two reads).
const here = path.dirname(fileURLToPath(import.meta.url));
const req = body => ({ json: async () => body });
describe("20F-RF3 a valid echoed draft is judged once", () => {
  it("modify: one dry-run apply for a valid previous patch", async () => {
    const exam = JSON.parse(fs.readFileSync(path.resolve(here, "../../docs/fixtures/presentation-20d1/A-classic-arabic.json"), "utf8"));
    let clockReads = 0;
    const d = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), callTextJson: async () => { throw new Error("no provider"); }, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => { clockReads++; return "2026-10-06T00:00:00.000Z"; } };
    const previous = F.patch([F.op("updateQuestionText", { questionId: "a-q1", text: "نص محسّن" })]);
    const r = await handler(req({ stage: "modify", exam, mode: "modifyExam", scope: { kind: "exam" }, instruction: "حسّن النص", nonce: "abc123", previous, attempt: 1 }), d);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(clockReads).toBe(1);
  });
});
