#!/usr/bin/env node
// Python lab spike (docs/enterprise-python-lab-spike.md) — fetches the pinned Pyodide release (tools/python-lab/pyodide.json) from the
// npm registry, REFUSES it unless its sha512 equals the pinned integrity, and places only the runtime files the lab needs in
// <out>/pyodide/. Nothing is executed from the archive here. Usage: node tools/python-lab/fetch-pyodide.mjs <wwwroot-dir> [tarball]
// (an optional local tarball is checked the same way).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const here = path.dirname(new URL(import.meta.url).pathname);
const pin = JSON.parse(fs.readFileSync(path.join(here, "pyodide.json"), "utf8"));
const out = process.argv[2];
if (!out) { console.error("usage: fetch-pyodide.mjs <wwwroot-dir> [tarball]"); process.exit(2); }

let bytes;
if (process.argv[3]) bytes = fs.readFileSync(process.argv[3]);
else {
  const res = await fetch(pin.tarball, { redirect: "error" });
  if (!res.ok) { console.error("download failed: " + res.status); process.exit(1); }
  bytes = Buffer.from(await res.arrayBuffer());
}
const integrity = "sha512-" + crypto.createHash("sha512").update(bytes).digest("base64");
if (integrity !== pin.integrity) { console.error("INTEGRITY MISMATCH: got " + integrity + ", pinned " + pin.integrity); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pyodide-"));
const tgz = path.join(tmp, "pyodide.tgz");
fs.writeFileSync(tgz, bytes);
execFileSync("tar", ["-xzf", tgz, "-C", tmp, ...pin.files.map(f => "package/" + f)]);
const dest = path.join(out, "pyodide");
fs.mkdirSync(dest, { recursive: true });
for (const f of pin.files) fs.copyFileSync(path.join(tmp, "package", f), path.join(dest, f));
fs.rmSync(tmp, { recursive: true, force: true });
console.log("pyodide " + pin.version + " (" + integrity.slice(0, 20) + "…) → " + dest + ": " + pin.files.join(", "));
