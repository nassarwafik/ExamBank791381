import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { handler as classrooms } from "../src/functions/manage-classrooms.js";

// Tadris+ P5-B4 — FAIL-FIRST for a P5-B2 regression. P5-B2 moved the class edit and lifecycle into shared functions and the
// teacher route returned their promise WITHOUT awaiting it inside its try: an unexpected failure (storage down) then escaped the
// route's own catch — no longer the route's 500 answer «تعذر تنفيذ إجراء الصف حاليًا.» (it became an unhandled rejection).
// TEST data only.
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const boom = async () => { throw new Error("storage down"); };
const post = (deps, body) => classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => body }, deps);

describe("P5-B4 fail-first — a class edit / lifecycle failure is still the route's own 500 answer", () => {
  for (const [action, extra] of [["update", { name: "صف", grade: "11", schoolYear: "2026" }], ["archive", {}], ["unarchive", {}], ["graduateAndArchive", {}]]) {
    it(action + ": storage down → 500 with the route's message (never an escaped rejection)", async () => {
      const mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [] } });
      const deps = { ...AUTH, container: mem.container, getContainer: () => mem.container, mutateJsonWithRetry: boom, listJson: async () => [], recordAuditEvent: async () => {} };
      const r = await post(deps, { action, classId: "c1", ...extra });
      expect([r.status, r.jsonBody.error]).toEqual([500, "تعذر تنفيذ إجراء الصف حاليًا."]);
    });
  }
});
