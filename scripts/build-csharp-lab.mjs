#!/usr/bin/env node
// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md) — publish the lab (tools/csharp-lab: Roslyn on .NET WebAssembly)
// and place it where the site serves it: public/csharp-lab/ (git-ignored), which Vite copies into dist/csharp-lab/.
//   node scripts/build-csharp-lab.mjs [--out <dir>]     (needs the .NET 10 SDK on PATH)
// Run by the deploy job BEFORE the Static Web Apps build (azure-static-web-apps-*.yml) and by the lab's own CI job, which then proves
// the very files in Chromium (csharp-lab.yml → tools/csharp-lab/smoke.mjs). Without it the site simply has no lab: the teacher's
// editor says the lab is unavailable and nothing else changes.
// Copies only what the page can load (the bridge page, its two scripts and _framework/); never pre-compressed copies, symbols or the
// course library (the book's classes are course content and come from the API, a teacher session only).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = path.join(repo, "tools", "csharp-lab");
const argOut = process.argv.indexOf("--out");
const target = path.resolve(argOut > 0 ? process.argv[argOut + 1] : path.join(repo, "public", "csharp-lab"));
export const REQUIRED = ["index.html", "bridge.js", "lab-worker.js", "_framework/dotnet.js", "_framework/dotnet.native.wasm", "_framework/CSharpLab.wasm", "_framework/Microsoft.CodeAnalysis.CSharp.wasm"];
const SKIP = /\.(br|gz|pdb|map)$/i;

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lab-"));
try {
  execFileSync("dotnet", ["publish", project, "-c", "Release", "-o", staging, "--nologo"], { stdio: "inherit", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1" } });
  const wwwroot = path.join(staging, "wwwroot");
  for (const f of REQUIRED) if (!fs.existsSync(path.join(wwwroot, f))) throw new Error("the published lab has no " + f);
  fs.rmSync(target, { recursive: true, force: true });
  let files = 0, bytes = 0;
  (function copy(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, e.name), dst = path.join(to, e.name);
      if (e.isDirectory()) copy(src, dst);
      else if (e.isFile() && !SKIP.test(e.name)) { fs.copyFileSync(src, dst); files++; bytes += fs.statSync(src).size; }
    }
  })(wwwroot, target);
  console.log("C# lab → " + path.relative(repo, target) + ": " + files + " files, " + (bytes / 1024 / 1024).toFixed(1) + " MB");
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
