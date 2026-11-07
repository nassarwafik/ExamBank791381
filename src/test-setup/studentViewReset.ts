// UX-S2 (docs/enterprise-ux-student-s2.md) — every test starts on «اليوم»: a student-view link one test opened (#/s/<view>, written
// with history.pushState by the portal) must not reach the next test of the same file. Only a student-view hash is removed; any
// other location is left exactly as it is.
import { beforeEach } from "vitest";
import { isStudentViewHash } from "../student/portalViews";

beforeEach(() => {
  if (typeof window === "undefined" || !window.location) return;
  if (isStudentViewHash(window.location.hash)) window.history.replaceState(null, "", window.location.pathname + window.location.search);
});
