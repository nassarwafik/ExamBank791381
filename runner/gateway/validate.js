"use strict";
// Phase 17B — validation of the ONE request shape the gateway accepts (an exact allow-list; anything else is REQUEST_INVALID):
//     { requestId, language, languageVersion, source, stdin, limits: { timeMs, memoryMb, outputBytes } }
// The bounds mirror the SmartAssess execution contract (src/codingContract.ts / src/codingQuestion.ts); the runner is an
// independent deployable and does not import application code, so the numbers are restated here and a parity test pins them.
const { resolveLanguage } = require("./registry.js");

const BOUNDS = Object.freeze({
  sourceBytes: 65536,
  stdinBytes: 16384,
  timeMs: Object.freeze([250, 10000]),
  memoryMb: Object.freeze([16, 512]),
  outputBytes: Object.freeze([1024, 262144])
});
const REQUEST_KEYS = ["language", "languageVersion", "limits", "requestId", "source", "stdin"];
const LIMIT_KEYS = ["memoryMb", "outputBytes", "timeMs"];
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exactKeys = (o, keys) => { const k = Object.keys(o).sort(); return k.length === keys.length && k.every((x, i) => x === keys[i]); };
const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;

function validateExecuteRequest(body) {
  const bad = { ok: false, code: "REQUEST_INVALID" };
  if (!isPlainObject(body) || !exactKeys(body, REQUEST_KEYS)) return bad;
  const { requestId, language, languageVersion, source, stdin, limits } = body;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) return bad;
  if (!resolveLanguage(language, languageVersion)) return bad;
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > BOUNDS.sourceBytes) return bad;
  if (typeof stdin !== "string" || Buffer.byteLength(stdin, "utf8") > BOUNDS.stdinBytes) return bad;
  if (!isPlainObject(limits) || !exactKeys(limits, LIMIT_KEYS)) return bad;
  if (!inRange(limits.timeMs, BOUNDS.timeMs) || !inRange(limits.memoryMb, BOUNDS.memoryMb) || !inRange(limits.outputBytes, BOUNDS.outputBytes)) return bad;
  return { ok: true, request: { requestId, language, languageVersion, source, stdin, limits: { timeMs: limits.timeMs, memoryMb: limits.memoryMb, outputBytes: limits.outputBytes } } };
}

module.exports = { BOUNDS, validateExecuteRequest };
