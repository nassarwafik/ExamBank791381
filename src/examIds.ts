// Identity helpers, split out of examBuilderState so the app shell can mint an exam id without loading the builder's
// conversion / preset helpers (they ship with the Structured Exam Builder, outside the initial bundle).

// Stable unique ids. crypto.randomUUID when available (browser / modern Node), else a random string.
// Display numbers are NEVER identity.
export function genId(prefix = "id"): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g && typeof g.randomUUID === "function") return prefix + "-" + g.randomUUID();
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/** Phase 21F.0 — a new exam's storage identity. Random (never the clock): two teachers creating an exam in the same millisecond
 *  can no longer get the same id (the saved-exam blob is keyed by it). Keeps the historical "EXAM-" prefix. */
export function newExamId(): string { return genId("EXAM"); }
