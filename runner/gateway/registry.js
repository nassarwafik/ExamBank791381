"use strict";
// Phase 17B — the gateway's DATA-DRIVEN language registry: execution contract (key@languageVersion) → ONE fixed worker image and
// fixed resource ceilings. A request can only NAME a contract; it can never supply an image, a command, flags, an entrypoint,
// mounts or environment. V1 supports exactly the SmartAssess registry's three languages (python@1, java@1, csharp@1).
// Images are built locally from runner/workers/<language>/Dockerfile (digest-pinned official bases) by
// runner/scripts/build-images.sh; the tag carries the phase + contract version so a gateway never runs a stale image silently.
//
// Memory model — TWO separately bounded sandboxes, never one shared allowance:
//   • COMPILE sandbox (compiled toolchains only: Java, C#): ceiling = compileMemoryMb (fixed per toolchain). It runs ONLY the
//     trusted compiler on the source and returns a bounded artifact; student code never executes there.
//   • RUNTIME sandbox (every language): cgroup ceiling = question memoryMb + runtimeOverheadMb (fixed per toolchain), set by
//     `docker run --memory/--memory-swap` BEFORE any student code starts. The cgroup bounds the WHOLE process tree — managed
//     heap, native allocations, child processes and their descendants. The compile allowance is never available to the program.
//   In-sandbox limits (Python RLIMIT_AS, JVM -Xmx, .NET GCHeapHardLimit) stay as defence in depth only.
//   runtimeOverheadMb covers the in-sandbox supervisor plus the language runtime's own non-heap memory (JVM metaspace / code
//   cache / threads, the .NET runtime, the CPython interpreter); values were measured with the real-Docker suite.
const STARTUP_SLACK_MS = 10000;

const entry = (key, { compileSandbox, compileTimeoutMs, compileMemoryMb, runtimeOverheadMb }) => Object.freeze({
  key,
  languageVersion: 1,
  image: "smartassess-coding-" + key + ":17c-v1",                 // Phase 17C: the images carry the official exec entry (tag bump)
  compileSandbox,                 // true → compile in its own sandbox, run the artifact in a second one
  compileTimeoutMs,               // compile (Java, C#) or syntax-check (Python, inside the runtime sandbox) time limit
  compileMemoryMb,                // compile sandbox ceiling (null when there is no compile sandbox)
  runtimeOverheadMb,              // runtime sandbox ceiling = memoryMb + runtimeOverheadMb
  pidsLimit: 128,
  cpus: 1,
  workspaceMb: 32,
  tmpMb: 64
});

const LANGUAGES = Object.freeze({
  "python@1": entry("python", { compileSandbox: false, compileTimeoutMs: 10000, compileMemoryMb: null, runtimeOverheadMb: 64 }),
  "java@1": entry("java", { compileSandbox: true, compileTimeoutMs: 20000, compileMemoryMb: 768, runtimeOverheadMb: 128 }),
  "csharp@1": entry("csharp", { compileSandbox: true, compileTimeoutMs: 20000, compileMemoryMb: 1024, runtimeOverheadMb: 96 })
});

/** The registry entry for EXACTLY this contract, or undefined (unknown key, other version, prototype names). */
function resolveLanguage(key, languageVersion) {
  if (typeof key !== "string" || !/^[a-z][a-z0-9]{0,31}$/.test(key) || !Number.isInteger(languageVersion)) return undefined;
  const id = key + "@" + languageVersion;
  return Object.prototype.hasOwnProperty.call(LANGUAGES, id) ? LANGUAGES[id] : undefined;
}

/** Runtime sandbox cgroup ceiling (MB): the question's memoryMb plus the toolchain's fixed runtime overhead — nothing else. */
const runtimeMemoryMb = (e, memoryMb) => memoryMb + e.runtimeOverheadMb;
/** Hard wall clock of the compile sandbox. */
const compileWallMs = e => e.compileTimeoutMs + STARTUP_SLACK_MS;
/** Hard wall clock of the runtime sandbox (includes the in-sandbox syntax check of toolchains without a compile sandbox). */
const runWallMs = (e, timeMs) => (e.compileSandbox ? 0 : e.compileTimeoutMs) + timeMs + STARTUP_SLACK_MS;
/** Phase 17C — hard wall clock of ONE official runtime sandbox (container start-up + setup + the program's own time limit, which
 *  the gateway starts counting at the authentic exec marker). */
const officialCaseWallMs = (e, timeMs) => timeMs + STARTUP_SLACK_MS;

module.exports = { LANGUAGES, resolveLanguage, runtimeMemoryMb, compileWallMs, runWallMs, officialCaseWallMs, STARTUP_SLACK_MS };
