# AI Simulator Spec — paste-ready brief for generating a SmartSim v1 package

Copy everything between the fences into Claude / ChatGPT / any assistant, then append **your** learning goal (the last
section). The brief is domain-neutral: it works for a circuit, a titration, a sorting algorithm, a grammar drill — anything.
The exam builder's «نسخ مواصفات بناء محاكي» button copies a compact version of the same text.

```text
You are building a self-contained web simulator ("SmartSim package") for an exam platform. Follow every rule exactly.

## Deliverable
One ZIP archive (name it <packageId>.smartsim) containing:
  manifest.json                    at the root
  dist/index.html                  the entry document (+ optional dist/** assets)
Optional and ignored by the platform: source/ (your project), README.md.
If you use a framework (React / Vue / Svelte / TypeScript / Vite), OUTPUT THE BUILT dist/. The platform never runs
npm, tsc, vite or any build step. A package without dist/index.html is rejected.

## manifest.json (schemaVersion 1)
{
  "schemaVersion": 1,
  "packageId": "<lowercase-id-with-dashes>",   // stable across versions; ^[a-z][a-z0-9-]{1,63}$
  "packageVersion": 1,                          // positive integer; increase it for every changed build
  "title": "<short title>",
  "description": "<one or two sentences>",
  "entry": "dist/index.html",
  "runtime": "web",
  "runtimeVersion": 1,
  "responseSchemaVersion": 1,
  "capabilities": { "autosave": true, "restore": true, "reset": true, "partialCredit": false, "offline": true }
}

## Hard constraints (the upload validator and the sandbox enforce them)
- Allowed file types inside dist/: .html .css .js .mjs .json .svg .png .jpg .jpeg .gif .webp .woff2 .txt — nothing else
  (no .wasm, no .map, no fonts other than woff2, no archives).
- Relative asset URLs only (./assets/app.js). No external <script>, <link>, <img>, <iframe>, <base href>, @import or url(https://…).
- No network: no fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, importScripts, service workers. Everything is
  bundled in the package.
- No cookies, no localStorage/sessionStorage (they do not exist in the sandbox), no window.top/parent DOM access, no
  window.open, no navigation, no form submission, no eval / new Function.
- Sizes: archive ≤ 15 MB, unpacked ≤ 30 MB, one file ≤ 10 MB, ≤ 500 files.
- The page runs sandboxed (iframe sandbox="allow-scripts" AND an HTTP CSP `sandbox allow-scripts`, even when opened directly):
  opaque origin, strict CSP; inline <script> and <style> are allowed; ES modules and relative assets load normally; your own
  JSON files cannot be fetched (bundle data into JS).

## Behaviour contract (SmartSimBridgeV1 over window.postMessage)
Every message is an object { protocolVersion: 1, instanceId, type, payload }.
Send to window.parent with targetOrigin "*". Listen on window "message"; ignore anything with protocolVersion !== 1.

Simulator → host
  SMARTSIM_READY          payload {}                 send ONCE as soon as your listener is attached (instanceId may be null)
  SMARTSIM_STATE_CHANGED  payload { state }          whenever the learner's work changes
  SMARTSIM_REQUEST_RESET  payload {}                 when the learner asks to start over
  SMARTSIM_ERROR          payload { code, message }  when you cannot continue (short strings, no stack traces)
  SMARTSIM_RESIZE         payload { height }         optional; the host clamps it to 240–1400 px

Host → simulator
  SMARTSIM_INIT           payload { protocolVersion, instanceId, scenario, publicConfig, savedState, disabled }
                          → store instanceId and include it in EVERY later message; if savedState is not null, restore it;
                            if disabled is true, render read-only
  SMARTSIM_RESTORE_STATE  payload { state }          → replace your state and re-render
  SMARTSIM_SET_DISABLED   payload { disabled }       → toggle read-only mode (submitted / ended / under review)
  SMARTSIM_RESET          payload {}                 → return to the initial state and emit SMARTSIM_STATE_CHANGED

## The state you emit
- Plain JSON only: objects, arrays, strings, finite numbers, booleans, null. No functions, Dates, Maps, NaN/Infinity,
  no keys named __proto__ / constructor / prototype, depth ≤ 32, total ≤ 64 KB.
- It is the learner's ANSWER: it is saved automatically, shown back to them, and reviewed by the teacher. Emit what a
  teacher needs to see (e.g. the chosen values, the sequence of actions, the final configuration).
- Do NOT emit scores, grades, "passed" or "correct" flags — the platform ignores them. The simulator has no grading authority.
- Be deterministic: INIT with the same savedState must reproduce the same view.

## UX requirements
- Fluid width (the frame is between 320 and ~1100 px wide), initial height that fits without scrolling when possible; use
  SMARTSIM_RESIZE if you need more height.
- Arabic-first UI when the audience is Arabic: <html lang="ar" dir="rtl">; keyboard-operable controls with visible focus;
  minimum 44 px touch targets; respect prefers-reduced-motion; no autoplaying audio.
- Never ask for or display learner identity; the host does not send it.

## Minimal single-file skeleton (dist/index.html)
<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>…</title>
<style>/* inline styles */</style></head><body><main id="app"></main>
<script>
(function(){var P=1,id=null,state=initial(),disabled=false;
function initial(){return {/* your initial state */};}
function send(t,p){window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
function render(){/* draw state into #app; respect disabled */}
window.addEventListener("message",function(e){var m=e.data;if(!m||m.protocolVersion!==P)return;
 if(m.type==="SMARTSIM_INIT"){id=m.instanceId;if(m.payload.savedState)state=m.payload.savedState;disabled=!!m.payload.disabled;render();return}
 if(m.instanceId!==id)return;
 if(m.type==="SMARTSIM_RESTORE_STATE"){state=m.payload.state||initial();render()}
 else if(m.type==="SMARTSIM_SET_DISABLED"){disabled=!!m.payload.disabled;render()}
 else if(m.type==="SMARTSIM_RESET"){state=initial();render();send("SMARTSIM_STATE_CHANGED",{state:state})}});
function changed(){render();send("SMARTSIM_STATE_CHANGED",{state:state})}
render();send("SMARTSIM_READY",{});})();
</script></body></html>

## Output format
1. manifest.json (complete).
2. dist/index.html (and every other dist/ file, each in its own code block with its path).
3. A short note on how to zip: `zip -r <packageId>.smartsim manifest.json dist`.
```

## Your learning goal (append this)

```text
## What this simulator teaches
<one paragraph: the concept, what the learner manipulates, what the final state should capture for the teacher>
## Controls
<list the interactive controls and their ranges>
## State shape
<the JSON object you want stored, e.g. { "values": {...}, "actions": [...] }>
## Language and tone
<Arabic / English; audience level>
```
