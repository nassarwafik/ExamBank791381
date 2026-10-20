// Security fix (batch 1) — the storage SDK resolves "." / ".." path segments in a blob name BEFORE the request is sent:
// "platform/feed/c1/../../users/u1.json" is written as "platform/users/u1.json", and "../../raw/x.json" even reaches
// another container. So:
//   - a value from a request that becomes part of a blob name must be ONE safe segment (isSafeSegment);
//   - no blob name may carry a dot segment, a backslash or a control character at all (assertSafeBlobName), enforced
//     once for the whole API process on the SDK's ContainerClient (installBlobNameGuard), whatever route built the name.
const { ContainerClient } = require("@azure/storage-blob");

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const GUARD = Symbol.for("exambank.blobNameGuard");
const NAMED_CLIENTS = ["getBlobClient", "getBlockBlobClient", "getAppendBlobClient", "getPageBlobClient"];

class UnsafeBlobNameError extends Error {
  constructor() {
    super("اسم المستند غير صالح.");
    this.name = "UnsafeBlobNameError";
    this.code = "UNSAFE_BLOB_NAME";
    this.httpStatus = 400;
  }
}

/** One path segment taken from a request: non-empty, bounded, never "." / "..", no "/", "\" or control character. */
function isSafeSegment(value, maxLength = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value !== "." && value !== ".."
    && !value.includes("/") && !value.includes("\\") && !CONTROL_CHARS.test(value);
}

/** A whole blob name: no "." / ".." segment (the SDK would resolve it), no "\", no control character. */
function isSafeBlobName(name) {
  if (typeof name !== "string" || !name || name.includes("\\") || CONTROL_CHARS.test(name)) return false;
  return !name.split("/").some(segment => segment === "." || segment === "..");
}

function assertSafeBlobName(name) {
  if (!isSafeBlobName(name)) throw new UnsafeBlobNameError();
  return name;
}

/** Wraps the SDK's name-taking ContainerClient factories once per process (idempotent). */
function installBlobNameGuard(Client = ContainerClient) {
  const proto = Client.prototype;
  if (proto[GUARD]) return;
  for (const method of NAMED_CLIENTS) {
    const original = proto[method];
    if (typeof original !== "function") continue;
    proto[method] = function guardedBlobClient(name, ...rest) {
      assertSafeBlobName(name);
      return original.call(this, name, ...rest);
    };
  }
  Object.defineProperty(proto, GUARD, { value: true });
}

installBlobNameGuard();

module.exports = { isSafeSegment, isSafeBlobName, assertSafeBlobName, installBlobNameGuard, UnsafeBlobNameError };
