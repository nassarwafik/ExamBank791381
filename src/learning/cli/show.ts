// Learning Materials — CLI simulator: deterministic, SIMPLIFIED «show» output rendered from the simulated state.
// This is instructional simulation output (it is not printed in the book and is not real device output); the
// terminal labels it as such. Pure functions: state in, lines out. Secrets are never echoed: `enable secret` and
// encrypted line passwords are shown as hidden placeholders, as a real device would obscure them.
import type { CliDeviceState, CliLineName, ParsedCommand } from "./types";
import { aclEntryText, ospfNetworkText, networkOf, prefixLength } from "./normalize";

const ifDisplay = (name: string) => name.replace(/^f/, "FastEthernet").replace(/^g/, "GigabitEthernet").replace(/^e/, "Ethernet").replace(/^vlan/, "Vlan");
const pad = (s: string, n: number) => (s.length >= n ? s + " " : s.padEnd(n));
const HIDDEN = "<hidden>";

function lineBlock(state: CliDeviceState, line: CliLineName): string[] {
  const l = state.lines[line];
  if (!l.password && !l.login) return [];
  const out = ["line " + (line === "console" ? "console 0" : "vty 0 4")];
  if (l.password) out.push(" password " + (state.passwordEncryption ? "7 " + HIDDEN : l.password));
  if (l.login) out.push(" login");
  return out;
}

export function runningConfig(state: CliDeviceState): string[] {
  const out: string[] = ["!", "hostname " + state.hostname, "!"];
  if (state.passwordEncryption) out.push("service password-encryption");
  if (state.enableSecret) out.push("enable secret 5 " + HIDDEN);
  if (state.banner !== undefined) out.push("banner motd ^C" + state.banner + "^C");
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
    const ps = i.portSecurity;
    if (ps) {
      if (ps.enabled) out.push(" switchport port-security");
      if (ps.maximum !== undefined) out.push(" switchport port-security maximum " + ps.maximum);
      if (ps.violation) out.push(" switchport port-security violation " + ps.violation);
      if (ps.sticky) out.push(" switchport port-security mac-address sticky");
      if (ps.macAddress) out.push(" switchport port-security mac-address " + ps.macAddress);
    }
    if (i.accessGroup) out.push(" ip access-group " + i.accessGroup.acl + " " + i.accessGroup.direction);
    out.push(i.shutdown ? " shutdown" : " no shutdown");
  }
  if (state.routing.ospf) { out.push("!", "router ospf " + state.routing.ospf.id); for (const n of state.routing.ospf.networks) out.push(" network " + ospfNetworkText(n)); }
  if (state.routing.eigrp) { out.push("!", "router eigrp " + state.routing.eigrp.id); for (const n of state.routing.eigrp.networks) out.push(" network " + n); }
  const aclNumbers = Object.keys(state.acls).map(Number).sort((a, b) => a - b);
  if (aclNumbers.length) out.push("!");
  for (const n of aclNumbers) for (const e of state.acls[String(n)]) out.push("access-list " + n + " " + aclEntryText(e));
  out.push("!", ...lineBlock(state, "console"), ...lineBlock(state, "vty"), "!", "end");
  return out;
}

/** The book (PDF 190) says «لا تنسَ الحفظ بعد البرمجة» but prints no save command, so nothing is ever saved here. */
export function startupConfig(): string[] {
  return ["startup-config is not present", "% (simulation) nothing has been saved to startup-config yet"];
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

/** `show port-security`: one row per interface with Port Security enabled. */
export function portSecurity(state: CliDeviceState): string[] {
  const rows = Object.entries(state.interfaces).filter(([, i]) => i.portSecurity?.enabled);
  if (rows.length === 0) return ["(no interface has port-security enabled yet)"];
  const out = [pad("Secure Port", 20) + pad("MaxSecureAddr", 15) + pad("CurrentAddr", 13) + "SecurityViolation"];
  for (const [name, i] of rows) {
    const ps = i.portSecurity!;
    out.push(pad(ifDisplay(name), 20) + pad(String(ps.maximum ?? 1), 15) + pad(String(ps.macAddress ? 1 : 0), 13) + (ps.violation ?? "shutdown"));
  }
  return out;
}

/** `show port-security interface <name>`: the details of one interface. */
export function portSecurityInterface(state: CliDeviceState, name: string): string[] {
  const i = state.interfaces[name];
  const ps = i?.portSecurity;
  const out = ["Port Security              : " + (ps?.enabled ? "Enabled" : "Disabled")];
  if (!i) return [...out, "% (simulation) interface " + ifDisplay(name) + " has no configuration yet"];
  out.push("Port Status                : " + (i.shutdown ? "Secure-shutdown" : "Secure-up"));
  out.push("Violation Mode             : " + (ps?.violation ?? "shutdown"));
  out.push("Maximum MAC Addresses      : " + String(ps?.maximum ?? 1));
  out.push("Sticky MAC Addresses       : " + (ps?.sticky ? "enabled" : "0"));
  out.push("Configured MAC Address     : " + (ps?.macAddress ?? "(none)"));
  return out;
}

/**
 * `show ip route` (PDF 222): the connected routes of every interface that is up and addressed. Routes learned
 * from OSPF / EIGRP neighbours are not simulated (there is only one device), so the output says so instead of
 * inventing them.
 */
export function ipRoute(state: CliDeviceState): string[] {
  const out = ["Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", ""];
  const rows = Object.entries(state.interfaces).filter(([, i]) => i.ipAddress && i.subnetMask && !i.shutdown);
  for (const [name, i] of rows) out.push("C    " + networkOf(i.ipAddress!, i.subnetMask!) + "/" + prefixLength(i.subnetMask!) + " is directly connected, " + ifDisplay(name));
  if (rows.length === 0) out.push("(no connected networks yet: give an interface an address and no shutdown)");
  if (state.routing.ospf || state.routing.eigrp) out.push("% (simulation) routes learned via " + [state.routing.ospf && "OSPF", state.routing.eigrp && "EIGRP"].filter(Boolean).join(" / ") + " appear only after neighbours exchange updates");
  return out;
}

/** Dispatch a parsed `show` command to its formatter. */
export function showOutput(state: CliDeviceState, cmd: Extract<ParsedCommand, { id: "show" }>): string[] {
  switch (cmd.what) {
    case "running-config": return runningConfig(state);
    case "startup-config": return startupConfig();
    case "ip-interface-brief": return ipInterfaceBrief(state);
    case "vlan-brief": return vlanBrief(state);
    case "ip-dhcp-pool": return ipDhcpPool(state);
    case "vtp-status": return vtpStatus(state);
    case "port-security": return cmd.iface ? portSecurityInterface(state, cmd.iface) : portSecurity(state);
    case "ip-route": return ipRoute(state);
  }
}
