"use strict";
// Phase 17B — the gateway's DATA-DRIVEN language registry: execution contract (key@languageVersion) → ONE fixed worker image and
// fixed resource ceilings. A request can only NAME a contract; it can never supply an image, a command, flags, an entrypoint,
// mounts or environment. V1 supports exactly the SmartAssess registry's three languages (python@1, java@1, csharp@1).
// Images are built locally from runner/workers/<language>/Dockerfile (digest-pinned official bases) by
// runner/scripts/build-images.sh; the tag carries the phase + contract version so a gateway never runs a stale image silently.
//
// Memory model: the container ceiling is FIXED per language (never "unlimited"):
//     ceiling = max(compileMemoryMb, program memoryMb + runtimeOverheadMb)
// The program limit itself (heap / address space) is enforced inside the sandbox by the supervisor (Python RLIMIT_AS, JVM -Xmx,
// .NET GCHeapHardLimit); the ceiling leaves room for the runtime and the compiler and is backed by --memory-swap = --memory.
const STARTUP_SLACK_MS = 10000;

const entry = (key, compileTimeoutMs, compileMemoryMb, runtimeOverheadMb) => Object.freeze({
  key,
  languageVersion: 1,
  image: "smartassess-coding-" + key + ":17b-v1",
  compileTimeoutMs,
  compileMemoryMb,
  runtimeOverheadMb,
  pidsLimit: 128,
  cpus: 1,
  workspaceMb: 32,
  tmpMb: 64
});

const LANGUAGES = Object.freeze({
  "python@1": entry("python", 10000, 256, 128),
  "java@1": entry("java", 20000, 768, 384),
  "csharp@1": entry("csharp", 20000, 1024, 384)
});

/** The registry entry for EXACTLY this contract, or undefined (unknown key, other version, prototype names). */
function resolveLanguage(key, languageVersion) {
  if (typeof key !== "string" || !/^[a-z][a-z0-9]{0,31}$/.test(key) || !Number.isInteger(languageVersion)) return undefined;
  const id = key + "@" + languageVersion;
  return Object.prototype.hasOwnProperty.call(LANGUAGES, id) ? LANGUAGES[id] : undefined;
}

const containerMemoryMb = (e, memoryMb) => Math.max(e.compileMemoryMb, memoryMb + e.runtimeOverheadMb);
const hardWallMs = (e, timeMs) => e.compileTimeoutMs + timeMs + STARTUP_SLACK_MS;

module.exports = { LANGUAGES, resolveLanguage, containerMemoryMb, hardWallMs, STARTUP_SLACK_MS };
