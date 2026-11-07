import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Tadris+ P9-B3 — owner decision D17 («400 يوم، بلا حذف آلي», blueprint §19.35; docs/operations-audit-retention.md): no code of the
// platform deletes an audit record. Every source file that deletes from storage is listed, and none of them may name an audit
// location (the teacher's `platform/audit/` or the owner's `platform/owner-audit/`); the audit writer itself has no delete at all.
// A later pruning tool needs a written plan and the owner's approval — and must change this test in that reviewed PR.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const walk = dir => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(p);
  return /\.(c|m)?js$/.test(e.name) && !/\.test\.(c|m)?js$/.test(e.name) ? [p] : [];
});
const DELETES = /\b(deleteBlob|deleteBlobConditional|deleteIfExists)\s*\(|\.delete\s*\(\s*\)|\bunlink(Sync)?\s*\(|\brmSync\s*\(/;
// an audit LOCATION (the prefixes or their paths); importing the writer to record events is not one
// Tadris+ O4 — the per-teacher pointers under platform/audit-index/ are audit records too (docs/enterprise-teacher-activity-log-o4.md).
const AUDIT = /AUDIT_PREFIX|AUDIT_INDEX_PREFIX|platform\/audit\/|platform\/audit-index\/|platform\/owner-audit\//;
// the platform's code and its operational scripts; certification tooling is not the platform (the `check-*` browser gates delete
// their own output folder and read in-memory test audits, the `mutate-*` campaigns name the prefixes inside planted defects)
const TOOLING = /[\\/]scripts[\\/](check-[^\\/]+|mutate-[^\\/]+)$/;
const sources = [...walk(join(ROOT, "api", "src")), ...walk(join(ROOT, "scripts")).filter(f => !TOOLING.test(f))];

describe("P9-B3 D17 — audit records are never deleted by the platform", () => {
  it("the audit writer has no delete: one immutable document per event", () => {
    const text = readFileSync(join(ROOT, "api/src/lib/audit-log.js"), "utf8");
    expect(text).not.toMatch(DELETES);
    expect(text).toMatch(/const AUDIT_PREFIX = "platform\/audit\/"/);
    expect(text).toMatch(/const OWNER_AUDIT_PREFIX = "platform\/owner-audit\/"/);
    expect(text).toMatch(/const AUDIT_INDEX_PREFIX = "platform\/audit-index\/"/);   // Tadris+ O4
  });
  it("no source file that deletes from storage refers to an audit location", () => {
    const deleters = sources.filter(f => DELETES.test(readFileSync(f, "utf8")));
    expect(deleters.length).toBeGreaterThan(0);                                         // the scan sees the real delete sites
    const offenders = deleters.filter(f => AUDIT.test(readFileSync(f, "utf8"))).map(f => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
  it("the retention record states the decision, and the operating contract points at it", () => {
    const doc = readFileSync(join(ROOT, "docs/operations-audit-retention.md"), "utf8");
    expect(doc).toContain("400 يوم");
    expect(doc).toContain("بلا حذف آلي");
    expect(readFileSync(join(ROOT, "AGENTS.md"), "utf8")).toContain("docs/operations-audit-retention.md");
  });
});
