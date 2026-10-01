// A typed mirror of docs/smartsim/sdk-v1.js for TypeScript projects. The protocol is the authority.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type InitContext = { scenario: Record<string, unknown>; publicConfig: Record<string, unknown>; savedState: JsonValue | null; disabled: boolean };
type Handlers = { onInit?: (ctx: InitContext) => void; onRestore?: (state: JsonValue | null) => void; onDisabled?: (disabled: boolean) => void; onReset?: () => void };
const PROTOCOL = 1;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

export function connect(handlers: Handlers) {
  let instanceId: string | null = null, initialized = false, disabled = false;
  const target = window.parent !== window ? window.parent : null;
  const post = (type: string, payload: unknown) => { target?.postMessage({ protocolVersion: PROTOCOL, instanceId, type, payload: payload ?? {} }, "*"); };
  const onMessage = (event: MessageEvent) => {
    const m = event.data;
    if (!isObject(m) || m.protocolVersion !== PROTOCOL || typeof m.type !== "string") return;
    if (m.type === "SMARTSIM_INIT") {
      if (initialized) return;
      initialized = true; instanceId = typeof m.instanceId === "string" ? m.instanceId : null;
      const p = isObject(m.payload) ? m.payload : {};
      disabled = p.disabled === true;
      handlers.onInit?.({ scenario: isObject(p.scenario) ? p.scenario : {}, publicConfig: isObject(p.publicConfig) ? p.publicConfig : {}, savedState: (p.savedState ?? null) as JsonValue | null, disabled });
      return;
    }
    if (m.instanceId !== instanceId) return;
    const payload = isObject(m.payload) ? m.payload : {};
    if (m.type === "SMARTSIM_RESTORE_STATE") handlers.onRestore?.((payload.state ?? null) as JsonValue | null);
    else if (m.type === "SMARTSIM_SET_DISABLED") { disabled = payload.disabled === true; handlers.onDisabled?.(disabled); }
    else if (m.type === "SMARTSIM_RESET") handlers.onReset?.();
  };
  window.addEventListener("message", onMessage);
  const api = {
    stateChanged: (state: JsonValue) => { if (!disabled) post("SMARTSIM_STATE_CHANGED", { state }); },
    requestReset: () => post("SMARTSIM_REQUEST_RESET", {}),
    error: (code: string, message = "") => post("SMARTSIM_ERROR", { code: code.slice(0, 40), message: message.slice(0, 200) }),
    resize: (height: number) => post("SMARTSIM_RESIZE", { height }),
    isDisabled: () => disabled,
    disconnect: () => window.removeEventListener("message", onMessage)
  };
  post("SMARTSIM_READY", {});
  return api;
}
