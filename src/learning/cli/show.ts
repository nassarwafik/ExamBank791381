// Learning Materials — CLI simulator: deterministic, SIMPLIFIED «show» output rendered from the simulated state.
// This is instructional simulation output (it is not printed in the book and is not real device output); the
// terminal labels it as such. Pure functions: state in, lines out.
import type { CliDeviceState, ParsedCommand } from "./types";

const ifDisplay = (name: string) => name.replace(/^f/, "FastEthernet").replace(/^g/, "GigabitEthernet").replace(/^e/, "Ethernet").replace(/^vlan/, "Vlan");
const pad = (s: string, n: number) => (s.length >= n ? s + " " : s.padEnd(n));

export function runningConfig(state: CliDeviceState): string[] {
  const out: string[] = ["!", "hostname " + state.hostname, "!"];
  if (state.vtp.mode) out.push("vtp mode " + state.vtp.mode);
  if (state.vtp.domain) out.push("vtp domain " + state.vtp.domain);
  if (state.vtp.password) out.push("vtp password " + state.vtp.password);
  for (const [id, v] of Object.entries(state.vlans).sort((a, b) => Number(a[0]) - Number(b[0]))) { out.push("vlan " + id); if (v.name) out.push(" name " + v.name); }
  for (const ex of state.dhcpExcluded) out.push("ip dhcp excluded-address " + ex.from + (ex.to ? " " + ex.to : ""));
  for (const [name, p] of Object.entries(state.dhcpPools)) {
    out.push("ip dhcp pool " + name);
    if (p.network) out.push(" network " + p.network + " " + (p.mask ?? ""));
    if (p.defaultRouter) out.push(" default-router " + p.defaultRouter);
    if (p.dnsServers.length) out.push(" dns-server " + p.dnsServers.join(" "));
  }
  for (const [name, i] of Object.entries(state.interfaces)) {
    out.push("!", "interface " + ifDisplay(name));
    if (i.encapsulationVlan !== undefined) out.push(" encapsulation dot1Q " + i.encapsulationVlan);
    if (i.ipAddress) out.push(" ip address " + i.ipAddress + " " + (i.subnetMask ?? ""));
    if (i.switchportMode) out.push(" switchport mode " + i.switchportMode);
    if (i.accessVlan !== undefined) out.push(" switchport access vlan " + i.accessVlan);
    if (i.allowedVlans?.length) out.push(" switchport trunk allowed vlan " + i.allowedVlans.join(","));
    out.push(i.shutdown ? " shutdown" : " no shutdown");
  }
  out.push("!", "end");
  return out;
}

export function ipInterfaceBrief(state: CliDeviceState): string[] {
  const out = [pad("Interface", 24) + pad("IP-Address", 17) + pad("Status", 22) + "Protocol"];
  for (const [name, i] of Object.entries(state.interfaces)) {
    const status = i.shutdown ? "administratively down" : "up";
    out.push(pad(ifDisplay(name), 24) + pad(i.ipAddress ?? "unassigned", 17) + pad(status, 22) + (i.shutdown ? "down" : "up"));
  }
  if (out.length === 1) out.push("(no interfaces configured yet)");
  return out;
}

export function vlanBrief(state: CliDeviceState): string[] {
  const out = [pad("VLAN", 6) + pad("Name", 20) + pad("Status", 10) + "Ports"];
  const ids = new Set<number>([1, ...Object.keys(state.vlans).map(Number)]);
  for (const id of [...ids].sort((a, b) => a - b)) {
    const ports = Object.entries(state.interfaces).filter(([, i]) => (i.accessVlan ?? 1) === id && i.switchportMode !== "trunk").map(([n]) => ifDisplay(n)).join(", ");
    out.push(pad(String(id), 6) + pad(state.vlans[String(id)]?.name ?? (id === 1 ? "default" : "VLAN" + String(id).padStart(4, "0")), 20) + pad("active", 10) + ports);
  }
  return out;
}

export function ipDhcpPool(state: CliDeviceState): string[] {
  const names = Object.keys(state.dhcpPools);
  if (names.length === 0) return ["(no DHCP pool configured yet)"];
  const out: string[] = [];
  for (const name of names) {
    const p = state.dhcpPools[name];
    out.push("Pool " + name + " :", " Network        : " + (p.network ? p.network + " " + (p.mask ?? "") : "(not set)"), " Default router : " + (p.defaultRouter ?? "(not set)"), " DNS server     : " + (p.dnsServers.length ? p.dnsServers.join(" ") : "(not set)"));
  }
  if (state.dhcpExcluded.length) out.push("Excluded       : " + state.dhcpExcluded.map(e => e.from + (e.to ? "-" + e.to : "")).join(", "));
  return out;
}

export function vtpStatus(state: CliDeviceState): string[] {
  return ["VTP Operating Mode : " + (state.vtp.mode ? state.vtp.mode[0].toUpperCase() + state.vtp.mode.slice(1) : "(not set)"), "VTP Domain Name    : " + (state.vtp.domain ?? "(not set)"), "VTP Password       : " + (state.vtp.password ? "(configured)" : "(not set)")];
}

/** Dispatch a parsed `show` command to its formatter. */
export function showOutput(state: CliDeviceState, cmd: Extract<ParsedCommand, { id: "show" }>): string[] {
  switch (cmd.what) {
    case "running-config": return runningConfig(state);
    case "ip-interface-brief": return ipInterfaceBrief(state);
    case "vlan-brief": return vlanBrief(state);
    case "ip-dhcp-pool": return ipDhcpPool(state);
    case "vtp-status": return vtpStatus(state);
  }
}
