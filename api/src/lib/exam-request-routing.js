// Phase 21I — the multi-subject exam request routing for the legacy builder prompt (interpret-exam-request.js). The rules themselves are
// the ONE TypeScript source src/examRequestRouting.ts, compiled to CommonJS by scripts/build-shared-finalization.mjs (drift-guarded);
// this adapter is the only place the API reaches them, so the legacy generator's own modules stay independent of the exam-quality code.
module.exports = require("./shared-finalization/examRequestRouting");
