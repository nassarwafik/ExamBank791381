/*! SmartSim SDK v1 — tiny, dependency-free helper over the SmartSimBridgeV1 postMessage protocol.
 *  The PROTOCOL (docs/smartsim/README.md) is the authority; this file is a convenience. Copy it into your dist/ or inline it.
 *  Usage (inside your simulator page):
 *    var sim = SmartSim.connect({
 *      onInit:    function (ctx) {  // ctx = { scenario, publicConfig, savedState, disabled }
 *        state = ctx.savedState || initialState(); render(); },
 *      onRestore: function (s) { state = s; render(); },
 *      onDisabled:function (d) { disabled = d; render(); },
 *      onReset:   function () { state = initialState(); render(); sim.stateChanged(state); }
 *    });
 *    button.onclick = function () { state.count++; render(); sim.stateChanged(state); };
 *  sim.ready() is sent automatically once connect() has attached its listener.
 *  Rules: state must be plain JSON (finite numbers, <= 64 KB); never send scores or pass/fail (ignored by the host);
 *  no network of any kind is available inside the sandbox. */
(function (root) {
  "use strict";
  var PROTOCOL = 1;
  function isObject(v) { return !!v && typeof v === "object"; }
  function connect(handlers) {
    handlers = handlers || {};
    var instanceId = null, initialized = false, disabled = false;
    var target = root.parent && root.parent !== root ? root.parent : null;
    function post(type, payload) {
      if (!target) return;
      target.postMessage({ protocolVersion: PROTOCOL, instanceId: instanceId, type: type, payload: payload || {} }, "*");
    }
    function onMessage(event) {
      var m = event.data;
      if (!isObject(m) || m.protocolVersion !== PROTOCOL || typeof m.type !== "string") return;
      if (m.type === "SMARTSIM_INIT") {
        if (initialized) return;
        initialized = true;
        instanceId = typeof m.instanceId === "string" ? m.instanceId : null;
        var p = isObject(m.payload) ? m.payload : {};
        disabled = p.disabled === true;
        if (handlers.onInit) handlers.onInit({ scenario: isObject(p.scenario) ? p.scenario : {}, publicConfig: isObject(p.publicConfig) ? p.publicConfig : {}, savedState: p.savedState === undefined ? null : p.savedState, disabled: disabled });
        return;
      }
      if (m.instanceId !== instanceId) return;
      var payload = isObject(m.payload) ? m.payload : {};
      if (m.type === "SMARTSIM_RESTORE_STATE") { if (handlers.onRestore) handlers.onRestore(payload.state === undefined ? null : payload.state); }
      else if (m.type === "SMARTSIM_SET_DISABLED") { disabled = payload.disabled === true; if (handlers.onDisabled) handlers.onDisabled(disabled); }
      else if (m.type === "SMARTSIM_RESET") { if (handlers.onReset) handlers.onReset(); }
    }
    root.addEventListener("message", onMessage);
    var api = {
      /** Report the learner's current state (plain JSON). Ignored by the host while disabled. */
      stateChanged: function (state) { if (disabled) return; post("SMARTSIM_STATE_CHANGED", { state: state }); },
      /** Ask the host to reset (it answers with SMARTSIM_RESET). */
      requestReset: function () { post("SMARTSIM_REQUEST_RESET", {}); },
      /** Report a failure you cannot recover from. Keep it short; no secrets, no stack traces. */
      error: function (code, message) { post("SMARTSIM_ERROR", { code: String(code || "ERROR").slice(0, 40), message: String(message || "").slice(0, 200) }); },
      /** Optional: ask for a taller / shorter frame (the host clamps to 240–1400 px). */
      resize: function (heightPx) { post("SMARTSIM_RESIZE", { height: Number(heightPx) }); },
      /** Sent automatically by connect(); exposed for custom bootstrapping. */
      ready: function () { post("SMARTSIM_READY", {}); },
      isDisabled: function () { return disabled; },
      instanceId: function () { return instanceId; },
      disconnect: function () { root.removeEventListener("message", onMessage); }
    };
    api.ready();
    return api;
  }
  var SmartSim = { PROTOCOL_VERSION: PROTOCOL, connect: connect };
  root.SmartSim = SmartSim;
})(typeof window !== "undefined" ? window : this);
