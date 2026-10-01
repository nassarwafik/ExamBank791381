// Phase 16B-A — SmartSimBridgeV1: the postMessage protocol between the platform HOST (parent page) and a SIMULATOR (the
// sandboxed iframe). The PROTOCOL is the authority; docs/smartsim/sdk-v1.js is a convenience wrapper over exactly this.
// Every message is `{ protocolVersion, instanceId, type, payload }`. The host accepts a simulator message only when the
// event source IS its own iframe window, the instanceId matches (READY may carry null: the simulator does not know its id
// before INIT), protocolVersion is 1 and the type is one of SIM_TO_HOST_TYPES with a well-formed payload. Anything else is
// ignored — never thrown, never applied. Client-only module (the host); nothing here reads storage, cookies or tokens.
export const SMARTSIM_PROTOCOL_VERSION = 1;
export const HOST_TO_SIM_TYPES = Object.freeze(["SMARTSIM_INIT", "SMARTSIM_RESTORE_STATE", "SMARTSIM_SET_DISABLED", "SMARTSIM_RESET"] as const);
export const SIM_TO_HOST_TYPES = Object.freeze(["SMARTSIM_READY", "SMARTSIM_STATE_CHANGED", "SMARTSIM_REQUEST_RESET", "SMARTSIM_ERROR", "SMARTSIM_RESIZE"] as const);
export type HostToSimType = (typeof HOST_TO_SIM_TYPES)[number];
export type SimToHostType = (typeof SIM_TO_HOST_TYPES)[number];
export type BridgeMessage<T extends string = string, P = unknown> = { protocolVersion: number; instanceId: string | null; type: T; payload: P };

/** Height bounds for SMARTSIM_RESIZE (px). */
export const SMARTSIM_RESIZE_MIN_PX = 240;
export const SMARTSIM_RESIZE_MAX_PX = 1400;
export const SMARTSIM_DEFAULT_HEIGHT_PX = 480;
/** How long the host waits for SMARTSIM_READY before showing the load-failure panel. */
export const SMARTSIM_READY_TIMEOUT_MS = 15000;
/** Debounce applied to STATE_CHANGED → onStateChange (the autosave pipeline has its own 800 ms debounce on top). */
export const SMARTSIM_STATE_DEBOUNCE_MS = 150;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A fresh, unguessable instance id (one per mounted iframe). */
export function newInstanceId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return "sim-" + c.randomUUID();
  return "sim-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Parses a simulator → host message for THIS instance; null for anything the host must ignore. */
export function parseSimulatorMessage(data: unknown, expectedInstanceId: string): { type: SimToHostType; payload: Record<string, unknown> } | null {
  if (!isObj(data)) return null;
  if (data.protocolVersion !== SMARTSIM_PROTOCOL_VERSION) return null;
  const type = data.type;
  if (typeof type !== "string" || !(SIM_TO_HOST_TYPES as readonly string[]).includes(type)) return null;
  const id = data.instanceId;
  if (type === "SMARTSIM_READY") { if (id !== null && id !== undefined && id !== expectedInstanceId) return null; }
  else if (id !== expectedInstanceId) return null;
  const payload = isObj(data.payload) ? data.payload : {};
  return { type: type as SimToHostType, payload };
}

/** Builds a host → simulator message. */
export function hostMessage<P>(type: HostToSimType, instanceId: string, payload: P): BridgeMessage<HostToSimType, P> {
  return { protocolVersion: SMARTSIM_PROTOCOL_VERSION, instanceId, type, payload };
}

/** Clamps a requested frame height; undefined when the request is not a finite number. */
export function clampResizeHeight(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(SMARTSIM_RESIZE_MAX_PX, Math.max(SMARTSIM_RESIZE_MIN_PX, Math.round(v)));
}
