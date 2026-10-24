// Phase L.7 — the build guard budgets the learning CONTENT chunks (gzip KB): the Reader's first-load graph, the course manifest
// chunk (the table of contents, found by the book's course-prefixed page ids), each learning visual group chunk and all visuals
// together. Measured on the L.6b build: 33.7 / 12.2 / 6.5 (largest) / 64.4 KB.
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LEARNING_BUDGETS_KB, findManifestChunks, learningContentFailures } from "./check-bundle-budget.mjs";

const temps = [];
afterAll(() => { for (const t of temps) fs.rmSync(t, { recursive: true, force: true }); });
function dist(chunks) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "l7-guard-"));
  temps.push(root);
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  for (const [file, text] of Object.entries(chunks)) fs.writeFileSync(path.join(root, "assets", file), text);
  return root;
}
const measured = { readerFirstLoad: 33.7, manifest: [{ file: "manifest-a.js", kb: 12.2 }], visuals: [{ file: "m28-a.js", kb: 6.5 }, { file: "m03-a.js", kb: 5.4 }, { file: "m17-a.js", kb: 3.7 }] };

describe("L.7 — learning content budgets", () => {
  it("the budgets leave room above the measured L.6b build, and the measured build passes", () => {
    expect(LEARNING_BUDGETS_KB).toEqual({ readerFirstLoad: 40, manifest: 15, visualGroup: 9, visualsTotal: 75 });
    expect(Object.isFrozen(LEARNING_BUDGETS_KB)).toBe(true);
    expect(learningContentFailures(measured)).toEqual([]);
  });
  it("each budget fails on its own, just above it; exactly at the budget passes", () => {
    expect(learningContentFailures({ ...measured, readerFirstLoad: 40 })).toEqual([]);
    expect(learningContentFailures({ ...measured, readerFirstLoad: 40.1 })).toEqual(["the Learning Reader's first-load graph is 40.1 KB gzip — over its 40 KB budget"]);
    expect(learningContentFailures({ ...measured, manifest: [{ file: "manifest-a.js", kb: 15.2 }] })).toEqual(["the course manifest chunk manifest-a.js is 15.2 KB gzip — over its 15 KB budget"]);
    expect(learningContentFailures({ ...measured, visuals: [{ file: "m28-a.js", kb: 9.3 }] })).toEqual(["the learning visual chunk m28-a.js is 9.3 KB gzip — over its 9 KB budget"]);
    const many = Array.from({ length: 10 }, (_, i) => ({ file: "v" + i + ".js", kb: 8 }));
    expect(learningContentFailures({ ...measured, visuals: many })).toEqual(["the learning visuals are 80.0 KB gzip together — over their 75 KB budget"]);
  });
  it("no manifest chunk at all is a failure (nothing would be measured)", () => {
    expect(learningContentFailures({ ...measured, manifest: [] })).toEqual(["no course manifest chunk was found (the table of contents must ship as its own lazy chunk)"]);
  });
  it("findManifestChunks: the chunks carrying course-prefixed page ids, in any quote style; module bodies' block ids are not a manifest", () => {
    const d = dist({
      "manifest-aaaaaaaa.js": 'const m={pages:[{id:"791381-m01-l01-p01"},{id:`791381-m28-l01-p01`}]};',
      "other-bbbbbbbb.js": "const p='791381-m02-l01-p03';",
      "body-cccccccc.js": 'const e={id:"m01-l01-p01-def"};',
      "plain-dddddddd.js": "const x=1;",
      "style-eeeeeeee.css": '.x{content:"791381-m01-l01-p01"}',
      "summary-ffffffff.js": 'const s={pages:[{id:"791381s-m01-l01-p01"}]};',
      "body-gggggggg.js": 'const e={id:"m01-l00-p01-opener"};',
    });
    expect(findManifestChunks(d)).toEqual(["manifest-aaaaaaaa.js", "other-bbbbbbbb.js", "summary-ffffffff.js"]);
  });
});
