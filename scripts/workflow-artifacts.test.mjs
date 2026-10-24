// Phase G-CI2 — a browser gate's artifact must hold its records and screenshots. `actions/upload-artifact@v4` leaves out hidden
// files and folders unless the step sets `include-hidden-files: true`, and every harness writes to a folder whose name starts
// with a dot (`.harness-l8/`, `.harness-u1/`, …). Without the setting the step only warns «No files were found» and the
// artifact is never created, so a red run leaves nothing to look at. This guard reads every workflow and fails when an
// upload step names a hidden path without the setting.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const files = readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort();

/** Every `actions/upload-artifact` step of a workflow: its paths and whether it includes hidden files. */
function uploadSteps(text) {
  const lines = text.split("\n");
  const steps = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)- uses: actions\/upload-artifact@/);
    if (!m) return;
    const indent = m[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() && l.search(/\S/) <= indent) break;
      body.push(l);
    }
    const paths = [];
    body.forEach((l, k) => {
      const p = l.match(/^\s+path:\s*(.*)$/);
      if (!p) return;
      if (p[1].trim() && p[1].trim() !== "|") { paths.push(p[1].trim()); return; }
      const own = l.search(/\S/);
      for (let n = k + 1; n < body.length && (!body[n].trim() || body[n].search(/\S/) > own); n++) if (body[n].trim()) paths.push(body[n].trim());
    });
    steps.push({ line: i + 1, paths, hidden: body.some(l => /^\s+include-hidden-files:\s*true\s*$/.test(l)) });
  });
  return steps;
}

const isHidden = p => p.split("/").some(seg => seg.startsWith(".") && seg !== "." && seg !== "..");

describe("workflow artifacts keep the harness folders", () => {
  const all = files.flatMap(f => uploadSteps(readFileSync(dir + f, "utf8")).map(s => ({ file: f, ...s })));

  it("the workflows have upload steps, and each one names what it uploads", () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const s of all) expect(s.paths.length, s.file + ":" + s.line).toBeGreaterThan(0);
  });

  it("every upload of a hidden path includes hidden files", () => {
    const missing = all.filter(s => s.paths.some(isHidden) && !s.hidden).map(s => s.file + ":" + s.line + " " + s.paths.join(", "));
    expect(missing).toEqual([]);
  });

  it("the guard reads a step the way upload-artifact does", () => {
    const sample = [
      "    steps:",
      "      - uses: actions/upload-artifact@v4",
      "        with:",
      "          name: a",
      "          path: .harness-a/",
      "      - uses: actions/upload-artifact@v4",
      "        with:",
      "          name: b",
      "          path: |",
      "            .harness-b/report.json",
      "            out/b/",
      "          include-hidden-files: true",
      "      - uses: actions/upload-artifact@v4",
      "        with:",
      "          path: artifacts/c.json",
    ].join("\n");
    expect(uploadSteps(sample).map(s => [s.paths, s.hidden])).toEqual([
      [[".harness-a/"], false],
      [[".harness-b/report.json", "out/b/"], true],
      [["artifacts/c.json"], false],
    ]);
    expect([".harness-a/", "out/.cache/x", "artifacts/c.json", "./out"].map(isHidden)).toEqual([true, true, false, false]);
  });
});
