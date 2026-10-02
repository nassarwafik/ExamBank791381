"use strict";
// Phase 17F-A1 — a READ-ONLY Docker Engine API client for the deployment tools (preflight, record-images). It starts NO process:
// the only process-starting module of runner/ stays gateway/sandbox.js (architecture guard 17B R1). It speaks HTTP over the
// local unix socket (DOCKER_HOST=unix://… or /var/run/docker.sock), sends ONLY `GET` requests to a fixed allow-list of
// endpoints (/version, /info, /images/<registry image>/json), never a body, and REFUSES a TCP daemon (a Docker API on TCP is
// itself a deployment fault). Every answer is bounded in size and time.
const http = require("node:http");

const DEFAULT_SOCKET = "/var/run/docker.sock";
const MAX_RESPONSE_BYTES = 1 << 20;
// Docker reference grammar (name components separated by single . _ - or /, then a mandatory tag): no "..", no empty segment.
const IMAGE_REF = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*:[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const ALLOWED = [/^\/version$/, /^\/info$/, /^\/images\/[A-Za-z0-9._%-]+\/json$/];

/** The unix socket path for this environment, or null when DOCKER_HOST names anything but a unix socket. */
function socketPathFor(env = process.env) {
  const h = typeof env.DOCKER_HOST === "string" ? env.DOCKER_HOST.trim() : "";
  if (!h) return DEFAULT_SOCKET;
  return h.startsWith("unix://") && h.length > 7 ? h.slice(7) : null;
}

function createDockerApi({ env = process.env, request = http.request, timeoutMs = 10000 } = {}) {
  const socketPath = socketPathFor(env);
  /** GET one allow-listed endpoint → { status, json } or null (unreachable / refused / oversize / not JSON). Never throws. */
  function get(p) {
    if (!socketPath || !ALLOWED.some(re => re.test(p))) return Promise.resolve(null);
    return new Promise(resolve => {
      let req;
      try {
        req = request({ socketPath, path: p, method: "GET", headers: { host: "docker" }, timeout: timeoutMs }, res => {
          const parts = []; let size = 0;
          res.on("data", d => { size += d.length; if (size > MAX_RESPONSE_BYTES) { req.destroy(); resolve(null); return; } parts.push(d); });
          res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(parts).toString("utf8")) }); } catch { resolve(null); } });
          res.on("error", () => resolve(null));
        });
      } catch { resolve(null); return; }
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(null));
      req.end();
    });
  }
  return {
    socketPath,
    /** `docker info` equivalent (ServerVersion, CgroupVersion, SecurityOptions, DockerRootDir, …) or null. */
    async info() { const r = await get("/info"); return r && r.status === 200 && r.json && typeof r.json === "object" ? r.json : null; },
    /** The local image ID ("sha256:…") of a registry image reference, or null when absent. */
    async imageId(image) {
      if (typeof image !== "string" || !IMAGE_REF.test(image)) return null;
      const r = await get("/images/" + encodeURIComponent(image) + "/json");
      return r && r.status === 200 && r.json && /^sha256:[0-9a-f]{64}$/.test(String(r.json.Id)) ? r.json.Id : null;
    }
  };
}

module.exports = { DEFAULT_SOCKET, socketPathFor, createDockerApi };
