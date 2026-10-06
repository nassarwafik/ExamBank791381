import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { displayInterfaceName } from "../networkCliEngine";
import { validateNet2Config, adapterNames, type Net2Device } from "../net2Model";
import { displayRouter2Interface } from "../net2RouterCli";
import Net2Diagram from "./Net2Diagram";
import { KIND_LABEL } from "./net2Labels";
import "./net2.css";

// Phase 20C — networkTopology@2 review details (lazy, teacher only): the assigned topology, every device's SERVER-derived academic
// configuration and operational facts (effective adapters, DHCP leases and bindings, wireless associations, VTP database, Port Security)
// and the per-device histories (CLI, Command Prompt, Browser) — rendered as TEXT only, never as markup. Defensive against partial data.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));
type Entry = { input?: unknown; prompt?: unknown; status?: unknown; output?: unknown };

function deviceLines(d: Net2Device, dev: Record<string, unknown>, ops: Record<string, Record<string, unknown>>): string[] {
  const out: string[] = [];
  if (d.kind === "switch") {
    out.push("hostname " + s(dev.hostname));
    const vlans = isObj(dev.vlans) ? dev.vlans : {};
    out.push("VLANs (local): 1" + Object.keys(vlans).map(v => ", " + v + (isObj(vlans[v]) && vlans[v].name ? " (" + String(vlans[v].name) + ")" : "")).join(""));
    const vtp = isObj(dev.vtp) ? dev.vtp : {}, eff = isObj(ops.vtp?.[d.id]) ? ops.vtp[d.id] as Record<string, unknown> : {};
    out.push("VTP: mode " + s(vtp.mode) + ", domain " + s(vtp.domain) + ", version " + s(vtp.version) + ", revision " + s(eff.revision ?? vtp.revision) + (eff.source ? ", synced from " + String(eff.source) : "") + (Array.isArray(eff.vlans) ? ", effective VLANs " + eff.vlans.join(",") : ""));
    const ifs = isObj(dev.interfaces) ? dev.interfaces : {};
    for (const n of Object.keys(ifs)) {
      const c = isObj(ifs[n]) ? ifs[n] as Record<string, unknown> : {};
      const ps = isObj(c.portSecurity) ? c.portSecurity : undefined;
      const pso = isObj(ops.portSecurity?.[d.id + "|" + n]) ? ops.portSecurity[d.id + "|" + n] as Record<string, unknown> : undefined;
      out.push(displayInterfaceName(n) + ": " + [c.mode ? "mode " + String(c.mode) : "", c.accessVlan !== undefined ? "access " + String(c.accessVlan) : "", c.nativeVlan !== undefined ? "native " + String(c.nativeVlan) : "",
        Array.isArray(c.allowed) ? "allowed " + c.allowed.join(",") : "", c.ipAddress ? String(c.ipAddress) + " " + String(c.subnetMask) : "", c.shutdown === true ? "shutdown" : c.shutdown === false ? "no shutdown" : "",
        ps ? "port-security " + (ps.enabled ? "on" : "off") + " max " + String(ps.maximum) + (ps.sticky ? " sticky" : "") + " " + String(ps.violation) : "",
        pso ? "secure " + (Array.isArray(pso.secure) ? pso.secure.join(" ") : "") + ", violations " + String(pso.violations) + (pso.errDisabled ? ", ERR-DISABLED" : "") : ""].filter(Boolean).join(", "));
    }
  } else if (d.kind === "router") {
    out.push("hostname " + s(dev.hostname));
    const ifs = isObj(dev.interfaces) ? dev.interfaces : {}, subs = isObj(dev.subinterfaces) ? dev.subinterfaces : {};
    for (const n of Object.keys(ifs)) { const c = isObj(ifs[n]) ? ifs[n] as Record<string, unknown> : {}; out.push(displayRouter2Interface(n) + ": " + (c.ipAddress ? String(c.ipAddress) + " " + String(c.subnetMask) : "no ip address") + ", " + (c.shutdown === false ? "no shutdown" : "shutdown")); }
    for (const n of Object.keys(subs)) { const c = isObj(subs[n]) ? subs[n] as Record<string, unknown> : {}; out.push(displayRouter2Interface(n) + ": dot1Q " + s(c.vlan) + (c.native ? " native" : "") + ", " + (c.ipAddress ? String(c.ipAddress) + " " + String(c.subnetMask) : "no ip address")); }
    const dhcp = isObj(dev.dhcp) ? dev.dhcp : {}, pools = isObj(dhcp.pools) ? dhcp.pools : {};
    if (Array.isArray(dhcp.excluded) && dhcp.excluded.length) out.push("DHCP excluded: " + dhcp.excluded.map(e => (Array.isArray(e) ? e.join("–") : "")).join(", "));
    for (const p of Object.keys(pools)) { const c = isObj(pools[p]) ? pools[p] as Record<string, unknown> : {}; out.push("DHCP pool " + p + ": network " + s(c.network) + " " + s(c.mask) + ", default-router " + s(c.defaultRouter) + ", dns-server " + s(c.dns)); }
    const b = Array.isArray(ops.dhcpBindings?.[d.id]) ? ops.dhcpBindings[d.id] as unknown as Record<string, unknown>[] : [];
    for (const x of b) out.push("binding " + s(x.address) + "  " + s(x.mac) + "  " + s(x.client) + "  (" + s(x.pool) + ")");
  } else if (d.kind === "ap") {
    out.push("SSID " + s(dev.ssid) + ", security " + s(dev.security) + ", radio " + (dev.enabled === false ? "off" : "on") + ", passphrase " + (dev.passphrase ? "set" : "—") + ", management " + s(dev.address) + " " + s(dev.mask) + " gw " + s(dev.gateway));
  } else {
    for (const a of adapterNames(d)) {
      const o = isObj(ops.adapters?.[d.id + "/" + a]) ? ops.adapters[d.id + "/" + a] as Record<string, unknown> : {};
      out.push(a + ": " + s(o.status) + "  IPv4 " + s(o.address) + "  mask " + s(o.mask) + "  gw " + s(o.gateway) + "  DNS " + s(o.dns) + (o.dhcpServer ? "  DHCP server " + String(o.dhcpServer) : ""));
    }
    const w = isObj(ops.wifi?.[d.id]) ? ops.wifi[d.id] as Record<string, unknown> : undefined;
    if (w) out.push("Wi-Fi: " + s(w.status) + (w.ssid ? " " + String(w.ssid) : "") + (w.ap ? " via " + String(w.ap) : ""));
    const b = Array.isArray(ops.dhcpBindings?.[d.id]) ? ops.dhcpBindings[d.id] as unknown as Record<string, unknown>[] : [];
    for (const x of b) out.push("binding " + s(x.address) + "  " + s(x.mac) + "  " + s(x.client));
  }
  return out;
}

export default function Net2Review({ config, state, details }: SmartSimReviewDetailsProps) {
  const cfgR = validateNet2Config(config);
  if (!cfgR.ok) return null;
  const cfg = cfgR.config;
  const st = isObj(state) ? state : {};
  const devices = isObj(st.devices) ? st.devices : {};
  const opsRaw = isObj(st.ops) ? st.ops : {};
  const ops: Record<string, Record<string, unknown>> = {};
  for (const k of ["adapters", "wifi", "dhcpBindings", "vtp", "portSecurity"]) ops[k] = isObj(opsRaw[k]) ? opsRaw[k] as Record<string, unknown> : {};
  const transcripts = isObj(details.transcripts) ? details.transcripts : {};
  return (
    <div className="net2-review" data-testid="net2-review">
      <Net2Diagram config={cfg} title={"مخطط الشبكة المسند: " + cfg.devices.length + " أجهزة"} testId="net2-review-diagram" />
      {cfg.devices.map(d => {
        const dev = isObj(devices[d.id]) ? devices[d.id] as Record<string, unknown> : {};
        const t = Array.isArray(transcripts[d.id]) ? (transcripts[d.id] as Entry[]) : [];
        return (
          <section key={d.id} aria-label={d.label}>
            <h5>{d.label} ({KIND_LABEL[d.kind]})</h5>
            <pre className="net2-pre" data-testid="net2-review-state">{deviceLines(d, dev, ops).join("\n")}</pre>
            {t.length > 0 && <details><summary>السجل ({t.length})</summary><pre className="net2-pre" data-testid="net2-review-history">{t.map(e => String(e.prompt ?? "") + " " + String(e.input ?? "") + (e.status && e.status !== "ok" ? "   [" + String(e.status) + "]" : "") + (Array.isArray(e.output) && e.output.length ? "\n" + e.output.map(String).join("\n") : "")).join("\n")}</pre></details>}
          </section>
        );
      })}
    </div>
  );
}
