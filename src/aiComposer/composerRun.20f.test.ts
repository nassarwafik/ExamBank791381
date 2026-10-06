import { describe, it, expect } from "vitest";
import { runGeneration, runModify, newComposerNonce, type ComposerTransport } from "./composerRun";
import { COMPOSER_LIMITS } from "./composerLimits";
import { COMPOSER_FIXTURES } from "./testing/composerFixtures";

// Phase 20F — the client orchestration: bounded repairs (never more than COMPOSER_LIMITS.repairAttempts), cancellation discards everything,
// failures are classified for the teacher (provider / timeout / rate limit / invalid response / validation), the staged result is
// re-verified locally (a tampered server section never becomes a ready exam). Fail-first on 20d5a48 (module absent).
const A = COMPOSER_FIXTURES[0];
const noop = () => {};
describe("20F-RUN client orchestration", () => {
  it("repairs are bounded: a server that keeps refusing gets exactly 1 + repairAttempts calls, then a validation failure", async () => {
    const bodies: Record<string, unknown>[] = [];
    const t: ComposerTransport = async body => { bodies.push(body); return { ok: false, code: "PLAN_INVALID", issues: [{ code: "PLAN_TOTAL_MISMATCH", message: "x" }], draft: { bad: true } }; };
    const r = await runGeneration(t, A.intent, { examId: "E", report: noop });
    expect(r).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(bodies.length).toBe(1 + COMPOSER_LIMITS.repairAttempts);
    expect(bodies.map(b => b.attempt)).toEqual([0, 1, 2]);
    expect(bodies[1].previous).toEqual({ bad: true });
    // the same bound holds for a section stage and a modify stage (never a 4th call)
    const mod: Record<string, unknown>[] = [];
    const tm: ComposerTransport = async body => { mod.push(body); return { ok: false, code: "PATCH_INVALID", issues: [], draft: { n: mod.length } }; };
    expect(await runModify(tm, { exam: { examId: "E", title: "t", sections: [] }, mode: "modifyExam", scope: { kind: "exam" }, instruction: "x", report: noop })).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(mod.map(b => b.attempt)).toEqual([0, 1, 2]);
    expect(mod[2].previous).toEqual({ n: 2 });
  });
  it("failures are classified (provider / timeout / rate limit / malformed), never a generic error", async () => {
    const one = (body: Record<string, unknown>) => (async () => body) as ComposerTransport;
    expect((await runGeneration(one({ ok: false, code: "AI_PROVIDER_FAILED", error: "x" }), A.intent, { examId: "E", report: noop }) as { failure: { kind: string } }).failure.kind).toBe("provider");
    expect((await runGeneration(one({ ok: false, code: "AI_TIMEOUT", error: "x" }), A.intent, { examId: "E", report: noop }) as { failure: { kind: string } }).failure.kind).toBe("timeout");
    expect((await runGeneration(one({ ok: false, code: "RATE_LIMITED", error: "x" }), A.intent, { examId: "E", report: noop }) as { failure: { kind: string } }).failure.kind).toBe("rateLimited");
    expect((await runGeneration(one({ ok: false, code: "AI_RESPONSE_MALFORMED", issues: [] }), A.intent, { examId: "E", report: noop }) as { failure: { kind: string } }).failure.kind).toBe("invalidResponse");
  });
  it("an HTTP error rejection carrying its JSON body (the App request helper) is read as the composer's answer", async () => {
    const t: ComposerTransport = async () => { throw Object.assign(new Error("HTTP 429"), { status: 429, payload: { ok: false, code: "RATE_LIMITED", error: "x" } }); };
    expect(await runGeneration(t, A.intent, { examId: "E", report: noop })).toMatchObject({ ok: false, failure: { kind: "rateLimited" } });
    const bare: ComposerTransport = async () => { throw new Error("network down"); };
    expect(await runGeneration(bare, A.intent, { examId: "E", report: noop })).toMatchObject({ ok: false, failure: { kind: "provider" } });
  });
  it("cancellation (abort) yields a cancelled outcome and stages nothing", async () => {
    const ctl = new AbortController();
    const t: ComposerTransport = (_b, signal) => new Promise((_res, rej) => signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const p = runGeneration(t, A.intent, { examId: "E", report: noop, signal: ctl.signal });
    ctl.abort();
    expect(await p).toMatchObject({ ok: false, failure: { kind: "cancelled" } });
  });
  it("a tampered staged plan / patch from the server is not trusted", async () => {
    const t: ComposerTransport = async () => ({ ok: true, plan: {}, planRaw: { sections: [] } });
    expect(await runGeneration(t, A.intent, { examId: "E", report: noop })).toMatchObject({ ok: false, failure: { kind: "invalidResponse" } });
    const m: ComposerTransport = async () => ({ ok: true, patch: { v: 1, baseRevision: "latest", mode: "modifyExam", scope: { kind: "exam" }, summary: "", operations: [] } });
    expect(await runModify(m, { exam: { examId: "E", title: "t", sections: [] }, mode: "modifyExam", scope: { kind: "exam" }, instruction: "x", report: noop })).toMatchObject({ ok: false, failure: { kind: "invalidResponse" } });
  });
  it("stage reports are meaningful named stages, never fake percentages", async () => {
    const stages: string[] = [];
    const t: ComposerTransport = async () => ({ ok: false, code: "AI_PROVIDER_FAILED" });
    await runGeneration(t, A.intent, { examId: "E", report: (_n, s) => stages.push(s) });
    expect(stages).toEqual(["تحليل طلب الامتحان", "إنشاء خطة الامتحان"]);
    expect(stages.join(" ")).not.toMatch(/%/);
    expect(newComposerNonce()).toMatch(/^[a-z0-9]{6,16}$/);
  });
});
