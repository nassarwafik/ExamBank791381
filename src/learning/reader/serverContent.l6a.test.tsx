// @vitest-environment happy-dom
// Phase L.6a — end to end over the REAL server: the Reader reads a module body through the app's transport
// (moduleBodySource.server) and the REAL /api/learning-content handler over an in-memory class. A published module opens; a
// hidden one is refused BY THE SERVER even when the client-side restriction is bypassed (the unrestricted content API).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { loadCourseManifest, hasModuleContent } from "../content/registry";
import { loadModuleBody } from "../content/moduleBodySource.server";
import type { ReaderContentApi } from "./readerContentApi";
// @ts-expect-error — the API handler and fixture are untyped CommonJS modules, used here on purpose to run the real server.
import { handler } from "../../../api/src/functions/learning-content.js";
import { createMemoryContainer } from "../../../api/tests/fixtures/memory-container.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const M01 = "791381-m01", M02 = "791381-m02";
const SLOW = { timeout: 10000 };

function realServer(visible: string[]) {
  const ctx = createMemoryContainer({
    "platform/users/u1.json": { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA" },
    "platform/classes/cA.json": { classId: "cA", status: "active", active: true, learningMaterials: [{ courseId: "791381", visibleModuleIds: visible }] },
  });
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input), headers = ((init as RequestInit)?.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    const [, , , courseId, moduleId] = url.split("/").map(decodeURIComponent);
    const r = await handler({ method: "GET", headers: { get: (k: string) => headers[k] ?? null }, params: { courseId, moduleId } }, {
      requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }),
      requireStudentAuth: () => (headers["x-student-token"] === "s" ? { ok: true, user: { sub: "u1", sv: 1, role: "student" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }),
      container: ctx.container, getContainer: () => ctx.container,
    });
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  });
  return calls;
}
const api = (headers: Record<string, string>): ReaderContentApi => ({ loadManifest: loadCourseManifest, hasModule: hasModuleContent, loadModule: (c, m) => loadModuleBody(c, m, headers) });

describe("L.6a — the Reader over the real content API", () => {
  it("a published module opens; its body came from the server with the student's session", async () => {
    const calls = realServer([M01]);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api({ "x-student-token": "s" })} initialModuleId={M01} />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await waitFor(() => expect(document.querySelector(".learning-reader-page.is-opener")).not.toBeNull(), SLOW);   // the body is rendered
    expect(calls.map(c => c.url)).toEqual(["/api/learning-content/791381/" + M01]);
    expect(calls[0].headers).toEqual({ "x-student-token": "s" });
  });

  it("a hidden module is refused by the server even when the client-side restriction is bypassed", async () => {
    const calls = realServer([M01]);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api({ "x-student-token": "s" })} initialModuleId={M02} />);
    await screen.findByText("تعذّر تحميل هذه الصفحة", undefined, SLOW);
    expect(calls.map(c => c.url)).toEqual(["/api/learning-content/791381/" + M02]);
    expect(document.querySelector(".learning-reader-page.is-opener")).toBeNull();                         // nothing of m02's body rendered
  });

  it("without a session nothing is served", async () => {
    realServer([M01]);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api({})} initialModuleId={M01} />);
    await screen.findByText("تعذّر تحميل هذه الصفحة", undefined, SLOW);
  });
});
