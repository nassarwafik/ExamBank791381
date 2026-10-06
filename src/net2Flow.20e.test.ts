import { describe, it, expect } from "vitest";
import { traceHostCommandFlow } from "./net2Flow";
import { replayNet2 } from "./net2Plugin";
import { validateNet2Config, type Net2Config } from "./net2Model";
import { makeNet, endpointsOf, l3Of } from "./net2Network";
import { NET2_TEMPLATES } from "./networkTopology2/net2Templates";

// Phase 20E — networkTopology@2 transient flow = a VISUALIZATION of the existing engine's decision, never a second network engine. The
// flow is computed by the same functions (withTraffic → resolveTarget → pickSource → probe) on the same pre-command state the replay applies
// the command to; its success is exactly the transcript's success; its hops are the engine's own L2/L3 traversal (switch trail + routers).
// Fail-first on 78445fd: src/net2Flow.ts does not exist.
type Json = Record<string, unknown>;
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const CONF = ["enable", "configure terminal"];
const ROAS = [...sw("sw1", ...CONF, "vlan 10", "vlan 20", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
  "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end"),
  ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end")];
const cfgOf = (id: string): Net2Config => { const r = validateNet2Config(NET2_TEMPLATES.find(t => t.id === id)!.config()); if (!r.ok) throw new Error(id); return r.config; };
const stateOf = (cfg: Net2Config, actions: Json[]) => { const r = replayNet2(cfg, actions); if (!r.ok) throw new Error(r.code); return r.state as unknown as { devices: Json; ops: Json }; };
const lastOutput = (cfg: Net2Config, actions: Json[], device: string) => { const r = replayNet2(cfg, actions) as unknown as { transcripts: Record<string, { result: { output: string[] } }[]> }; return r.transcripts[device].at(-1)!.result.output.join("\n"); };

describe("20E-W1 flow = the engine's own decision and traversal", () => {
  it("roas solved: PC1 → PC3 crosses SW1, the router-on-a-stick R1, then SW1 again, and succeeds exactly like the transcript", () => {
    const cfg = cfgOf("roas"), pre = stateOf(cfg, ROAS);
    const f = traceHostCommandFlow(cfg, pre, "pc1", "ping 192.168.20.11")!;
    expect(f).toMatchObject({ kind: "ping", target: "192.168.20.11", address: "192.168.20.11", ok: true, reason: "REACHABLE" });
    expect(f.hops).toEqual(["pc1", "sw1", "r1", "sw1", "pc3"]);
    expect(lastOutput(cfg, [...ROAS, { type: "host.command", deviceId: "pc1", command: "ping 192.168.20.11" }], "pc1")).toMatch(/Reply from 192\.168\.20\.11/);
    const local = traceHostCommandFlow(cfg, pre, "pc1", "ping 192.168.10.12")!;
    expect(local).toMatchObject({ ok: true }); expect(local.hops).toEqual(["pc1", "sw1", "pc2"]);
    expect(traceHostCommandFlow(cfg, pre, "pc1", "tracert 192.168.20.12")!).toMatchObject({ kind: "tracert", ok: true, hops: ["pc1", "sw1", "r1", "sw1", "pc4"] });
  });
  it("unsolved roas: the failure is shown, never animated as success; the path stops at the last device the engine reached", () => {
    const cfg = cfgOf("roas"), pre = stateOf(cfg, []);
    const f = traceHostCommandFlow(cfg, pre, "pc1", "ping 192.168.20.11")!;
    expect(f.ok).toBe(false);
    expect(f.hops[0]).toBe("pc1");
    expect(typeof f.failedAt).toBe("string");
    expect(f.hops.at(-1)).toBe(f.failedAt);
    expect(lastOutput(cfg, [{ type: "host.command", deviceId: "pc1", command: "ping 192.168.20.11" }], "pc1")).toMatch(/Request timed out/);
  });
  it("for EVERY template, host and address (before and after a partial configuration) flow.ok === the transcript's ping success", () => {
    let compared = 0;
    for (const t of NET2_TEMPLATES) {
      const cfg = cfgOf(t.id);
      for (const actions of [[] as Json[], t.id === "roas" ? ROAS : []]) {
        const pre = stateOf(cfg, actions);
        const net = makeNet(cfg, pre.devices as never, pre.ops as never);
        const addrs = [...new Set(cfg.devices.flatMap(d => endpointsOf(net, d.id).map(ep => l3Of(net, ep)?.ip).filter((x): x is string => !!x)))];
        for (const h of cfg.devices.filter(d => ["pc", "laptop", "server"].includes(d.kind)).slice(0, 4)) for (const a of addrs.slice(0, 8)) {
          const f = traceHostCommandFlow(cfg, pre, h.id, "ping " + a)!;
          const out = lastOutput(cfg, [...actions, { type: "host.command", deviceId: h.id, command: "ping " + a }], h.id);
          expect(f.ok, t.id + " " + h.id + " → " + a).toBe(/Reply from/.test(out));
          expect(f.hops[0]).toBe(h.id);
          if (f.ok) expect(endpointsOf(net, f.hops.at(-1)!).some(ep => l3Of(net, ep)?.ip === a)).toBe(true);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(40);
  });
  it("is pure: the state passed in is not mutated, and the replay of the same command is unchanged by tracing", () => {
    const cfg = cfgOf("roas"), pre = stateOf(cfg, ROAS);
    const snapshot = JSON.stringify(pre);
    traceHostCommandFlow(cfg, pre, "pc1", "ping 192.168.20.11");
    expect(JSON.stringify(pre)).toBe(snapshot);
  });
  it("non-flow commands, unknown devices, malformed input and unresolvable names yield no flow (or a no-path failure)", () => {
    const cfg = cfgOf("roas"), pre = stateOf(cfg, ROAS);
    for (const c of ["ipconfig", "arp -a", "nslookup x", "help", "", "ping", "rm -rf /", 42 as unknown as string]) expect(traceHostCommandFlow(cfg, pre, "pc1", c), String(c)).toBeNull();
    expect(traceHostCommandFlow(cfg, pre, "nope", "ping 1.1.1.1")).toBeNull();
    expect(traceHostCommandFlow(cfg, pre, "sw1", "ping 192.168.10.11")).toBeNull();
    const unresolved = traceHostCommandFlow(cfg, pre, "pc1", "ping server.unknown")!;
    expect(unresolved).toMatchObject({ ok: false, hops: ["pc1"] });
  });
  it("hops are bounded", () => {
    const cfg = cfgOf("capstone"), pre = stateOf(cfg, []);
    for (const d of cfg.devices.filter(x => x.kind === "pc")) { const f = traceHostCommandFlow(cfg, pre, d.id, "ping 192.168.50.10"); if (f) expect(f.hops.length).toBeLessThanOrEqual(32); }
  });
});
