import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/ai-exam-composer.js";
import { COMPOSER_FIXTURES } from "../../src/aiComposer/testing/composerFixtures";

// Phase 20F — Review Fix 2 (fresh re-review of 4799542): judging a client-echoed `previous` draft is CPU work, so it is charged to the
// teacher's rate-limit budget BEFORE it runs (one reservation per request), and a refused reservation means no judging at all.
// Fail-first on 4799542 (the previous draft was judged before the reservation, which a valid draft never reached).
const req = body => ({ json: async () => body });
const NET = COMPOSER_FIXTURES[0];
function deps(allowed) {
  const reserved = [], calls = [];
  return { reserved, calls, d: { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), callTextJson: async x => { calls.push(x); throw new Error("no provider in this test"); }, reserveComposerCall: async (_c, t) => { reserved.push(t); return { allowed, retryAfterSeconds: 60 }; }, container: null } };
}
describe("20F-RF2 N-M1 a client-echoed previous draft is charged before it is judged", () => {
  it("a valid previous plan: accepted without a provider call, but ONE reservation was made", async () => {
    const x = deps(true);
    const r = await handler(req({ stage: "plan", intent: NET.intent, previous: NET.plan, attempt: 1 }), x.d);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(x.reserved).toEqual(["teacher-1"]); expect(x.calls.length).toBe(0);
  });
  it("PIN (already true on 4799542): rate limited → 429, no issues and no provider call", async () => {
    const x = deps(false);
    const r = await handler(req({ stage: "plan", intent: NET.intent, previous: { not: "a plan" }, attempt: 1 }), x.d);
    expect(r.status).toBe(429); expect(r.jsonBody.issues).toBeUndefined(); expect(x.calls.length).toBe(0);
  });
});
