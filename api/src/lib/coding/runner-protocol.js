// Phase 17B — the API side of the SmartAssess ↔ Coding Runner Gateway request-signing protocol (version 1). An independent
// implementation of runner/gateway/auth.js (the application never imports from runner/); a parity test pins both to the same
// bytes. Headers:
//     x-sa-runner-protocol    "1"
//     x-sa-runner-timestamp   Unix seconds
//     x-sa-runner-request-id  the server-generated request id
//     x-sa-runner-signature   "v1=" + hex(HMAC-SHA256(key, "SA-CODING-RUNNER-1\n" + METHOD + "\n" + path + "\n" + timestamp +
//                             "\n" + requestId + "\n" + hex(SHA-256(body))))
// The key is used only to compute the digest here; it never leaves this process.
const crypto = require("crypto");

const RUNNER_PROTOCOL = "SA-CODING-RUNNER-1";

function signRunnerRequest({ key, method, path, timestamp, requestId, body }) {
  const bodyHash = crypto.createHash("sha256").update(body || Buffer.alloc(0)).digest("hex");
  const canonical = [RUNNER_PROTOCOL, String(method).toUpperCase(), path, timestamp, requestId, bodyHash].join("\n");
  const mac = crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(canonical, "utf8").digest("hex");
  return { "x-sa-runner-protocol": "1", "x-sa-runner-timestamp": String(timestamp), "x-sa-runner-request-id": String(requestId), "x-sa-runner-signature": "v1=" + mac };
}

module.exports = { RUNNER_PROTOCOL, signRunnerRequest };
