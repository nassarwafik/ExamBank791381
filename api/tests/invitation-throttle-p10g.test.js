import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-G — invitation links are never blocked by someone else's flood (closes security review O7; design
// docs/enterprise-invitation-throttle-p10g.md, owner decision §19.44). The limit used to be ONE platform-wide bucket keyed on the
// fixed id "teacher-invitation", so 200 random links from rotating addresses blocked every teacher's real link. Now: a malformed
// link is a 404 with no storage work; an unknown / used / expired link counts on the SENDER's miss limit only; a valid link has
// its own limit that only its holder can fill. The real throttle (login-throttle.js) runs over the in-memory container with real
// CAS semantics. TEST data only.

process.env.BANK_SETUP_KEY = "p10g-test-root-secret";

const { handler: invitation } = await import("../src/functions/teacher-invitation.js");
const accounts = await import("../src/lib/identity/teacher-accounts.js");
const { THROTTLE_PREFIX } = await import("../src/lib/login-throttle.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const T0 = Date.parse("2026-11-06T09:00:00.000Z");
const PASSWORD = "a strong teacher passphrase";
const randomLink = () => crypto.randomBytes(32).toString("base64url");
const req = (action, body) => ({ method: "POST", params: { action }, headers: { get: () => null }, json: async () => body });

function setup() {
  const mem = createMemoryContainer();
  const clock = { now: T0 };
  let ip = "10.0.0.1";
  const deps = { getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, clientIdFromRequest: () => ip };
  const invite = (id, username) => {
    const { token, record } = accounts.newInvitation("setup", clock.now);
    mem.setJson(accounts.teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: "معلم", status: "invited", invitation: record, authVersion: 1, sessions: [] });
    mem.setJson(accounts.invitationName(token), { schemaVersion: 1, accountId: id });
    return token;
  };
  const call = (action, body, from = "10.9.9.9") => { ip = from; return invitation(req(action, body), deps); };
  const throttleBlobs = () => mem.names(THROTTLE_PREFIX).length;
  return { mem, clock, deps, invite, call, throttleBlobs };
}

/** An attacker floods random well-formed links from rotating addresses (the old platform-wide bucket trips at 200). */
async function flood(ctx, n = 230) {
  for (let i = 0; i < n; i++) await ctx.call(i % 2 ? "inspect" : "accept", { token: randomLink(), password: PASSWORD }, "10.66." + Math.floor(i / 200) + "." + (i % 200 + 1));
}

describe("P10-G a flood of random links never blocks a teacher's real link (O7)", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("fail-first: after a flood of random links, the teacher's real link still inspects and accepts (baseline: 429)", async () => {
    const token = ctx.invite("t_00000000000000c1", "ms.salma");
    await flood(ctx);
    const seen = await ctx.call("inspect", { token });
    expect(seen.status).toBe(200);
    expect(seen.jsonBody.username).toBe("ms.salma");
    const ok = await ctx.call("accept", { token, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ctx.mem.getJson(accounts.teacherAccountName("t_00000000000000c1")).status).toBe("active");
  }, 60000);

  it("a malformed link answers 404 with no storage work at all (no throttle blob is written)", async () => {
    const before = ctx.throttleBlobs();
    for (const token of ["short", "x".repeat(44), "has spaces in it and is the right length....", "a/b"]) {
      const r = await ctx.call("inspect", { token });
      expect(r.status).toBe(404);
      expect(r.jsonBody.code).toBe("INVITATION_INVALID");
    }
    expect(ctx.throttleBlobs()).toBe(before);
  });

  it("unknown links count on the SENDER's miss limit only: 404 … then 429 for that sender, while another teacher's link is untouched", async () => {
    const token = ctx.invite("t_00000000000000c2", "mr.omar");
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await ctx.call("inspect", { token: randomLink() }, "10.5.5.5")).status);
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses[5]).toBe(429);
    expect((await ctx.call("inspect", { token }, "10.6.6.6")).status).toBe(200);
  });

  it("a valid link has its own limit: hammering one teacher's link never limits another teacher's link", async () => {
    const a = ctx.invite("t_00000000000000c3", "ms.huda");
    const b = ctx.invite("t_00000000000000c4", "mr.sami");
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await ctx.call("accept", { token: a, password: "weak" }, "10.7.7.7")).status);
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses).toContain(429);
    expect((await ctx.call("inspect", { token: b }, "10.7.7.7")).status).toBe(200);
  });

  it("a successful accept clears its link's limit; the used link then answers the plain 404", async () => {
    const token = ctx.invite("t_00000000000000c5", "ms.rana");
    for (let i = 0; i < 4; i++) expect((await ctx.call("accept", { token, password: "weak" })).status).toBe(400);
    expect((await ctx.call("accept", { token, password: PASSWORD })).status).toBe(200);
    const linkBuckets = ctx.mem.names(THROTTLE_PREFIX).filter(n => {
      const doc = ctx.mem.getJson(n);
      return doc && Number(doc.attempts) >= 4;
    });
    expect(linkBuckets).toEqual([]);
    const again = await ctx.call("inspect", { token });
    expect(again.status).toBe(404);
    expect(again.jsonBody.code).toBe("INVITATION_INVALID");
  });

  it("storage down → 503 (never a free pass)", async () => {
    const r = await invitation(req("inspect", { token: randomLink() }), { ...ctx.deps, getContainer: () => { throw new Error("down"); } });
    expect(r.status).toBe(503);
  });
});
