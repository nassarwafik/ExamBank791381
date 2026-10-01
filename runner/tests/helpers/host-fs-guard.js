"use strict";
// Test helper — an OWNERSHIP-SCOPED host-filesystem proof for the gateway process.
//
// RF7 used to diff the whole of os.tmpdir() before / after a batch of real-Docker runs and treat every new entry as the
// runner's. On a shared GitHub Actions host that assumption is false: systemd / apport, Docker and GitHub's own runner create
// temp entries while the suite runs (main run 36840521927 failed on a `systemd-private-…-apport-coredump-hook@…` directory
// that no SmartAssess code created). What the runner can actually own is what ITS OWN PROCESS does, so this guard records
// every call this process makes to a host-filesystem write / temp API (plus os.tmpdir) while installed. The gateway's compile
// artifact must stay an in-memory value between the two sandbox invocations (runner/gateway/sandbox.js), so a correct gateway
// produces ZERO records; one that starts spilling artifacts to host files produces records with a stack trace.
//
// Install it BEFORE requiring the module under test so even destructured references (`const { writeFileSync } = require("fs")`)
// resolve to the wrapped functions. `node:fs` / `fs` and `node:os` / `os` are the same module objects.
const fs = require("node:fs");
const os = require("node:os");

const { O_WRONLY, O_RDWR, O_CREAT, O_APPEND, O_TRUNC } = fs.constants;

/** True when `flags` (fs.open / fs.openSync / fs.promises.open second argument) can create or modify a file. */
function isWriteFlag(flags) {
  if (flags === undefined || flags === null) return false;                       // default "r"
  if (typeof flags === "number") return (flags & (O_WRONLY | O_RDWR | O_CREAT | O_APPEND | O_TRUNC)) !== 0;
  return /[wa+]/.test(String(flags));
}

const notStdio = args => !(Number.isInteger(args[0]) && args[0] <= 2);          // fd-level writes to stdout / stderr are output, not files

const FS_WRITE_APIS = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream", "mkdtemp", "mkdtempSync", "mkdir", "mkdirSync",
  "copyFile", "copyFileSync", "rename", "renameSync", "symlink", "symlinkSync", "link", "linkSync", "truncate", "truncateSync", "rm", "rmSync", "unlink", "unlinkSync"];
const FS_FD_WRITE_APIS = ["write", "writeSync", "writev", "writevSync"];
const PROMISE_WRITE_APIS = ["writeFile", "appendFile", "mkdtemp", "mkdir", "copyFile", "rename", "symlink", "link", "truncate", "rm", "unlink"];

const describeArg = a => (typeof a === "string" || typeof a === "number") ? String(a) : (a && a.constructor && a.constructor.name) || typeof a;

/** Wraps the write / temp APIs of `fs`, `fs.promises` and `os.tmpdir`. Returns { calls, reset, restore, summary }. */
function installHostWriteGuard() {
  const calls = [], restores = [];
  const wrap = (target, name, label, accept) => {
    const original = target[name];
    if (typeof original !== "function") return;
    target[name] = function guarded(...args) {
      if (!accept || accept(args)) calls.push({ api: label, args: args.slice(0, 2).map(describeArg), stack: new Error().stack.split("\n").slice(2, 8).join("\n") });
      return original.apply(this, args);
    };
    restores.push(() => { target[name] = original; });
  };
  for (const n of FS_WRITE_APIS) wrap(fs, n, "fs." + n);
  for (const n of FS_FD_WRITE_APIS) wrap(fs, n, "fs." + n, notStdio);
  for (const n of ["open", "openSync"]) wrap(fs, n, "fs." + n, a => isWriteFlag(a[1]));
  const promises = fs.promises;
  for (const n of PROMISE_WRITE_APIS) wrap(promises, n, "fs.promises." + n);
  wrap(promises, "open", "fs.promises.open", a => isWriteFlag(a[1]));
  wrap(os, "tmpdir", "os.tmpdir");
  return {
    calls,
    reset() { calls.length = 0; },
    restore() { while (restores.length) restores.pop()(); },
    /** Human-readable list for assertion messages: "fs.writeFileSync(/tmp/x, Buffer)". */
    summary() { return calls.map(c => c.api + "(" + c.args.join(", ") + ")"); }
  };
}

module.exports = { installHostWriteGuard, isWriteFlag };
