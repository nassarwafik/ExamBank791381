import { describe, it, expect, vi } from "vitest";
import { extractRequestId, isUnexpectedStatus, trackingSuffix, withTrackingCode } from "./lib/requestTrace";

// Roadmap #9 — frontend correlation helper. A tracking code is shown ONLY for unexpected failures (5xx /
// network) that carry a correlation id; ordinary validation/auth responses stay clean, and the helper never
// writes anything to the console.
function resLike(status: number, requestId?: string) {
  const headers: Record<string, string> = {};
  if (requestId !== undefined) headers["x-request-id"] = requestId;
  return { status, headers: { get: (name: string) => headers[String(name).toLowerCase()] ?? null } };
}

describe("R9 requestTrace helper", () => {
  it("AA: extracts X-Request-ID from a 5xx response", () => {
    expect(extractRequestId(resLike(500, "abc-123_ID.4"))).toBe("abc-123_ID.4");
    expect(extractRequestId(resLike(500))).toBe("");           // header absent
    expect(extractRequestId(null)).toBe("");                    // no response (network error)
    expect(extractRequestId(resLike(500, "bad id\nwith ctrl"))).toBe(""); // malformed rejected
  });

  it("AB: an unexpected server error (5xx) appends a subtle tracking code", () => {
    const msg = withTrackingCode("تعذر تسجيل الدخول.", 500, resLike(500, "req-9"));
    expect(msg).toContain("تعذر تسجيل الدخول.");
    expect(msg).toContain("رمز التتبع: req-9");
  });

  it("AB: a network failure (status 0) with a stored response id still appends", () => {
    expect(isUnexpectedStatus(0)).toBe(true);
    expect(isUnexpectedStatus(503)).toBe(true);
  });

  it("AC: ordinary validation/auth responses do NOT append a tracking code", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(isUnexpectedStatus(status)).toBe(false);
      const msg = withTrackingCode("بيانات الدخول غير صحيحة.", status, resLike(status, "req-x"));
      expect(msg).toBe("بيانات الدخول غير صحيحة.");           // unchanged — no code
    }
  });

  it("AC: a 5xx without a request id leaves the message unchanged (nothing to show)", () => {
    expect(withTrackingCode("خطأ", 500, resLike(500))).toBe("خطأ");
  });

  it("AD: the helper never writes tokens/bodies (or anything) to the console", () => {
    const spies = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    withTrackingCode("m", 500, resLike(500, "req-1"));
    extractRequestId(resLike(500, "req-2"));
    trackingSuffix("req-3");
    for (const s of spies) { expect(s).not.toHaveBeenCalled(); s.mockRestore(); }
  });

  it("AE: base UI messages are preserved verbatim for expected paths (no redesign of copy)", () => {
    expect(withTrackingCode("رسالة", 200, resLike(200))).toBe("رسالة");
    expect(trackingSuffix("")).toBe("");
  });
});
