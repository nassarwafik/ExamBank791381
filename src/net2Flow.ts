// Phase 20E — networkTopology@2 TRANSIENT FLOW (pure; presentation only — not part of the shared server build).
//
// A ping / tracert flow is a VISUALIZATION of the decision the operational engine already makes for the Command Prompt: it runs the very
// same functions as runHostCommand (withTraffic → resolveTarget → pickSource → probe) on the same pre-command state, with the engine's
// opt-in inert trace attached, and reads back the engine's own traversal (the switch trail of every ARP exchange of the request leg plus
// the devices that answered it). There is no routing, pathfinding or success decision here: `ok` is the probe's verdict, which is exactly
// what makes the transcript print "Reply from". The result is never stored in an answer and never graded.
//
// Out of scope (v1): DNS (nslookup), DHCP (ipconfig /renew) and browser flows are not visualized. A name target is still resolved through
// the simulated DNS exactly like the transcript, but only the ping / tracert probe itself is drawn.
import { isHostKind, type Net2Config, type Net2DeviceState } from "./net2Model";
import { pickSource, probe, withTraffic, type Net, type Net2Ops } from "./net2Network";
import { parseHostCommand, resolveTarget } from "./net2Host";

export type Net2Flow = { kind: "ping" | "tracert"; target: string; address?: string; ok: boolean; reason: string; hops: string[]; failedAt?: string };
/** The most hops one flow may carry (the presentation runtime's bound; the first hops and the last reached device are kept). */
export const NET2_FLOW_HOPS_MAX = 32;

/** Consecutive duplicate hops collapsed; above the bound, the first hops and the LAST reached device are kept. */
export function boundedHops(hops: readonly string[]): string[] {
  const out: string[] = [];
  for (const h of hops) if (out[out.length - 1] !== h) out.push(h);
  return out.length > NET2_FLOW_HOPS_MAX ? [...out.slice(0, NET2_FLOW_HOPS_MAX - 1), out[out.length - 1]] : out;
}

/**
 * The engine's flow for a host Command Prompt line, or null when the line is not a ping / tracert of an existing host. Pure: the given
 * state is cloned (withTraffic clones the operational state; the academic device states are cloned here) and never mutated.
 */
export function traceHostCommandFlow(config: Net2Config, state: { devices: unknown; ops: unknown }, deviceId: string, command: unknown): Net2Flow | null {
  const device = config.devices.find(d => d.id === deviceId);
  if (!device || !isHostKind(device.kind)) return null;
  if (!state || typeof state.devices !== "object" || state.devices === null || typeof state.ops !== "object" || state.ops === null) return null;
  const parsed = parseHostCommand(command);
  if (parsed.kind !== "ok" || (parsed.cmd.id !== "ping" && parsed.cmd.id !== "tracert")) return null;
  const kind: Net2Flow["kind"] = parsed.cmd.id, target = parsed.cmd.target;
  const devices = JSON.parse(JSON.stringify(state.devices)) as Record<string, Net2DeviceState>;
  if (!devices[device.id]) return null;
  try {
    return withTraffic(config, devices, state.ops as Net2Ops, (net: Net): Net2Flow => {
      const address = resolveTarget(net, device.id, target);
      if (!address) return { kind, target, ok: false, reason: "UNRESOLVED", hops: [device.id], failedAt: device.id };
      const src = pickSource(net, device.id, address);
      if (!src) return { kind, target, address, ok: false, reason: "SOURCE_NO_ADDRESS", hops: [device.id], failedAt: device.id };
      // the trace observes only the probe the transcript prints (a name lookup above is its own exchange and is not drawn)
      const trace: NonNullable<Net["trace"]> = { phase: "request", lastTrail: [], segments: [] };
      net.trace = trace;
      const p = probe(net, src, address);
      const raw = [device.id];
      for (const s of trace.segments) if (s.phase === "request") raw.push(...s.switches, s.to);
      const hops = boundedHops(raw);
      return p.ok
        ? { kind, target, address, ok: true, reason: p.reason, hops }
        : { kind, target, address, ok: false, reason: p.reason, hops, failedAt: hops[hops.length - 1] };
    }).result;
  } catch {
    return null;   // a presentation trace never breaks the workspace; the transcript (the academic record) is unaffected either way
  }
}
