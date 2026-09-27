// Phase 11A — secret-configuration DIAGNOSTIC (observes only; never changes authentication).
//
// builder-auth.js and student-auth.js resolve their secrets with fallback chains:
//   teacher signing secret : BUILDER_SESSION_SECRET || BANK_SETUP_KEY
//   student signing secret : STUDENT_SESSION_SECRET || BUILDER_SESSION_SECRET || BANK_SETUP_KEY
//   teacher password       : BUILDER_PASSWORD       || BANK_SETUP_KEY   (reported as `teacherLogin`: a field name
//                            containing "password" would be redacted by the observability logger)
// The fallbacks keep old deployments working, but when BANK_SETUP_KEY alone is configured ONE value is both the
// teacher password and the HMAC root of every session token. This module classifies which link of each chain is in
// use — by variable NAME only, with the same truthiness test the auth libraries use — so an operator can see that a
// dedicated secret is missing. It never reads a value beyond "set / not set": no value, length, hash, prefix or
// comparison between secrets is computed, returned or logged.

const CHAINS = {
  teacherSigning: ["BUILDER_SESSION_SECRET", "BANK_SETUP_KEY"],
  studentSigning: ["STUDENT_SESSION_SECRET", "BUILDER_SESSION_SECRET", "BANK_SETUP_KEY"],
  teacherLogin: ["BUILDER_PASSWORD", "BANK_SETUP_KEY"]
};

/** Which link of a chain is in effect: the first set variable wins, exactly like `a || b || c` in the auth libs. */
function classify(env, chain) {
  const index = chain.findIndex(name => Boolean(env[name]));
  if (index === -1) return "missing";
  if (index === 0) return "dedicated";
  if (chain[index] === "BANK_SETUP_KEY") return "fallback";
  return "shared-teacher-secret";                      // student tokens rooted in the teacher signing secret
}

/**
 * Pure: { teacherSigning, studentSigning, teacherLogin, recommended } — each a status word, never a value.
 * `recommended` is true only when all three use their dedicated variable.
 */
function authSecretConfiguration(env = process.env) {
  const status = {
    teacherSigning: classify(env, CHAINS.teacherSigning),
    studentSigning: classify(env, CHAINS.studentSigning),
    teacherLogin: classify(env, CHAINS.teacherLogin)
  };
  status.recommended = status.teacherSigning === "dedicated" && status.studentSigning === "dedicated" && status.teacherLogin === "dedicated";
  return status;
}

let reported = false;
/**
 * Once per process: when the configuration is not the recommended one, write ONE structured warning
 * (`auth.secret_configuration`) through the request's observability logger. Server log only — callers never put
 * this in a response. Any logging failure is swallowed; nothing here can affect the caller.
 */
function reportAuthSecretConfiguration(obs, env = process.env) {
  try {
    if (reported) return null;
    reported = true;
    const status = authSecretConfiguration(env);
    if (!status.recommended && obs && typeof obs.logWarn === "function") obs.logWarn("auth.secret_configuration", { ...status });
    return status;
  } catch {
    return null;
  }
}

/** Test-only: allow the once-per-process report to run again. */
function __resetAuthSecretReportForTests() { reported = false; }

module.exports = { authSecretConfiguration, reportAuthSecretConfiguration, __resetAuthSecretReportForTests, CHAINS };
