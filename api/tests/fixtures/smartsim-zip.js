// Phase 16B-A — deterministic, dependency-free ZIP writer for SmartSim package fixtures. Tests craft VALID packages and
// deliberately MALICIOUS archives (path traversal, absolute paths, symlink entries, size lies, duplicates, nested archives)
// so the server validator is proven against attacker-controlled bytes, not against what a friendly library would emit.
import zlib from "node:zlib";

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/**
 * entries: [{ name, data (Buffer|string), method?: 0|8, symlink?: boolean, uncompressedSizeOverride?, compressedOverride?: Buffer }]
 * Returns the archive Buffer. `symlink` sets the Unix mode bits (0120000) in the central-directory external attributes.
 */
export function writeZip(entries, options = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data ?? ""), "utf8");
    const method = e.method === undefined ? (raw.length ? 8 : 0) : e.method;
    const stored = e.compressedOverride || (method === 8 ? zlib.deflateRawSync(raw) : raw);
    const crc = e.crcOverride === undefined ? crc32(raw) : e.crcOverride;
    const usize = e.uncompressedSizeOverride === undefined ? raw.length : e.uncompressedSizeOverride;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(stored.length, 18); local.writeUInt32LE(usize, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x031e, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(stored.length, 20); central.writeUInt32LE(usize, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    const mode = e.symlink ? 0o120777 : e.name.endsWith("/") ? 0o40755 : 0o100644;
    central.writeUInt32LE((mode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, stored); centrals.push(central, name);
    offset += local.length + name.length + stored.length;
  }
  const cd = Buffer.concat(centrals), cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(cdOffset, 16); eocd.writeUInt16LE(0, 20);
  const out = Buffer.concat([...locals, cd, eocd]);
  return options.prefix ? Buffer.concat([Buffer.from(options.prefix), out]) : out;
}

export const manifestOf = (over = {}) => ({ schemaVersion: 1, packageId: "counter-sim", packageVersion: 1, title: "Counter", description: "Counts clicks", entry: "dist/index.html", runtime: "web", runtimeVersion: 1, responseSchemaVersion: 1, capabilities: { autosave: true, restore: true, reset: true, partialCredit: false, offline: true }, ...over });

export const VANILLA_INDEX = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Counter</title><style>body{font-family:sans-serif;margin:0;padding:16px}</style></head><body><main><p>Counter: <output id="count">0</output></p><button id="inc" type="button">+</button><button id="reset" type="button">Reset</button></main><script>
(function(){var n=0,out=document.getElementById("count"),P=1,id=null;function send(t,p){window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
window.addEventListener("message",function(e){var m=e.data;if(!m||m.protocolVersion!==P)return;if(m.type==="SMARTSIM_INIT"){id=m.instanceId;if(m.payload&&m.payload.savedState&&typeof m.payload.savedState.count==="number"){n=m.payload.savedState.count;out.textContent=String(n)}}else if(m.type==="SMARTSIM_RESTORE_STATE"){if(m.payload&&m.payload.state&&typeof m.payload.state.count==="number"){n=m.payload.state.count;out.textContent=String(n)}}else if(m.type==="SMARTSIM_RESET"){n=0;out.textContent="0";send("SMARTSIM_STATE_CHANGED",{state:{count:0}})}});
document.getElementById("inc").addEventListener("click",function(){n++;out.textContent=String(n);send("SMARTSIM_STATE_CHANGED",{state:{count:n}})});
document.getElementById("reset").addEventListener("click",function(){send("SMARTSIM_REQUEST_RESET",{})});
window.parent.postMessage({protocolVersion:P,instanceId:null,type:"SMARTSIM_READY",payload:{}},"*");})();
</script></body></html>`;

/** A minimal VALID vanilla package: manifest + single-file dist/index.html. */
export function vanillaPackage(manifestOver = {}, extra = []) {
  return writeZip([{ name: "manifest.json", data: JSON.stringify(manifestOf(manifestOver)) }, { name: "dist/index.html", data: VANILLA_INDEX }, ...extra]);
}
/** A VALID prebuilt React/Vite-style package: dist/index.html + dist/assets/index-abc.js + css (+ ignored source/). */
export function reactDistPackage(manifestOver = {}) {
  const js = `(function(){"use strict";var e=document.getElementById("root");e.innerHTML='<div class="app"><h1>React Sim</h1></div>';window.parent.postMessage({protocolVersion:1,instanceId:null,type:"SMARTSIM_READY",payload:{}},"*")})();`;
  return writeZip([
    { name: "manifest.json", data: JSON.stringify(manifestOf({ packageId: "react-sim", title: "React Sim", ...manifestOver })) },
    { name: "dist/index.html", data: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./assets/index-abc123.css"></head><body><div id="root"></div><script type="module" src="./assets/index-abc123.js"></script></body></html>` },
    { name: "dist/assets/index-abc123.js", data: js },
    { name: "dist/assets/index-abc123.css", data: ".app{padding:8px}" },
    { name: "source/src/App.tsx", data: "export default function App(){return <h1>React Sim</h1>}" },
    { name: "source/package.json", data: JSON.stringify({ name: "react-sim", scripts: { build: "vite build" } }) },
    { name: "source/vite.config.ts", data: "export default {}" },
    { name: "README.md", data: "# React Sim" }
  ]);
}
/** A source-only React/TypeScript project: NO dist → must be rejected. */
export function sourceOnlyPackage() {
  return writeZip([
    { name: "manifest.json", data: JSON.stringify(manifestOf({ packageId: "src-only" })) },
    { name: "source/src/App.tsx", data: "export default function App(){return null}" },
    { name: "source/package.json", data: JSON.stringify({ name: "src-only", scripts: { build: "vite build" } }) },
    { name: "source/index.html", data: "<div id=root></div>" }
  ]);
}
