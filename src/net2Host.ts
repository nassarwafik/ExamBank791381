// Phase 20C — networkTopology@2 HOST COMMAND PROMPT (pure; compiled into the shared server build).
//
// The PC / Laptop / Server "Command Prompt" of the curriculum simulator: a CLOSED educational grammar (ipconfig [/all | /release |
// /renew], ping, tracert, arp -a, nslookup, help). Nothing here is a shell: no pipes, no chaining, no variables, no file system, no
// program execution, no real network. Every answer is rendered from the ONE canonical host state (the server-derived operational
// adapter view) and from the simulated network engine — what `ipconfig` prints is exactly what connectivity uses.
import { isIpv4 } from "./net2Common";
import { adapterNames, deriveMac, isDnsName, type Net2Device, type Net2HostState } from "./net2Model";
import { dnsLookup, hostConnected, l3Of, pickSource, probe, type Net } from "./net2Network";

export const NET2_HOST_LIMITS = Object.freeze({ inputChars: 120, tokens: 3 });
export const HOST_PROMPT = "C:\\>";
export type HostCmd = { id: "ipconfig"; variant: "" | "all" | "release" | "renew" } | { id: "ping" | "tracert" | "nslookup"; target: string } | { id: "arp" } | { id: "help" };
export type HostStatus = "empty" | "refused" | "unknown" | "invalid" | "ok";
export type HostResult = { status: HostStatus; output: string[]; hint?: string };
export type HostParse = { kind: "ok"; cmd: HostCmd } | { kind: "fail"; result: HostResult };
const INVALID = "Invalid Command.";
const fail = (status: HostStatus, output: string[], hint?: string): HostParse => ({ kind: "fail", result: hint === undefined ? { status, output } : { status, output, hint } });
const targetOk = (t: string) => isIpv4(t) || isDnsName(t.toLowerCase());

export function parseHostCommand(raw: unknown): HostParse {
  if (typeof raw !== "string") return fail("empty", []);
  if (raw.length > NET2_HOST_LIMITS.inputChars) return fail("refused", ["The command line is too long."], "السطر أطول من الحدّ المسموح ولم يُنفَّذ.");
  const text = raw.trim();
  if (!text) return fail("empty", []);
  if (!/^[A-Za-z0-9 ./?-]+$/.test(text)) return fail("unknown", [INVALID], "موجّه الأوامر في المحاكي يقبل أوامر الشبكة التعليمية فقط (ipconfig, ping, tracert, arp -a, nslookup).");
  const t = text.split(/\s+/);
  if (t.length > NET2_HOST_LIMITS.tokens) return fail("invalid", [INVALID], "صيغة غير صحيحة؛ اكتب help لعرض الأوامر.");
  const c = t[0].toLowerCase(), arg = t[1];
  switch (c) {
    case "?": case "help": return t.length === 1 ? { kind: "ok", cmd: { id: "help" } } : fail("invalid", [INVALID]);
    case "ipconfig": {
      if (t.length === 1) return { kind: "ok", cmd: { id: "ipconfig", variant: "" } };
      const v = arg.toLowerCase();
      if (t.length === 2 && (v === "/all" || v === "/release" || v === "/renew")) return { kind: "ok", cmd: { id: "ipconfig", variant: v.slice(1) as "all" | "release" | "renew" } };
      return fail("invalid", ["Error: unrecognized or incomplete command line.", "", "USAGE:", "    ipconfig [/all | /release | /renew]"]);
    }
    case "arp": return t.length === 2 && arg.toLowerCase() === "-a" ? { kind: "ok", cmd: { id: "arp" } } : fail("invalid", ["Usage: arp -a"]);
    case "ping": case "tracert": case "nslookup":
      if (t.length !== 2 || !targetOk(arg) || (c === "nslookup" && isIpv4(arg))) return fail("invalid", [c === "nslookup" ? "Usage: nslookup <host-name>" : "Usage: " + c + " <IPv4 address | host name>"], "اكتب الأمر متبوعًا بعنوان IPv4 أو اسم مضيف.");
      return { kind: "ok", cmd: { id: c, target: isIpv4(arg) ? arg : arg.toLowerCase() } };
    default: return fail("unknown", [INVALID], "أمر غير معروف. اكتب help لعرض أوامر موجّه الأوامر.");
  }
}

const dotted = (label: string, value: string) => "   " + (label + " ").padEnd(36, ". ") + ": " + value;
const ADAPTER_TITLE: Record<string, string> = { eth0: "Ethernet adapter Ethernet0:", wlan0: "Wireless LAN adapter Wi-Fi:" };
/** `ipconfig` / `ipconfig /all` rendered from the canonical operational adapter state. */
export function renderIpconfig(net: Net, device: Net2Device, all: boolean): string[] {
  const out: string[] = ["", "Windows IP Configuration", ""];
  if (all) out.push(dotted("Host Name", device.label), "");
  const st = net.devices[device.id] as Net2HostState;
  for (const iface of adapterNames(device)) {
    const o = net.ops.adapters[device.id + "/" + iface] ?? { status: "disconnected" as const };
    const cfg = st.adapters[iface];
    out.push(ADAPTER_TITLE[iface], "");
    if (o.status === "disconnected" || !hostConnected(net, device.id, iface)) {
      out.push(dotted("Media State", "Media disconnected"));
      if (all) out.push(dotted("Physical Address", deriveMac(device.id, iface)), dotted("DHCP Enabled", cfg?.mode === "dhcp" ? "Yes" : "No"));
      out.push("");
      continue;
    }
    out.push(dotted("Connection-specific DNS Suffix", ""));
    if (all) out.push(dotted("Physical Address", deriveMac(device.id, iface)), dotted("DHCP Enabled", cfg?.mode === "dhcp" ? "Yes" : "No"));
    if (o.status === "apipa") out.push(dotted("Autoconfiguration IPv4 Address", o.address ?? "0.0.0.0"));
    else out.push(dotted("IPv4 Address", o.address ?? "0.0.0.0"));
    out.push(dotted("Subnet Mask", o.mask ?? "0.0.0.0"), dotted("Default Gateway", o.gateway ?? ""));
    if (all) {
      if (o.status === "dhcp" && o.dhcpServer) out.push(dotted("DHCP Server", o.dhcpServer));
      out.push(dotted("DNS Servers", o.dns ?? ""));
    }
    out.push("");
  }
  return out;
}
function pingLines(net: Net, host: string, target: string, address: string): string[] {
  const named = target !== address ? target + " [" + address + "]" : address;
  const src = pickSource(net, host, address);
  const out = ["", "Pinging " + named + " with 32 bytes of data:", ""];
  let received = 0, ttl = 0;
  if (!src) out.push(...Array(4).fill("PING: transmit failed. General failure."));
  else {
    const p = probe(net, src, address);
    if (p.ok) { received = 4; ttl = p.ttl ?? 128; out.push(...Array(4).fill("Reply from " + address + ": bytes=32 time<1ms TTL=" + ttl)); }
    else out.push(...Array(4).fill("Request timed out."));
  }
  out.push("", "Ping statistics for " + address + ":", "    Packets: Sent = 4, Received = " + received + ", Lost = " + (4 - received) + " (" + (received ? 0 : 100) + "% loss),");
  if (received) out.push("Approximate round trip times in milli-seconds:", "    Minimum = 0ms, Maximum = 0ms, Average = 0ms");
  return out;
}
const hopLine = (n: number, what: string) => ("  " + n).padStart(3) + "     0 ms     0 ms     0 ms     " + what;
const lossLine = (n: number) => ("  " + n).padStart(3) + "      *        *        *     Request timed out.";
function tracertLines(net: Net, host: string, target: string, address: string): string[] {
  const named = target !== address ? target + " [" + address + "]" : address;
  const out = ["", "Tracing route to " + named + " over a maximum of 30 hops:", ""];
  const src = pickSource(net, host, address);
  if (!src) { out.push(lossLine(1)); }
  else {
    const p = probe(net, src, address);
    const routerHop = p.gateway && p.routers.length ? p.gateway : undefined;
    const targetIsRouter = p.ok && p.routers.length > 0 && p.target?.dev === p.routers[0];
    if (p.ok && !routerHop) out.push(hopLine(1, address));
    else if (p.ok && targetIsRouter) out.push(hopLine(1, address));
    else if (p.ok) out.push(hopLine(1, routerHop!), hopLine(2, address));
    else if (routerHop) out.push(hopLine(1, routerHop), lossLine(2));
    else out.push(lossLine(1));
  }
  out.push("", "Trace complete.");
  return out;
}
function nslookupLines(net: Net, host: string, name: string): string[] {
  const r = dnsLookup(net, host, name);
  if (!r.ok && r.reason === "NO_DNS_SERVER") return ["Server:  UnKnown", "Address:  0.0.0.0", "", "*** No DNS server is configured on this computer."];
  const head = ["Server:  [" + r.server + "]", "Address:  " + r.server, ""];
  if (r.ok) return [...head, "Non-authoritative answer:", "Name:    " + name, "Address:  " + r.address];
  return r.reason === "NXDOMAIN" ? [...head, "*** " + r.server + " can't find " + name + ": Non-existent domain"] : [...head, "DNS request timed out.", "*** Request to " + r.server + " timed-out"];
}
function arpLines(net: Net, device: Net2Device): string[] {
  const entries = net.ops.arp[device.id] ?? [];
  if (!entries.length) return ["No ARP Entries Found."];
  const out: string[] = [];
  for (const iface of adapterNames(device)) {
    const list = entries.filter(e => e.iface === iface);
    if (!list.length) continue;
    const a = l3Of(net, { dev: device.id, iface });
    out.push("", "Interface: " + (a ? a.ip : "0.0.0.0") + " --- " + (iface === "eth0" ? "0x2" : "0x3"), "  Internet Address      Physical Address      Type");
    for (const e of list) out.push("  " + e.ip.padEnd(22) + e.mac.padEnd(22) + "dynamic");
  }
  return out.length ? out : ["No ARP Entries Found."];
}
export const HOST_HELP = ["Supported commands:", "  ipconfig [/all | /release | /renew]", "  ping <IPv4 address | host name>", "  tracert <IPv4 address | host name>", "  arp -a", "  nslookup <host name>"];
/** Resolves a ping / tracert target name through the simulated DNS (never a real resolver). */
export function resolveTarget(net: Net, host: string, target: string): string | undefined {
  if (isIpv4(target)) return target;
  const r = dnsLookup(net, host, target);
  return r.ok ? r.address : undefined;
}
/** Runs a read-or-traffic command (everything except /release and /renew, which the plugin applies to the academic state first). */
export function runHostCommand(net: Net, device: Net2Device, cmd: HostCmd): HostResult {
  switch (cmd.id) {
    case "help": return { status: "ok", output: [...HOST_HELP] };
    case "ipconfig": return { status: "ok", output: renderIpconfig(net, device, cmd.variant === "all") };
    case "arp": return { status: "ok", output: arpLines(net, device) };
    case "nslookup": return { status: "ok", output: nslookupLines(net, device.id, cmd.target) };
    case "ping": case "tracert": {
      const address = resolveTarget(net, device.id, cmd.target);
      if (!address) return { status: "ok", output: [cmd.id === "ping" ? "Ping request could not find host " + cmd.target + ". Please check the name and try again." : "Unable to resolve target system name " + cmd.target + "."] };
      return { status: "ok", output: cmd.id === "ping" ? pingLines(net, device.id, cmd.target, address) : tracertLines(net, device.id, cmd.target, address) };
    }
  }
}
