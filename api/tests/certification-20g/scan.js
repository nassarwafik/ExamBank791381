// Phase 20G — CORE ENTERPRISE CERTIFICATION: the PRIVACY scanner. It walks an ACTUAL projection (the JSON a student / the AI provider really
// receives) recursively — objects, arrays, nested composite children, shared contexts, legacy parts, coding, SmartSim, visual, AI metadata —
// and reports (1) every forbidden PROPERTY NAME at any depth and (2) every forbidden VALUE (planted canaries and exam-specific secrets) found
// in any string, including inside keys. Property-name checks alone are not enough (a leaked expected output can sit under an innocent key),
// so both are applied. Returns the list of findings ([] = clean) with JSON paths, so a failure names exactly what leaked and where.
import { CANARY } from "./kit.js";

/** Teacher-private / authority-granting property names that must never reach a student projection (any depth). */
export const STUDENT_FORBIDDEN_KEYS = Object.freeze([
  "correctOptionIndex", "correctOptionIds", "correctText", "correctOptionValue", "correctOptionLabel", "correct", "accepted", "correctColumnByRow", "correctCategoryByItem",
  "correctLabelByZone", "regions", "blanks", "expected", "expectedOutput", "hiddenTests", "referenceSolutions", "comparator", "gradingMode", "scoringPolicy",
  "compileErrorPolicy", "checks", "targetState", "rubric", "guidance", "modelAnswer", "teacherNote", "teacherNotes", "reviewNotes", "aiComposer", "assetRequest",
  "answerHash", "gradingKey", "questionFingerprint", "codingGrading", "privateNotes", "hmac", "signature", "sweepKey"
]);
/** The sanitizer keeps a few historical keys in place with a BLANK value (teacherNote: "", hint: "", history: []): present-but-empty
 *  carries nothing. Anything else under a forbidden name (including false / 0) is a finding. */
const blank = v => v === null || v === "" || (Array.isArray(v) && v.length === 0) || (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
/** A non-empty `answer` object is a leak (the sanitizer always ships `answer: {}`). */
const nonEmptyAnswer = v => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0;

export function scanProjection(payload, { forbiddenKeys = STUDENT_FORBIDDEN_KEYS, secrets = [], allowKeysAt = [] } = {}) {
  const findings = [];
  const values = [CANARY, ...secrets].filter(s => typeof s === "string" && s.length >= 3);
  const keyBan = new Set(forbiddenKeys);
  const allowed = path => allowKeysAt.some(re => re.test(path));
  const seen = new Set();
  const visit = (v, path, depth) => {
    if (depth > 64) { findings.push({ path, kind: "depth" }); return; }
    if (typeof v === "string") { for (const s of values) if (v.includes(s)) findings.push({ path, kind: "value", secret: s }); return; }
    if (!v || typeof v !== "object") return;
    if (seen.has(v)) return; seen.add(v);
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, path + "[" + i + "]", depth + 1)); return; }
    for (const [k, x] of Object.entries(v)) {
      const p = path + "." + k;
      if (keyBan.has(k) && !allowed(p) && !blank(x)) findings.push({ path: p, kind: "key", key: k });
      if (k === "answer" && nonEmptyAnswer(x)) findings.push({ path: p, kind: "answer" });
      for (const s of values) if (k.includes(s)) findings.push({ path: p, kind: "key-value", secret: s });
      visit(x, p, depth + 1);
    }
  };
  visit(payload, "$", 0);
  return findings;
}
