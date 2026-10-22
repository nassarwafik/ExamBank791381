// @vitest-environment happy-dom
// Batch 5 (F1/F2) — teacherFetch / userFacingErrors: what reaches a teacher or a student is Arabic, and a 401 announces the
// expired session exactly once.
import { describe, it, expect, vi, afterEach } from "vitest";
import { teacherFetchJson, TeacherHttpError, TEACHER_SESSION_EXPIRED_EVENT, SESSION_EXPIRED_TEXT } from "./teacherFetch";
import { NETWORK_ERROR_TEXT, SERVER_UNAVAILABLE_TEXT, UNEXPECTED_RESPONSE_TEXT, errorText, userFacingMessage } from "./userFacingErrors";

const respond = (status: number, body: unknown, raw = false) => vi.fn(async () => ({
  ok: status >= 200 && status < 300, status, headers: new Headers(),
  json: async () => { if (raw) throw new SyntaxError("Unexpected token '<'"); return body; }
}) as unknown as Response);
afterEach(() => { vi.restoreAllMocks(); });

describe("teacherFetchJson", () => {
  it("sends the token on both headers and JSON content type; a binary body keeps its own", async () => {
    const f = respond(200, { ok: true });
    globalThis.fetch = f as unknown as typeof fetch;
    await teacherFetchJson("tk", "/api/x");
    let h = new Headers((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect([h.get("x-builder-token"), h.get("Authorization"), h.get("Content-Type")]).toEqual(["tk", "Bearer tk", "application/json"]);
    await teacherFetchJson("tk", "/api/up", { method: "POST", body: new ArrayBuffer(4), headers: { "x-file-name": "a" } });
    h = new Headers((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers);
    expect(h.get("Content-Type")).toBeNull();
    expect(h.get("x-file-name")).toBe("a");
  });

  it("a 401 announces the expired session once and fails with the Arabic text (never «Unauthorized»)", async () => {
    globalThis.fetch = respond(401, { error: "Unauthorized" }) as unknown as typeof fetch;
    const heard = vi.fn();
    window.addEventListener(TEACHER_SESSION_EXPIRED_EVENT, heard);
    try {
      await expect(teacherFetchJson("tk", "/api/x")).rejects.toMatchObject({ message: SESSION_EXPIRED_TEXT, status: 401 });
      expect(heard).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener(TEACHER_SESSION_EXPIRED_EVENT, heard); }
  });

  it("a non-JSON 401 still announces the expired session", async () => {
    globalThis.fetch = respond(401, null, true) as unknown as typeof fetch;
    const heard = vi.fn();
    window.addEventListener(TEACHER_SESSION_EXPIRED_EVENT, heard);
    try { await expect(teacherFetchJson("tk", "/api/x")).rejects.toBeInstanceOf(TeacherHttpError); expect(heard).toHaveBeenCalledTimes(1); }
    finally { window.removeEventListener(TEACHER_SESSION_EXPIRED_EVENT, heard); }
  });

  it("messages: Arabic server text passes; English or missing text becomes the Arabic fallback; 5xx and HTML bodies are Arabic", async () => {
    globalThis.fetch = respond(409, { error: "تم تعديل السؤال في مكان آخر." }) as unknown as typeof fetch;
    await expect(teacherFetchJson("tk", "/api/x")).rejects.toMatchObject({ message: "تم تعديل السؤال في مكان آخر." });
    globalThis.fetch = respond(400, { error: "classId and postId are required." }) as unknown as typeof fetch;
    await expect(teacherFetchJson("tk", "/api/x", {}, "تعذر الحفظ.")).rejects.toMatchObject({ message: "تعذر الحفظ." });
    globalThis.fetch = respond(502, null, true) as unknown as typeof fetch;
    await expect(teacherFetchJson("tk", "/api/x")).rejects.toMatchObject({ message: SERVER_UNAVAILABLE_TEXT });
    globalThis.fetch = respond(200, null, true) as unknown as typeof fetch;
    await expect(teacherFetchJson("tk", "/api/x")).rejects.toMatchObject({ message: UNEXPECTED_RESPONSE_TEXT });
  });

  it("a dropped connection is the Arabic connection text; a cancelled request stays an AbortError", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(teacherFetchJson("tk", "/api/x")).rejects.toMatchObject({ message: NETWORK_ERROR_TEXT, status: 0 });
    globalThis.fetch = vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as unknown as typeof fetch;
    await expect(teacherFetchJson("tk", "/api/x")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("userFacingErrors", () => {
  it("errorText keeps an Arabic message and replaces browser / parser / English text", () => {
    expect(errorText(new Error("تعذر فتح الواجب."), "x")).toBe("تعذر فتح الواجب.");
    expect(errorText(new TypeError("Failed to fetch"), "بديل")).toBe("بديل");
    expect(errorText("not an error", "بديل")).toBe("بديل");
    expect(userFacingMessage(undefined, 503, "x")).toBe(SERVER_UNAVAILABLE_TEXT);
    expect(userFacingMessage("Bad Request", 400, "بديل")).toBe("بديل");
  });
});
