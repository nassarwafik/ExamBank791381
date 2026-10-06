import { describe, it, expect } from "vitest";
import { evaluateComposerBucket, reserveComposerCall, AI_COMPOSER_BUDGET, AI_COMPOSER_WINDOW_SECONDS } from "../src/lib/ai-composer-rate-limit.js";

// Phase 20F — the per-teacher distributed token bucket of the AI composer (same mechanism as the coding-run limiter).
describe("20F-RL composer rate limit", () => {
  it("allows the budget, then refuses with a real Retry-After; refills continuously; a clock behind never refills", () => {
    let s = null, now = 1_000_000;
    for (let i = 0; i < AI_COMPOSER_BUDGET; i++) { const r = evaluateComposerBucket(s, now); expect(r.allowed).toBe(true); s = r.next; }
    const no = evaluateComposerBucket(s, now);
    expect(no.allowed).toBe(false);
    expect(no.retryAfterSeconds).toBe(Math.ceil(AI_COMPOSER_WINDOW_SECONDS / AI_COMPOSER_BUDGET));
    expect(evaluateComposerBucket(s, now + (AI_COMPOSER_WINDOW_SECONDS / AI_COMPOSER_BUDGET) * 1000).allowed).toBe(true);
    expect(evaluateComposerBucket(s, now - 999_999).allowed).toBe(false);
  });
  it("reserves through the platform CAS helper under a hashed name (no teacher identity in blob names)", async () => {
    const names = [];
    const r = await reserveComposerCall({}, "teacher@example.com", { mutateJsonWithRetry: async (_c, name, fn) => { names.push(name); fn(null); }, now: () => 5 });
    expect(r.allowed).toBe(true);
    expect(names[0]).toMatch(/^platform\/throttle\/ai-composer-[0-9a-f]{64}\.json$/);
    expect(names[0]).not.toMatch(/teacher|example/);
  });
});
