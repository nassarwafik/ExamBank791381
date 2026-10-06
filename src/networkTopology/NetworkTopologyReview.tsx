import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { SWITCH_PORTS, displayInterfaceName, effectiveInterfaceConfig, normalizeDeviceState } from "../networkCliEngine";
import { ROUTER_PORTS, displayRouterInterface, effectiveRouterInterface, normalizeRouterState } from "../routerCliEngine";
import { validateTopologyConfig, type PcConfig } from "../networkTopologyModel";
import TopologyDiagram from "./TopologyDiagram";
import { DEVICE_KIND_LABEL } from "./topologyLabels";
import "./network-topology.css";

// Phase 20B — networkTopology@1 review details (lazy, teacher only): the assigned topology, the student's SERVER-derived canonical device
// configurations (PCs, switches, routers) and every device's command history — rendered as text, never as markup.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Entry = { input?: unknown; prompt?: unknown; status?: unknown; output?: unknown };

export default function NetworkTopologyReview({ config, state, details }: SmartSimReviewDetailsProps) {
  const cfgR = validateTopologyConfig(config);
  if (!cfgR.ok) return null;
  const cfg = cfgR.config;
  const st = isObj(state) ? state : {};
  const pcs = isObj(st.pcs) ? st.pcs : {}, switches = isObj(st.switches) ? st.switches : {}, routers = isObj(st.routers) ? st.routers : {};
  const transcripts = isObj(details.transcripts) ? details.transcripts : {};
  return (
    <div className="nettopo-review" data-testid="nettopo-review">
      <TopologyDiagram config={cfg} title={"مخطط الشبكة المسند: " + cfg.devices.length + " أجهزة"} testId="nettopo-review-diagram" />
      {cfg.devices.map(d => {
        const lines: string[] = [];
        if (d.kind === "pc") { const p = (isObj(pcs[d.id]) ? pcs[d.id] : {}) as PcConfig; lines.push("IPv4: " + (p.address ?? "—") + "  mask: " + (p.mask ?? "—"), "gateway: " + (p.gateway ?? "—") + "  DNS: " + (p.dns ?? "—")); }
        if (d.kind === "switch") {
          const r = normalizeDeviceState(switches[d.id]);
          if (r.ok) {
            lines.push("hostname " + r.state.hostname, "VLANs: 1" + Object.keys(r.state.vlans).map(v => ", " + v + (r.state.vlans[v].name ? " (" + r.state.vlans[v].name + ")" : "")).join(""));
            for (const n of [...SWITCH_PORTS, ...Object.keys(r.state.interfaces).filter(x => x.startsWith("vlan"))]) {
              if (!r.state.interfaces[n]) continue;
              const e = effectiveInterfaceConfig(r.state, n);
              lines.push(displayInterfaceName(n) + ": " + [e.mode ? "mode " + e.mode : "", "access " + e.accessVlan, "native " + e.nativeVlan, e.ipAddress ? e.ipAddress + " " + e.subnetMask : "", e.shutdown ? "shutdown" : "up"].filter(Boolean).join(", "));
            }
          }
        }
        if (d.kind === "router") {
          const r = normalizeRouterState(routers[d.id]);
          if (r.ok) { lines.push("hostname " + r.state.hostname); for (const p of ROUTER_PORTS) { const e = effectiveRouterInterface(r.state, p); lines.push(displayRouterInterface(p) + ": " + (e.ipAddress ? e.ipAddress + " " + e.subnetMask : "no ip address") + ", " + (e.shutdown ? "shutdown" : "up")); } }
        }
        const t = Array.isArray(transcripts[d.id]) ? (transcripts[d.id] as Entry[]) : [];
        return (
          <section key={d.id} aria-label={d.label}>
            <h5>{d.label} ({DEVICE_KIND_LABEL[d.kind]})</h5>
            <pre data-testid="nettopo-review-state">{lines.join("\n")}</pre>
            {t.length > 0 && <details><summary>سجل الأوامر ({t.length})</summary><pre data-testid="nettopo-review-history">{t.map(e => String(e.prompt ?? "") + " " + String(e.input ?? "") + (e.status && e.status !== "ok" ? "   [" + String(e.status) + "]" : "")).join("\n")}</pre></details>}
          </section>
        );
      })}
    </div>
  );
}
