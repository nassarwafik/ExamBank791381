// Phase L.6a — the build guard refuses a build that ships a learning module body as a public asset (module bodies are served by
// /api/learning-content after the publication check). The signature is a block id of a book page in any quote style; the manifest's
// course-prefixed page ids are NOT a body.
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findModuleBodyChunks } from "./check-bundle-budget.mjs";

const temps = [];
afterAll(() => { for (const t of temps) fs.rmSync(t, { recursive: true, force: true }); });
function dist(chunks) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "l6a-guard-"));
  temps.push(root);
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  for (const [file, text] of Object.entries(chunks)) fs.writeFileSync(path.join(root, "assets", file), text);
  return root;
}

describe("L.6a — findModuleBodyChunks", () => {
  it("finds a module body in any quote style; ignores the manifest's page ids, other code and non-JS files", () => {
    const d = dist({
      "m01-aaaaaaaa.js": "const e={id:`m01-l01-p01-def`,type:`text`};export{e as default};",
      "m02-bbbbbbbb.js": 'const e={id:"m02-l03-p02-q1",type:"practice"};',
      "m03-cccccccc.js": "const e={id:'m03-l01-p01-a'};",
      "manifest-dddddddd.js": 'const m={pages:[{id:"791381-m01-l01-p01",title:"x"}]};',
      "m04-eeeeeeee.js": "const visual=()=>null;export{visual};",
      "style-ffffffff.css": '.x{content:"m01-l01-p01-def"}',
    });
    expect(findModuleBodyChunks(d)).toEqual(["m01-aaaaaaaa.js", "m02-bbbbbbbb.js", "m03-cccccccc.js"]);
  });
  it("a clean build has none", () => {
    expect(findModuleBodyChunks(dist({ "index-aaaaaaaa.js": 'import"./a.js";const p="791381-m28-l01-p01";' }))).toEqual([]);
  });
});
