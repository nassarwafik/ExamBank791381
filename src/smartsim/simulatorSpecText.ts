// Phase 16B-A — the copyable «مواصفات بناء محاكي» text (paste into any AI assistant or hand to a developer). It restates the
// protocol contract in docs/smartsim/AI_SIMULATOR_SPEC.md; it is domain-neutral and carries no identifiers or secrets.
export const SIMULATOR_BUILD_SPEC = `Build a SmartSim v1 simulator package for an exam platform.

DELIVERABLE: one ZIP (extension .smartsim or .zip) with:
  manifest.json                 (root)
  dist/index.html               (+ any dist/** assets: .css .js .mjs .json .svg .png .jpg .jpeg .gif .webp .woff2 .txt)
Only dist/ executes. If you use TypeScript / React / Vite, ship the PREBUILT dist output (the platform never runs npm, tsc or vite).
Optional: source/ (ignored), README.md (ignored). No other file types. No nested archives. No symlinks. Max ~15 MB.

manifest.json:
{
  "schemaVersion": 1,
  "packageId": "my-simulator",          // stable id: lowercase letters, digits, dashes; never changes across versions
  "packageVersion": 1,                  // positive integer; bump it for ANY content change (same version + different bytes is refused)
  "title": "My Simulator",
  "description": "What the learner does",
  "entry": "dist/index.html",
  "runtime": "web",
  "runtimeVersion": 1,
  "responseSchemaVersion": 1,
  "capabilities": { "autosave": true, "restore": true, "reset": true, "partialCredit": false, "offline": true }
}

RUNTIME: your page runs sandboxed — inside <iframe sandbox="allow-scripts"> AND under an HTTP CSP "sandbox allow-scripts" that also
applies when the runtime URL is opened directly — with an opaque origin and a strict CSP: NO network (fetch/XHR/WebSocket/EventSource are blocked
and refused at upload), no external scripts/styles/images/fonts (relative package paths and data: images only), no cookies, no
localStorage, no parent DOM, no top navigation, no popups, no forms submission. Be fully self-contained, responsive (fluid width),
RTL-aware (dir="rtl" when the UI is Arabic), keyboard accessible, and respect prefers-reduced-motion.

PROTOCOL (SmartSimBridgeV1, window.postMessage; every message is { protocolVersion: 1, instanceId, type, payload }):
  simulator → host (post to window.parent with targetOrigin "*"):
    SMARTSIM_READY          {}                       once, as soon as your script has attached its listeners
    SMARTSIM_STATE_CHANGED  { state }                whenever the learner's work changes (state = plain JSON, ≤ 64 KB, finite numbers, depth ≤ 32)
    SMARTSIM_REQUEST_RESET  {}                       when the learner asks to start over
    SMARTSIM_ERROR          { code, message }        when you cannot continue (no stack traces, no secrets)
    SMARTSIM_RESIZE         { height }               optional; the host clamps it to 240–1400 px
  host → simulator (listen on window "message"; ignore anything whose protocolVersion !== 1):
    SMARTSIM_INIT           { protocolVersion, instanceId, scenario, publicConfig, savedState, disabled }
                             remember instanceId and put it in EVERY later message; restore savedState if present
    SMARTSIM_RESTORE_STATE  { state }                replace your state with this one
    SMARTSIM_SET_DISABLED   { disabled }             true = read-only (submitted / ended / review)
    SMARTSIM_RESET          {}                       clear to the initial state and emit SMARTSIM_STATE_CHANGED

RULES: the state you emit is stored as the learner's answer and shown back to them; it never grades itself — do NOT emit scores or
pass/fail (they are ignored). Never read or expect learner identity. Do not use eval / new Function. Keep everything deterministic:
INIT with the same savedState must reproduce the same view.

MINIMAL EXAMPLE (single file, dist/index.html):
<script>
(function(){var P=1,id=null,state={count:0};
function send(t,p){window.parent.postMessage({protocolVersion:P,instanceId:id,type:t,payload:p||{}},"*")}
window.addEventListener("message",function(e){var m=e.data;if(!m||m.protocolVersion!==P)return;
 if(m.type==="SMARTSIM_INIT"){id=m.instanceId;if(m.payload.savedState)state=m.payload.savedState;render()}
 else if(m.type==="SMARTSIM_RESTORE_STATE"){state=m.payload.state||{count:0};render()}
 else if(m.type==="SMARTSIM_RESET"){state={count:0};render();send("SMARTSIM_STATE_CHANGED",{state:state})}});
function render(){document.getElementById("count").textContent=String(state.count)}
document.getElementById("inc").addEventListener("click",function(){state.count++;render();send("SMARTSIM_STATE_CHANGED",{state:state})});
send("SMARTSIM_READY",{});})();
</script>
`;
