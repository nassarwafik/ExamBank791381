// Phase 16B-A Independent Review Fix — a dependency-free REAL-BROWSER harness for the SmartSim runtime boundary.
//
//   • startRuntimeServer(packages): a real HTTP server whose /api/simulators/runtime/** route calls the PRODUCTION
//     `runtimeHandler` (functions/simulators.js) against packages stored through the PRODUCTION `uploadHandler` (so the
//     real validator, store and runtime header builder are exercised end to end). It never sets a security header itself.
//     `/host.html` is a stand-in for the application page on the SAME origin: it seeds application secrets
//     (localStorage / sessionStorage / cookie / DOM) and frames a runtime URL with EXACTLY the sandbox tokens the
//     production SimulationSandboxHost renders (extracted from its source).
//   • launchBrowser(): headless Chromium driven over the Chrome DevTools Protocol (Node 22 global WebSocket). Child frames
//     are auto-attached so blocked sub-resources (CORP / CORS / CSP) are captured as evidence.
//
// Browser discovery: $SMARTSIM_CHROME_PATH, $CHROME_PATH, /opt/pw-browsers/chromium-*/chrome-linux/chrome, then
// google-chrome / chromium on PATH. `--no-sandbox` only disables Chromium's OS-level process sandbox so it can run in
// containers / CI; it does not change web-platform iframe / CSP sandboxing, which is what these tests observe.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createMemoryContainer } from "./memory-container.js";
import { writeZip, manifestOf } from "./smartsim-zip.js";
import { uploadHandler, runtimeHandler } from "../../src/functions/simulators.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The sandbox tokens the PRODUCTION host renders — read from its source so the proof can never drift from it. */
export function productionIframeSandbox() {
  const src = fs.readFileSync(path.join(repo, "src/smartsim/SimulationSandboxHost.tsx"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");   // the JSX, not the comments describing it
  const m = /<iframe[\s\S]*?\ssandbox="([^"]*)"/.exec(src);
  if (!m) throw new Error("could not find the iframe sandbox attribute in SimulationSandboxHost.tsx");
  return m[1];
}

export function findChromium() {
  const candidates = [process.env.SMARTSIM_CHROME_PATH, process.env.CHROME_PATH];
  try { for (const d of fs.readdirSync("/opt/pw-browsers")) if (/^chromium-\d+$/.test(d)) candidates.push(path.join("/opt/pw-browsers", d, "chrome-linux", "chrome")); } catch { /* not present */ }
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { const p = execFileSync("which", [name], { encoding: "utf8" }).trim(); if (p) candidates.push(p); } catch { /* not on PATH */ }
  }
  return candidates.find(p => p && fs.existsSync(p)) || null;
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map(), listeners = new Set();
    const api = {
      send(method, params = {}, sessionId) {
        const i = ++id; const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId;
        return new Promise((res, rej) => { pending.set(i, { res, rej, method }); ws.send(JSON.stringify(msg)); });
      },
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      close() { try { ws.close(); } catch { /* closed */ } }
    };
    ws.onopen = () => resolve(api);
    ws.onerror = () => reject(new Error("CDP websocket error"));
    ws.onmessage = ev => {
      const m = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(p.method + ": " + m.error.message)); else p.res(m.result); return; }
      for (const l of listeners) l(m);
    };
  });
}

export async function launchBrowser() {
  const exe = findChromium();
  if (!exe) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartsim-chrome-"));
  const proc = spawn(exe, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--no-proxy-server", "--remote-debugging-port=0", "--user-data-dir=" + dir, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("Chromium did not start: " + buf.slice(-800))), 30000);
    proc.stderr.on("data", d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } });
    proc.on("exit", c => { clearTimeout(t); rej(new Error("Chromium exited (" + c + "): " + buf.slice(-800))); });
  });
  const cdp = await connectCdp(wsUrl);
  const { product } = await cdp.send("Browser.getVersion");
  return {
    exe, product, cdp,
    newPage: () => newPage(cdp),
    async pageCount() { const { targetInfos } = await cdp.send("Target.getTargets"); return targetInfos.filter(t => t.type === "page").length; },
    async close() { try { await cdp.send("Browser.close"); } catch { /* gone */ } cdp.close(); try { proc.kill("SIGKILL"); } catch { /* gone */ } await sleep(50); fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

async function newPage(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const sessions = new Set([sessionId]);
  const urls = new Map(), failures = [], dialogs = [], console_ = [];
  const off = cdp.on(m => {
    if (!sessions.has(m.sessionId)) return;
    const p = m.params || {};
    if (m.method === "Target.attachedToTarget") {
      const child = p.sessionId; sessions.add(child);
      (async () => {
        for (const [method, params] of [["Network.enable", {}], ["Runtime.enable", {}], ["Page.enable", {}], ["Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }]]) { try { await cdp.send(method, params, child); } catch { /* not supported for this target */ } }
        try { await cdp.send("Runtime.runIfWaitingForDebugger", {}, child); } catch { /* not waiting */ }
      })();
    } else if (m.method === "Network.requestWillBeSent") urls.set(p.requestId, p.request.url);
    else if (m.method === "Network.loadingFailed") failures.push({ url: urls.get(p.requestId) || "", errorText: p.errorText, blockedReason: p.blockedReason || null, corsError: (p.corsErrorStatus && p.corsErrorStatus.corsError) || null });
    else if (m.method === "Page.javascriptDialogOpening") { dialogs.push({ type: p.type, message: p.message }); cdp.send("Page.handleJavaScriptDialog", { accept: false }, m.sessionId).catch(() => {}); }
    else if (m.method === "Runtime.consoleAPICalled" || m.method === "Runtime.exceptionThrown") console_.push(JSON.stringify(p).slice(0, 300));
  });
  for (const [method, params] of [["Page.enable", {}], ["Runtime.enable", {}], ["Network.enable", {}], ["Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }]]) await cdp.send(method, params, sessionId);
  const page = {
    sessionId, targetId, failures, dialogs, console: console_,
    async goto(url) { await cdp.send("Page.navigate", { url }, sessionId); await page.waitFor("document.readyState === 'complete' && location.href !== 'about:blank'"); },
    async eval(expression) {
      const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) throw new Error("evaluate failed: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expression, timeout = 10000) {
      const end = Date.now() + timeout; let last;
      while (Date.now() < end) { try { last = await page.eval(expression); if (last) return last; } catch (e) { last = e.message; } await sleep(50); }
      return null;
    },
    async close() { off(); await cdp.send("Target.closeTarget", { targetId }).catch(() => {}); }
  };
  return page;
}

// ── the real-HTTP runtime server ────────────────────────────────────────────────────────────────────────────────────
export const APP_SECRET = "APP-SECRET-TOKEN-7f3a";
export const APP_COOKIE = "APP-SECRET-COOKIE-91c2";
export const TEACHER_SECRET = "TEACHER-IDENTITY-5d0e";
export const HOST_INSTANCE_ID = "inst-browser-1";

function hostPage(src, sandbox, savedState) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>host</title></head><body>
<div id="teacher-identity">${TEACHER_SECRET}</div>
<iframe id="f" title="محاكاة تفاعلية" sandbox="${esc(sandbox)}" referrerpolicy="no-referrer" src="${esc(src)}" style="width:640px;height:420px"></iframe>
<script>
localStorage.setItem("app-token", ${JSON.stringify(APP_SECRET)});
sessionStorage.setItem("app-token", ${JSON.stringify(APP_SECRET)});
document.cookie = "app_session=${APP_COOKIE}; path=/";
window.__msgs = [];
var f = document.getElementById("f");
addEventListener("message", function (e) {
  var fromFrame = e.source === f.contentWindow;
  window.__msgs.push({ fromFrame: fromFrame, origin: e.origin, data: e.data });
  if (fromFrame && e.data && e.data.protocolVersion === 1 && e.data.type === "SMARTSIM_READY") {
    f.contentWindow.postMessage({ protocolVersion: 1, instanceId: ${JSON.stringify(HOST_INSTANCE_ID)}, type: "SMARTSIM_INIT", payload: { protocolVersion: 1, instanceId: ${JSON.stringify(HOST_INSTANCE_ID)}, scenario: {}, publicConfig: {}, savedState: ${JSON.stringify(savedState ?? null)}, disabled: false } }, "*");
  }
});
</script></body></html>`;
}

export async function startRuntimeServer(packageBuffers) {
  const store = createMemoryContainer();
  const teacher = { ok: true, user: { sub: "browser-proof-teacher", role: "teacher" } };
  const deps = { getContainer: () => store.container, requireBuilderAuth: () => teacher };
  const requests = [];
  let origin = "";
  const server = http.createServer(async (req, res) => {
    requests.push({ method: req.method, url: req.url });
    try {
      const u = new URL(req.url, origin);
      const m = /^\/api\/simulators\/runtime\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)$/.exec(u.pathname);
      if (m) {
        const request = { method: req.method, url: origin + req.url, headers: new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === "string")), params: { packageId: m[1], packageVersion: m[2], hash: m[3], assetPath: m[4] }, query: u.searchParams };
        const r = await runtimeHandler(request, deps);
        res.statusCode = r.status;
        for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
        if (r.body) { res.end(r.body); return; }
        if (r.jsonBody !== undefined) { if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(r.jsonBody)); return; }
        res.end(); return;
      }
      if (u.pathname === "/host.html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        // `weakFrame=1` (B6 only) deliberately frames with allow-same-origin to prove the HTTP sandbox holds on its own
        res.end(hostPage(u.searchParams.get("src") || "about:blank", u.searchParams.get("weakFrame") === "1" ? productionIframeSandbox() + " allow-same-origin" : productionIframeSandbox(), JSON.parse(u.searchParams.get("saved") || "null")));
        return;
      }
      res.statusCode = 404; res.setHeader("Content-Type", "text/plain"); res.end("not found");
    } catch (e) { res.statusCode = 500; res.end(String(e && e.stack || e)); }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  origin = "http://127.0.0.1:" + server.address().port;
  const packages = {};
  for (const [key, buffer] of Object.entries(packageBuffers)) {
    const up = await uploadHandler({ method: "POST", url: origin + "/api/simulators/upload", headers: new Headers({ "x-file-name": encodeURIComponent(key + ".smartsim"), "content-length": String(buffer.length) }), arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) }, deps);
    if (up.status !== 201) throw new Error("upload of " + key + " failed: " + JSON.stringify(up.jsonBody));
    packages[key] = up.jsonBody.package;
  }
  const runtimePath = (pkg, asset) => "/api/simulators/runtime/" + pkg.packageId + "/" + pkg.packageVersion + "/" + pkg.packageHash.slice(7) + "/" + asset;
  return {
    origin, requests, packages, deps,
    runtimePath,
    runtimeUrl: (pkg, asset) => origin + runtimePath(pkg, asset),
    hostUrl: (pkg, asset = "index.html", savedState = null, weakFrame = false) => origin + "/host.html?src=" + encodeURIComponent(runtimePath(pkg, asset)) + "&saved=" + encodeURIComponent(JSON.stringify(savedState)) + (weakFrame ? "&weakFrame=1" : ""),
    close: () => new Promise(r => server.close(() => r()))
  };
}

// ── browser proof packages (all pass the production upload validator) ──────────────────────────────────────────────
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const pkg = (packageId, files) => writeZip([{ name: "manifest.json", data: JSON.stringify(manifestOf({ packageId, title: packageId })) }, ...Object.entries(files).map(([name, data]) => ({ name: "dist/" + name, data }))]);

/** Probes the privileges of the document it runs in; reports framed (bridge state) and top-level (data attribute). */
const PROBE_SCRIPT = `(function(){var P=1,id=null,R={};
function t(n,f){try{var v=f();R[n]={ok:true,value:v===null||v===undefined?null:String(v)}}catch(e){R[n]={ok:false,error:String(e&&e.name||e)}}}
t("origin",function(){return self.origin});
t("localStorage",function(){return localStorage.getItem("app-token")});
t("sessionStorage",function(){return sessionStorage.getItem("app-token")});
t("cookie",function(){return document.cookie});
t("indexedDB",function(){indexedDB.open("smartsim-probe");return "opened"});
t("parentDom",function(){return window.parent===window?"top-level":window.parent.document.getElementById("teacher-identity").textContent});
R.framed=window.parent!==window;
document.body.setAttribute("data-probe",JSON.stringify(R));
function send(t,p){if(window.parent!==window)window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
window.addEventListener("message",function(e){var m=e.data;if(!m||m.protocolVersion!==P)return;if(m.type==="SMARTSIM_INIT"){id=m.instanceId;var s=m.payload&&m.payload.savedState;send("SMARTSIM_STATE_CHANGED",{state:{count:(s&&typeof s.count==="number"?s.count:0)+1,probe:R}})}});
send("SMARTSIM_READY",{});})();`;
const PROBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script><![CDATA[
(function(){var R={};function t(n,f){try{var v=f();R[n]={ok:true,value:v===null||v===undefined?null:String(v)}}catch(e){R[n]={ok:false,error:String(e&&e.name||e)}}}
t("origin",function(){return self.origin});t("localStorage",function(){return localStorage.getItem("app-token")});t("cookie",function(){return document.cookie});
document.documentElement.setAttribute("data-probe",JSON.stringify(R));})();
]]></script></svg>`;

/** Attempts every escape route the declared model forbids. Obfuscated so it PASSES the heuristic upload scan: the scan
 *  is defense in depth, the sandbox + CSP are the boundary under test. */
const ESCAPE_SCRIPT = `(function(){var P=1,id=null,R={},base=location.protocol+"//"+location.host,other=location.protocol+"//localhost:"+location.port,framed=window.parent!==window;
function t(n,f){try{var v=f();R[n]={ok:true,value:v===null||v===undefined?null:String(v)}}catch(e){R[n]={ok:false,error:String(e&&e.name||e)}}}
t("popup",function(){return window.open(base+"/escape-popup","_blank")});
t("alert",function(){return window.alert("escape")});
if(framed){t("topNav",function(){window.top.location.href=base+"/escape-top";return "attempted"});t("parentNav",function(){window.parent.location.href=base+"/escape-parent";return "attempted"})}
var F=window["fe"+"tch"];
function net(n,u,o){return Promise.resolve().then(function(){return F(u,o)}).then(function(){R[n]={ok:true}},function(e){R[n]={ok:false,error:String(e&&e.name||e)}})}
var im=new Image();im.src=other+"/escape-img-external";var im2=new Image();im2.src=base+"/escape-img-app";
t("beacon",function(){return navigator["send"+"Beacon"](base+"/escape-beacon","x")});
Promise.all([net("fetchExternal",other+"/escape-fetch-external"),net("fetchApp",base+"/escape-fetch-app",{credentials:"include"})]).then(function(){
 document.body.setAttribute("data-escape",JSON.stringify(R));
 function send(t,p){if(framed)window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
 window.addEventListener("message",function(e){var m=e.data;if(!m||m.protocolVersion!==P)return;if(m.type==="SMARTSIM_INIT"){id=m.instanceId;send("SMARTSIM_STATE_CHANGED",{state:{escape:R}})}});
 send("SMARTSIM_READY",{});
 setTimeout(function(){var f=document.createElement("form");f.method="post";f.action=base+"/escape-form";document.body.appendChild(f);try{f.submit()}catch(e){}},300);
});})();`;

export function browserPackages() {
  return {
    probe: pkg("browser-probe", {
      "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>probe</title></head><body><main>probe</main><script>${PROBE_SCRIPT}</script></body></html>`,
      "probe.svg": PROBE_SVG
    }),
    multi: pkg("browser-multi", {
      "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>multi</title><link rel="stylesheet" href="./style.css"></head><body><div id="marker">m</div><img id="pic" src="./img/pic.png" alt=""><script src="./app.js"></script></body></html>`,
      "style.css": "#marker{width:123px;display:block}",
      "img/pic.png": PNG_1x1,
      "app.js": `(function(){var P=1,id=null;function send(t,p){window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
function report(){var img=document.getElementById("pic");return{script:true,cssWidth:getComputedStyle(document.getElementById("marker")).width,imgWidth:img.naturalWidth,imgComplete:img.complete}}
window.addEventListener("message",function(e){var m=e.data;if(!m||m.protocolVersion!==P)return;if(m.type==="SMARTSIM_INIT"){id=m.instanceId;send("SMARTSIM_STATE_CHANGED",{state:report()})}});
window.addEventListener("load",function(){send("SMARTSIM_READY",{})});})();`
    }),
    vite: pkg("browser-vite", {
      "index.html": `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>vite</title><script type="module" crossorigin src="./assets/index-Bx7rT2aQ.js"></script><link rel="stylesheet" crossorigin href="./assets/index-C9vK1mZp.css"></head><body><div id="root"></div></body></html>`,
      "assets/index-Bx7rT2aQ.js": `import{v as c}from"./vendor-D4qL8sWn.js";const P=1;let id=null;document.getElementById("root").innerHTML='<div class="app" id="app">vite</div>';
function send(t,p){window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
function ready(){return new Promise(r=>{document.readyState==="complete"?r():addEventListener("load",()=>r())})}
window.addEventListener("message",async e=>{const m=e.data;if(!m||m.protocolVersion!==P)return;if(m.type==="SMARTSIM_INIT"){id=m.instanceId;await ready();const lazy=await import("./lazy-E5mN2bXc.js");send("SMARTSIM_STATE_CHANGED",{state:{chunk:c,lazy:lazy.default,cssWidth:getComputedStyle(document.getElementById("app")).width}})}});
send("SMARTSIM_READY",{});`,
      "assets/vendor-D4qL8sWn.js": `export const v="chunk-ok";`,
      "assets/lazy-E5mN2bXc.js": `export default "lazy-ok";`,
      "assets/index-C9vK1mZp.css": `.app{width:77px;display:block}`
    }),
    escape: pkg("browser-escape", {
      "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>escape</title></head><body><main>escape</main><script>${ESCAPE_SCRIPT}</script></body></html>`
    })
  };
}
