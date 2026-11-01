#!/usr/bin/env node
// Tadris+ P1-A — run ON THE OWNER'S OWN COMPUTER to prepare the one-time owner bootstrap (owner decision D3).
//
//   node scripts/owner-bootstrap-token.mjs            (default window: 24 hours)
//   node scripts/owner-bootstrap-token.mjs --hours 2
//
// Prints three values and sends nothing anywhere:
//   1. the bootstrap TOKEN  — keep it private; you type it once in the setup screen. It is never stored on the server.
//   2. OWNER_BOOTSTRAP_TOKEN_SHA256 — put this in the Azure app settings yourself.
//   3. OWNER_BOOTSTRAP_EXPIRES_AT   — put this in the Azure app settings yourself (at most 24 hours ahead).
// After the owner account is created, remove both settings. The route stays closed even if you forget.

import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export function createBootstrapMaterial({ hours = 24, now = Date.now() } = {}) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || h > 24) throw new Error("--hours must be between 0 and 24.");
  const token = randomBytes(32).toString("base64url");
  const sha256 = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(now + Math.round(h * 3600 * 1000)).toISOString();
  return { token, sha256, expiresAt };
}

function parseHours(argv) {
  const i = argv.indexOf("--hours");
  return i >= 0 ? Number(argv[i + 1]) : 24;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { token, sha256, expiresAt } = createBootstrapMaterial({ hours: parseHours(process.argv.slice(2)) });
    process.stdout.write([
      "",
      "Bootstrap token (private — type it once in the owner setup screen):",
      "  " + token,
      "",
      "Azure app settings (add them yourself, then remove them after setup):",
      "  OWNER_BOOTSTRAP_TOKEN_SHA256=" + sha256,
      "  OWNER_BOOTSTRAP_EXPIRES_AT=" + expiresAt,
      ""
    ].join("\n") + "\n");
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.exitCode = 1;
  }
}
