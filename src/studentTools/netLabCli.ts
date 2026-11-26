// N2 (docs/enterprise-network-lab-tool-design.md §7) — the network LAB's router commands, client-only.
//
// networkTopology@2's router CLI (net2RouterCli) stays exactly as it is: in the lab, every router line first passes through this layer, and
// whatever it does not recognise goes to that CLI unchanged. This layer owns only what the lab adds:
//   global      interface serial0/0/0 · ip route <net> <mask> <next-hop | exit-interface> · router rip | ospf <id> | eigrp <as> ·
//               access-list <1-199> … · ip nat inside source static <local> <global> · ip nat inside source list <n> interface <if> overload ·
//               ipv6 unicast-routing · ipv6 route <prefix/len> <next-hop>   (and their `no` forms)
//   router      network … · version 2 · no auto-summary · default-information originate · router-id · passive-interface · exit / end
//   interface   ip access-group <n> in|out · ip nat inside|outside · ipv6 address <addr/len>; on a SERIAL interface also ip address,
//               shutdown / no shutdown, encapsulation ppp | hdlc, clock rate, bandwidth
//   show        ip route (static, RIP, OSPF, EIGRP) · running-config · ip interface brief (with the serial ports) · access-lists ·
//               ip nat translations · ip protocols · ip ospf neighbor · ip eigrp neighbors · ipv6 interface brief · ipv6 route
// The lab router state is a separate object (netLabModel.LabRouter) next to the exam's router state, never inside it.
import { executeRouterCommand2, normalizeRouter2Interface, parseRouterCommand, ROUTER2_MODE_SUFFIX, type Router2Session } from "../net2RouterCli";
import { networksOverlap } from "../routerCliEngine";
import { intToIpv4, ipv4ToInt, isIpv4, isSubnetMask, isUsableHostAddress, networkAddress, pad, prefixLength } from "../net2Common";
import { linkUp, type Net } from "../net2Network";
import { LAB_LIMITS, SERIAL_PORTS, emptyLabRouter, formatIpv6, isSerialPort, parseIpv6, parseIpv6Prefix, v6Display, type LabAclEntry, type LabMatch, type LabRouter } from "./netLabModel";
import { labAdjacencies, labIfAdmin, labIfName, labIfUp, labRoutingTable, routerV4Addresses, v6Of } from "./netLabEngine";

export type LabSub = "rip" | "ospf" | "eigrp" | null;
export type LabCliResult = { status: "ok" | "invalid" | "incomplete" | "wrong-mode"; output: string[]; hint?: string };
export type LabCliOutcome =
  | { kind: "handled"; session: Router2Session; lab: LabRouter; sub: LabSub; result: LabCliResult }
  /** Not a lab command: networkTopology@2's CLI runs it (with the router sub-mode left, when it was in one). */
  | { kind: "delegate"; sub: LabSub };

const CONFIG = ["global", "interface", "subif", "dhcp", "line"];
const PORT_NAMES: Readonly<Record<string, number>> = { www: 80, http: 80, domain: 53, ftp: 21, telnet: 23, smtp: 25, ssh: 22 };
export const labPrompt = (s: Router2Session, sub: LabSub): string => s.state.hostname + (sub && s.mode === "global" ? "(config-router)#" : ROUTER2_MODE_SUFFIX[s.mode]);
const clone = (lr: LabRouter): LabRouter => JSON.parse(JSON.stringify(lr)) as LabRouter;
/** "serial0/0/0", "se0/0/1", "s0/0/0" → "s0/0/0"; null otherwise. */
export function normSerial(raw: string): string | null {
  const m = /^(?:serial|se|s)(0\/0\/[01])$/.exec(raw.toLowerCase().replace(/\s+/g, ""));
  return m ? "s" + m[1] : null;
}
const normIface = (raw: string): string | null => normSerial(raw) ?? normalizeRouter2Interface(raw);
const wildOk = (w: string) => isIpv4(w);
const net4 = (ip: string, wild: string) => intToIpv4((ipv4ToInt(ip) & ~ipv4ToInt(wild)) >>> 0);
/** An ACL address match from tokens (any | host A | A [W]); returns the match and the tokens used. */
function readMatch(t: string[], i: number, standard: boolean): { m: LabMatch; used: number } | null {
  const x = (t[i] ?? "").toLowerCase();
  if (x === "any") return { m: { any: true }, used: 1 };
  if (x === "host" && isIpv4(t[i + 1] ?? "")) return { m: { ip: t[i + 1], wild: "0.0.0.0" }, used: 2 };
  if (!isIpv4(t[i] ?? "")) return null;
  if (t[i + 1] && isIpv4(t[i + 1]) && wildOk(t[i + 1])) return { m: { ip: net4(t[i], t[i + 1]), wild: t[i + 1] }, used: 2 };
  return standard ? { m: { ip: t[i], wild: "0.0.0.0" }, used: 1 } : null;
}
const matchText = (m: LabMatch) => ("any" in m ? "any" : m.wild === "0.0.0.0" ? "host " + m.ip : m.ip + " " + m.wild);
const matchShow = (m: LabMatch) => ("any" in m ? "any" : m.wild === "0.0.0.0" ? "host " + m.ip : m.ip + ", wildcard bits " + m.wild);
const entryText = (e: LabAclEntry, standard: boolean) => standard ? e.action + " " + matchText(e.src) : e.action + " " + e.proto + " " + matchText(e.src) + " " + matchText(e.dst ?? { any: true }) + (e.port !== undefined ? " eq " + e.port : "");

export function labRouterCommand(input: { session: Router2Session; lab: LabRouter | undefined; sub: LabSub; line: string; view: () => Net; id: string }): LabCliOutcome {
  const { session, id } = input;
  let sub = input.sub;
  const lab0 = input.lab ?? emptyLabRouter();
  const raw = typeof input.line === "string" ? input.line : "";
  let t = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!t.length || raw.length > 200 || t.length > 24) return { kind: "delegate", sub };
  let viaDo = false;
  if (t[0].toLowerCase() === "do" && t.length > 1) { viaDo = true; t = t.slice(1); }
  const l = t.map(x => x.toLowerCase());
  const mode = session.mode, inConfig = CONFIG.includes(mode);
  const done = (lab: LabRouter, output: string[] = [], hint?: string, s: Router2Session = session, sb: LabSub = sub): LabCliOutcome =>
    ({ kind: "handled", session: s, lab, sub: sb, result: { status: "ok", output, ...(hint ? { hint } : {}) } });
  const bad = (status: LabCliResult["status"], text: string, hint: string): LabCliOutcome => ({ kind: "handled", session, lab: lab0, sub, result: { status, output: ["% " + text], hint } });
  const invalid = (text: string, syntax: string) => bad("invalid", text, "الصيغة: " + syntax);

  // ── show ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (l[0] === "show" || l[0] === "sh") {
    if (viaDo && !inConfig) return { kind: "delegate", sub };
    const out = showCommand(l.slice(1), session, lab0, input.view, id);
    return out ? done(lab0, out) : { kind: "delegate", sub };
  }
  if (viaDo) return { kind: "delegate", sub };

  // ── router (rip / ospf / eigrp) configuration mode ────────────────────────────────────────────────────────────────────────────
  if (sub && mode === "global") {
    const lab = clone(lab0), no = l[0] === "no", w = no ? l.slice(1) : l, tw = no ? t.slice(1) : t;
    if (w[0] === "network") {
      if (sub === "rip") {
        if (!isIpv4(tw[1] ?? "") || tw.length !== 2) return invalid("expected: network <classful-network>", "network 192.168.1.0");
        const n = networkAddress(tw[1], (ipv4ToInt(tw[1]) >>> 24) < 128 ? "255.0.0.0" : (ipv4ToInt(tw[1]) >>> 24) < 192 ? "255.255.0.0" : "255.255.255.0");
        lab.rip!.networks = no ? lab.rip!.networks.filter(x => x !== n) : lab.rip!.networks.includes(n) || lab.rip!.networks.length >= LAB_LIMITS.networks ? lab.rip!.networks : [...lab.rip!.networks, n];
        return done(lab);
      }
      if (sub === "ospf") {
        if (tw.length !== 5 || !isIpv4(tw[1]) || !isIpv4(tw[2]) || w[3] !== "area" || !/^\d{1,5}$/.test(tw[4])) return invalid("expected: network <address> <wildcard> area <id>", "network 10.0.0.0 0.0.0.255 area 0");
        const e = { net: net4(tw[1], tw[2]), wild: tw[2], area: Number(tw[4]) };
        lab.ospf!.networks = no ? lab.ospf!.networks.filter(x => !(x.net === e.net && x.wild === e.wild)) : lab.ospf!.networks.some(x => x.net === e.net && x.wild === e.wild) || lab.ospf!.networks.length >= LAB_LIMITS.networks ? lab.ospf!.networks : [...lab.ospf!.networks, e];
        return done(lab);
      }
      if (!isIpv4(tw[1] ?? "") || tw.length > 3 || (tw[2] !== undefined && !isIpv4(tw[2]))) return invalid("expected: network <address> [<wildcard>]", "network 10.0.0.0 0.0.0.255");
      const e = tw[2] ? { net: net4(tw[1], tw[2]), wild: tw[2] } : { net: tw[1] };
      lab.eigrp!.networks = no ? lab.eigrp!.networks.filter(x => !(x.net === e.net && x.wild === e.wild)) : lab.eigrp!.networks.some(x => x.net === e.net && x.wild === e.wild) || lab.eigrp!.networks.length >= LAB_LIMITS.networks ? lab.eigrp!.networks : [...lab.eigrp!.networks, e];
      return done(lab);
    }
    if (!no && w[0] === "version" && (w[1] === "1" || w[1] === "2") && sub === "rip") return done(lab);
    if (w[0] === "auto-summary" && sub !== "ospf") return done(lab, [], "مقبول؛ هذا المحاكي لا يلخّص الشبكات (كأنها no auto-summary).");
    if (w[0] === "default-information" && w[1] === "originate" && w.length === 2 && sub !== "eigrp") {
      const cfg = sub === "rip" ? lab.rip! : lab.ospf!;
      if (no) delete cfg.originate; else cfg.originate = true;
      return done(lab, [], no ? undefined : "يُنشر المسار الافتراضي (0.0.0.0/0) لجيران البروتوكول إذا كان في هذا الراوتر مسار افتراضي ثابت.");
    }
    if (!no && ((w[0] === "router-id" && sub === "ospf" && isIpv4(tw[1] ?? "")) || w[0] === "passive-interface")) return done(lab, [], "مقبول؛ لا أثر له في هذا المحاكي.");
    if (!no && w[0] === "exit" && w.length === 1) return done(lab0, [], undefined, session, null);
    if (!no && w[0] === "end" && w.length === 1) return done(lab0, [], undefined, { state: session.state, mode: "privileged" }, null);
    sub = null;   // any other line leaves the router mode (as in IOS, a global command runs in global configuration mode)
  }

  // ── interface commands of the lab ─────────────────────────────────────────────────────────────────────────────────────────────
  const sel = session.selectedInterface;
  if ((mode === "interface" || mode === "subif") && sel) {
    const lab = clone(lab0), no = l[0] === "no", w = no ? l.slice(1) : l, tw = no ? t.slice(1) : t;
    if (w[0] === "ip" && w[1] === "access-group") {
      const dir = w[w.length - 1];
      if (dir !== "in" && dir !== "out") return invalid("expected: ip access-group <1-199> in|out", "ip access-group 1 in");
      if (no) { const cur = lab.ifAcl[sel]; if (cur) { delete cur[dir]; if (!cur.in && !cur.out) delete lab.ifAcl[sel]; } return done(lab); }
      if (w.length !== 4 || !/^\d{1,3}$/.test(w[2]) || Number(w[2]) < 1 || Number(w[2]) > 199) return invalid("expected: ip access-group <1-199> in|out", "ip access-group 1 in");
      lab.ifAcl[sel] = { ...(lab.ifAcl[sel] ?? {}), [dir]: String(Number(w[2])) };
      return done(lab);
    }
    if (w[0] === "ip" && w[1] === "nat" && (w[2] === "inside" || w[2] === "outside") && w.length === 3) {
      const other = w[2] === "inside" ? "outside" : "inside";
      lab.nat[w[2]] = no ? lab.nat[w[2]].filter(x => x !== sel) : [...new Set([...lab.nat[w[2]], sel])];
      if (!no) lab.nat[other] = lab.nat[other].filter(x => x !== sel);
      return done(lab);
    }
    if (w[0] === "ipv6" && w[1] === "address") {
      if (no) { delete lab.v6.ifs[sel]; return done(lab); }
      const p = tw.length === 3 ? parseIpv6Prefix(tw[2]) : null;
      if (!p) return invalid("expected: ipv6 address <ipv6-address>/<prefix-length>", "ipv6 address 2001:db8:1::1/64");
      const clash = Object.entries(lab.v6.ifs).find(([n, a]) => n !== sel && v6Overlap(a, p));
      if (clash) return bad("invalid", formatIpv6(parseIpv6(p.addr)!) + "/" + p.len + " overlaps with " + labIfName(clash[0]), "كل واجهة في شبكة IPv6 مختلفة.");
      lab.v6.ifs[sel] = p;
      return done(lab);
    }
    if (!no && w[0] === "ipv6" && w[1] === "enable" && w.length === 2) return done(lab0);
    if (isSerialPort(sel)) {
      const s = { ...(lab.serial[sel] ?? {}) };
      if (w[0] === "ip" && (w[1] === "address" || w[1] === "addr")) {
        if (no) { delete s.ip; delete s.mask; lab.serial[sel] = s; return done(lab); }
        if (tw.length !== 4 || !isIpv4(tw[2]) || !isSubnetMask(tw[3]) || !isUsableHostAddress(tw[2], tw[3])) return invalid("bad address or mask", "ip address 10.0.0.1 255.255.255.252");
        const clash = routerV4Addresses(session.state, lab0).find(a => a.name !== sel && networksOverlap(tw[2], tw[3], a.ipAddress, a.subnetMask));
        if (clash) return bad("invalid", networkAddress(tw[2], tw[3]) + " overlaps with " + labIfName(clash.name), "كل واجهة في الراوتر في شبكة مختلفة.");
        lab.serial[sel] = { ...s, ip: tw[2], mask: tw[3] };
        return done(lab);
      }
      if ((w[0] === "shutdown" || w[0] === "shut") && w.length === 1) {
        if (no) lab.serial[sel] = { ...s, up: true }; else { delete s.up; lab.serial[sel] = s; }
        return done(lab, no ? ["%LINK-5-CHANGED: Interface " + labIfName(sel) + ", changed state to up"] : ["%LINK-5-CHANGED: Interface " + labIfName(sel) + ", changed state to administratively down"]);
      }
      if (!no && w[0] === "encapsulation" && (w[1] === "ppp" || w[1] === "hdlc") && w.length === 2) {
        if (w[1] === "ppp") s.encap = "ppp"; else delete s.encap;
        lab.serial[sel] = s;
        return done(lab, [], "طرفا الكابل التسلسلي يجب أن يستعملا التغليف نفسه (HDLC أو PPP)، وإلا يبقى البروتوكول down.");
      }
      if (w[0] === "clock" && w[1] === "rate") {
        if (no) { delete s.clock; lab.serial[sel] = s; return done(lab); }
        if (w.length !== 3 || !/^\d{3,8}$/.test(w[2])) return invalid("expected: clock rate <bits-per-second>", "clock rate 64000");
        lab.serial[sel] = { ...s, clock: Number(w[2]) };
        return done(lab);
      }
      if (!no && w[0] === "bandwidth" && /^\d{1,8}$/.test(w[1] ?? "") && w.length === 2) return done(lab0, [], "مقبول؛ لا أثر له في هذا المحاكي.");
      // any other interface-only command of the exam CLI does not apply to a serial port; global ones (exit, end, interface …) go on
      const p = parseRouterCommand(raw);
      if (p.kind === "ok" && !p.spec.modes.includes("global") && (p.spec.modes.includes("interface") || p.spec.modes.includes("subif")) && !["exit", "end", "help"].includes(p.cmd.id))
        return bad("invalid", "this command is not supported on a serial interface", "أوامر الواجهة التسلسلية: ip address، no shutdown، encapsulation ppp، clock rate");
    }
  }

  // ── global commands of the lab (typed in any configuration mode, as in IOS) ──────────────────────────────────────────────────────
  const no = l[0] === "no", w = no ? l.slice(1) : l, tw = no ? t.slice(1) : t;
  const isLabGlobal = (!no && (w[0] === "interface" || w[0] === "int") && !!normSerial(tw.slice(1).join("")))
    || (w[0] === "ip" && w[1] === "route") || w[0] === "router" || w[0] === "access-list"
    || (w[0] === "ip" && w[1] === "nat" && w[2] === "inside" && w[3] === "source")
    || (w[0] === "ipv6" && (w[1] === "unicast-routing" || w[1] === "route"));
  if (!isLabGlobal) return { kind: "delegate", sub };
  if (!inConfig) return bad("wrong-mode", "This command is not available in " + (mode === "user" ? "user EXEC mode" : "privileged EXEC mode") + ".", "هذا الأمر يعمل في وضع الإعداد العام. اكتب enable ثم configure terminal");
  const g: Router2Session = { state: session.state, mode: "global" };
  const lab = clone(lab0);
  if (w[0] === "interface" || w[0] === "int") return done(lab0, [], undefined, { state: session.state, mode: "interface", selectedInterface: normSerial(tw.slice(1).join(""))! }, null);
  if (w[0] === "ip" && w[1] === "route") {
    if (tw.length !== 5 || !isIpv4(tw[2]) || !(isSubnetMask(tw[3]) || tw[3] === "0.0.0.0")) return invalid("expected: ip route <network> <mask> <next-hop | interface>", "ip route 192.168.2.0 255.255.255.0 10.0.0.2");   // 0.0.0.0: the default route
    if (networkAddress(tw[2], tw[3]) !== tw[2]) return bad("invalid", "Inconsistent address and mask", "العنوان يجب أن يكون عنوان الشبكة نفسه لهذا القناع (مثل 192.168.2.0 مع 255.255.255.0).");
    const via = isIpv4(tw[4]) ? tw[4] : normIface(tw[4]);
    if (!via) return invalid("invalid next hop or interface: " + tw[4], "ip route 0.0.0.0 0.0.0.0 s0/0/0");
    const e = { net: tw[2], mask: tw[3], via };
    lab.routes = lab.routes.filter(r => !(r.net === e.net && r.mask === e.mask && r.via === e.via));
    if (!no) { if (lab.routes.length >= LAB_LIMITS.routes) return bad("invalid", "Route table limit reached in this simulator.", "الحد الأقصى " + LAB_LIMITS.routes + " مسارًا ثابتًا."); lab.routes.push(e); }
    return done(lab, [], undefined, g, null);
  }
  if (w[0] === "router") {
    if (w[1] === "rip" && w.length === 2) { if (no) { delete lab.rip; return done(lab, [], undefined, g, null); } lab.rip ??= { networks: [] }; return done(lab, [], undefined, g, "rip"); }
    if ((w[1] === "ospf" || w[1] === "eigrp") && /^\d{1,5}$/.test(w[2] ?? "") && w.length === 3 && Number(w[2]) >= 1) {
      const n = Number(w[2]);
      if (w[1] === "ospf") {
        if (no) { if (lab.ospf?.pid === n) delete lab.ospf; return done(lab, [], undefined, g, null); }
        if (lab.ospf && lab.ospf.pid !== n) return bad("invalid", "Only one OSPF process (" + lab.ospf.pid + ") per router in this simulator.", "استعمل router ospf " + lab.ospf.pid + " أو احذفه أولًا: no router ospf " + lab.ospf.pid);
        lab.ospf ??= { pid: n, networks: [] };
        return done(lab, [], undefined, g, "ospf");
      }
      if (no) { if (lab.eigrp?.as === n) delete lab.eigrp; return done(lab, [], undefined, g, null); }
      if (lab.eigrp && lab.eigrp.as !== n) return bad("invalid", "Only one EIGRP autonomous system (" + lab.eigrp.as + ") per router in this simulator.", "كل الراوترات في EIGRP تستعمل رقم AS نفسه.");
      lab.eigrp ??= { as: n, networks: [] };
      return done(lab, [], undefined, g, "eigrp");
    }
    return invalid("expected: router rip | router ospf <process-id> | router eigrp <as-number>", "router ospf 1");
  }
  if (w[0] === "access-list") {
    const n = Number(w[1]);
    if (!/^\d{1,3}$/.test(w[1] ?? "") || n < 1 || n > 199) return invalid("access list number must be 1-99 (standard) or 100-199 (extended)", "access-list 1 permit 192.168.1.0 0.0.0.255");
    const name = String(n), standard = n <= 99;
    if (no) { delete lab.acls[name]; return done(lab, [], undefined, g, null); }
    if (w[2] === "remark") return done(lab0, [], undefined, g, null);
    if (w[2] !== "permit" && w[2] !== "deny") return invalid("expected permit or deny", standard ? "access-list 1 deny host 192.168.1.10" : "access-list 100 permit tcp any host 10.0.0.5 eq 80");
    let entry: LabAclEntry;
    if (standard) {
      const m = readMatch(t, 3, true);
      if (!m || 3 + m.used !== t.length) return invalid("expected: any | host <address> | <address> [<wildcard>]", "access-list 1 permit 192.168.1.0 0.0.0.255");
      entry = { action: w[2], proto: "ip", src: m.m };
    } else {
      const proto = w[3];
      if (proto !== "ip" && proto !== "icmp" && proto !== "tcp" && proto !== "udp") return invalid("protocol must be ip, icmp, tcp or udp", "access-list 100 deny icmp any any");
      const s = readMatch(t, 4, false), d = s ? readMatch(t, 4 + s.used, false) : null;
      if (!s || !d) return invalid("expected: <protocol> <source> <destination> [eq <port>]", "access-list 100 permit tcp any host 10.0.0.5 eq 80");
      let i = 4 + s.used + d.used, port: number | undefined;
      if (l[i] === "eq") {
        if (proto !== "tcp" && proto !== "udp") return invalid("eq <port> is for tcp or udp", "access-list 100 permit tcp any any eq 80");
        port = PORT_NAMES[l[i + 1]] ?? (/^\d{1,5}$/.test(l[i + 1] ?? "") && Number(l[i + 1]) >= 1 && Number(l[i + 1]) <= 65535 ? Number(l[i + 1]) : undefined);
        if (port === undefined) return invalid("invalid port: " + (t[i + 1] ?? ""), "access-list 100 permit tcp any any eq www");
        i += 2;
      }
      if (i !== t.length) return invalid("unexpected values after the destination", "access-list 100 deny icmp any host 10.0.0.1");
      entry = { action: w[2], proto, src: s.m, dst: d.m, ...(port !== undefined ? { port } : {}) };
    }
    const list = lab.acls[name] ?? [];
    if (!lab.acls[name] && Object.keys(lab.acls).length >= LAB_LIMITS.acls) return bad("invalid", "ACL limit reached in this simulator.", "الحد الأقصى " + LAB_LIMITS.acls + " قوائم.");
    if (list.length >= LAB_LIMITS.aclEntries) return bad("invalid", "ACL entry limit reached in this simulator.", "الحد الأقصى " + LAB_LIMITS.aclEntries + " سطرًا في القائمة.");
    lab.acls[name] = [...list, entry];
    return done(lab, [], undefined, g, null);
  }
  if (w[0] === "ip" && w[1] === "nat") {
    if (w[4] === "static") {
      if (tw.length !== 7 || !isIpv4(tw[5]) || !isIpv4(tw[6])) return invalid("expected: ip nat inside source static <local> <global>", "ip nat inside source static 192.168.1.10 200.1.1.10");
      lab.nat.statics = lab.nat.statics.filter(s => s.local !== tw[5] && s.global !== tw[6]);
      if (!no) { if (lab.nat.statics.length >= LAB_LIMITS.statics) return bad("invalid", "NAT limit reached in this simulator.", "الحد الأقصى " + LAB_LIMITS.statics + "."); lab.nat.statics.push({ local: tw[5], global: tw[6] }); }
      return done(lab, [], undefined, g, null);
    }
    if (w[4] === "list") {
      if (no) { delete lab.nat.overload; return done(lab, [], undefined, g, null); }
      const ifc = w[6] === "interface" ? normIface(tw.slice(7, tw.length - 1).join("")) : null;
      if (!/^\d{1,3}$/.test(w[5] ?? "") || !ifc || w[w.length - 1] !== "overload") return invalid("expected: ip nat inside source list <acl> interface <interface> overload", "ip nat inside source list 1 interface g0/1 overload");
      lab.nat.overload = { acl: String(Number(w[5])), iface: ifc };
      return done(lab, [], undefined, g, null);
    }
    return invalid("this simulator supports static NAT and PAT (overload)", "ip nat inside source static 192.168.1.10 200.1.1.10");
  }
  if (w[0] === "ipv6" && w[1] === "unicast-routing" && w.length === 2) { lab.v6.routing = !no; return done(lab, [], undefined, g, null); }
  if (w[0] === "ipv6" && w[1] === "route") {
    const p = tw.length === 4 ? parseIpv6Prefix(tw[2], { network: true }) : null, via = tw.length === 4 ? parseIpv6(tw[3]) : null;
    if (!p || via === null) return invalid("expected: ipv6 route <prefix>/<length> <next-hop>", "ipv6 route 2001:db8:2::/64 2001:db8:12::2");
    const e = { prefix: p.addr, len: p.len, via: formatIpv6(via) };
    lab.v6.routes = lab.v6.routes.filter(r => !(r.prefix === e.prefix && r.len === e.len && r.via === e.via));
    if (!no) { if (lab.v6.routes.length >= LAB_LIMITS.v6Routes) return bad("invalid", "Route table limit reached in this simulator.", "الحد الأقصى " + LAB_LIMITS.v6Routes + "."); lab.v6.routes.push(e); }
    return done(lab, [], undefined, g, null);
  }
  return { kind: "delegate", sub };
}
const v6Overlap = (a: { addr: string; len: number }, b: { addr: string; len: number }) => { const len = Math.min(a.len, b.len), x = parseIpv6(a.addr)!, y = parseIpv6(b.addr)!; return (x >> BigInt(128 - len)) === (y >> BigInt(128 - len)); };

// ── show ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function showCommand(w: string[], session: Router2Session, lab: LabRouter, view: () => Net, id: string): string[] | null {
  const is = (...alts: string[][]) => alts.some(a => a.length === w.length && a.every((x, i) => x === w[i]));
  if (is(["ip", "route"])) return showIpRoute(view(), id);
  if (is(["running-config"], ["run"])) {
    if (session.mode === "user") return null;
    const base = executeRouterCommand2({ ...session, mode: "privileged" }, "show running-config").result.output;
    const extra = runningConfigLines(lab);
    if (!extra.length) return base;
    const end = base.lastIndexOf("end");
    return end < 0 ? [...base, ...extra] : [...base.slice(0, end), ...extra, ...base.slice(end)];
  }
  if (is(["ip", "interface", "brief"], ["ip", "int", "brief"], ["ip", "int", "br"])) {
    const net = view();
    const base = executeRouterCommand2({ ...session, mode: "privileged" }, "show ip interface brief", { linkUp: p => linkUp(net, id, p) }).result.output;
    const rows = SERIAL_PORTS.map(p => {
      const s = lab.serial[p], admin = s?.up === true, up = admin && labIfUp(net, id, p);
      return pad(labIfName(p), 27) + pad(s?.ip ?? "unassigned", 16) + "YES " + pad(s?.ip ? "manual" : "unset", 7) + pad(!admin ? "administratively down" : up ? "up" : "down", 22) + (up ? "up" : "down");
    });
    return [...base, ...rows];
  }
  if (is(["access-lists"], ["ip", "access-lists"])) {
    const out: string[] = [];
    for (const n of Object.keys(lab.acls).sort((a, b) => Number(a) - Number(b))) {
      const standard = Number(n) <= 99;
      out.push((standard ? "Standard" : "Extended") + " IP access list " + n);
      lab.acls[n].forEach((e, i) => out.push("    " + (i + 1) * 10 + " " + (standard ? e.action + " " + matchShow(e.src) : entryText(e, false))));
    }
    return out.length ? out : [""];
  }
  if (is(["ip", "nat", "translations"])) {
    const out = [pad("Pro", 5) + pad("Inside global", 19) + pad("Inside local", 19) + pad("Outside local", 19) + "Outside global"];
    for (const s of lab.nat.statics) out.push(pad("---", 5) + pad(s.global, 19) + pad(s.local, 19) + pad("---", 19) + "---");
    if (lab.nat.overload) out.push("", "PAT (overload) on " + labIfName(lab.nat.overload.iface) + " for access list " + lab.nat.overload.acl + ": its entries exist only while traffic flows.");
    return out;
  }
  if (is(["ip", "protocols"])) return showProtocols(view(), id, lab);
  if (is(["ip", "ospf", "neighbor"])) {
    const net = view(), out = [pad("Neighbor ID", 16) + pad("Pri", 6) + pad("State", 16) + pad("Dead Time", 12) + pad("Address", 16) + "Interface"];
    for (const a of labAdjacencies(net).filter(x => x.proto === "ospf")) for (const [me, peer, peerIp] of [[a.a, a.b, a.bIp], [a.b, a.a, a.aIp]] as const)
      if (me.dev === id) out.push(pad(routerId(net, peer.dev), 16) + pad("1", 6) + pad("FULL/  -", 16) + pad("00:00:35", 12) + pad(peerIp, 16) + labIfName(me.iface));
    return out;
  }
  if (is(["ip", "eigrp", "neighbors"])) {
    const net = view(), out = ["EIGRP-IPv4 Neighbors for AS(" + (lab.eigrp?.as ?? "-") + ")", pad("H", 4) + pad("Address", 16) + pad("Interface", 16) + pad("Hold", 6) + pad("Uptime", 10) + "SRTT"];
    let h = 0;
    for (const a of labAdjacencies(net).filter(x => x.proto === "eigrp")) for (const [me, , peerIp] of [[a.a, a.b, a.bIp], [a.b, a.a, a.aIp]] as const)
      if (me.dev === id) out.push(pad(String(h++), 4) + pad(peerIp, 16) + pad(labIfName(me.iface), 16) + pad("12", 6) + pad("00:01:00", 10) + "1");
    return out;
  }
  if (is(["ipv6", "interface", "brief"], ["ipv6", "int", "brief"], ["ipv6", "int", "br"])) {
    const net = view(), out: string[] = [];
    for (const n of [...Object.keys(lab.v6.ifs)].sort()) {
      const admin = labIfAdmin(net, id, n), up = admin && labIfUp(net, id, n);
      out.push(pad(labIfName(n), 23) + "[" + (!admin ? "administratively down" : up ? "up" : "down") + "/" + (up ? "up" : "down") + "]", "    " + v6Display(lab.v6.ifs[n].addr));
    }
    return out.length ? out : ["% No IPv6 addresses are configured on this router."];
  }
  if (is(["ipv6", "route"])) {
    const net = view(), out = ["IPv6 Routing Table - default", "Codes: C - Connected, L - Local, S - Static", ""];
    for (const n of Object.keys(lab.v6.ifs).sort()) {
      const a = v6Of(net, { dev: id, iface: n });
      if (!a) continue;
      const mask = a.len === 0 ? 0n : (((1n << 128n) - 1n) << BigInt(128 - a.len)) & ((1n << 128n) - 1n);
      out.push("C   " + v6Display(formatIpv6(a.addr & mask)) + "/" + a.len + " [0/0]", "     via " + labIfName(n) + ", directly connected", "L   " + v6Display(formatIpv6(a.addr)) + "/128 [0/0]", "     via " + labIfName(n) + ", receive");
    }
    for (const r of lab.v6.routes) out.push("S   " + v6Display(r.prefix) + "/" + r.len + " [1/0]", "     via " + v6Display(r.via));
    return out;
  }
  return null;
}
const routerId = (net: Net, r: string): string => {
  const ips = routerV4Addresses(net.devices[r] as never, (net.config as unknown as { labData: { routers: Record<string, LabRouter> } }).labData.routers[r]).map(a => a.ipAddress);
  return ips.sort((a, b) => ipv4ToInt(b) - ipv4ToInt(a))[0] ?? "0.0.0.0";
};
function showIpRoute(net: Net, id: string): string[] {
  const table = labRoutingTable(net, id), def = table.find(r => r.net === "0.0.0.0" && r.mask === "0.0.0.0");
  const out = ["Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP", "       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area", "       * - candidate default", "",
    def ? "Gateway of last resort is " + (def.via ?? "0.0.0.0") + " to network 0.0.0.0" : "Gateway of last resort is not set", ""];
  for (const r of table) {
    const code = r.code + (r.net === "0.0.0.0" && r.mask === "0.0.0.0" ? "*" : "");
    const dest = r.net + "/" + prefixLength(r.mask);
    if (r.code === "C" || r.code === "L") out.push(pad(code, 9) + dest + " is directly connected, " + labIfName(r.iface));
    else if (!r.via) out.push(pad(code, 9) + dest + " is directly connected, " + labIfName(r.iface));
    else out.push(pad(code, 9) + dest + " [" + r.ad + "/" + r.metric + "] via " + r.via + (r.code === "S" ? "" : ", 00:00:10, " + labIfName(r.iface)));
  }
  return out;
}
function showProtocols(net: Net, id: string, lab: LabRouter): string[] {
  const out: string[] = [], adj = labAdjacencies(net);
  const sources = (p: string) => adj.filter(a => a.proto === p).flatMap(a => (a.a.dev === id ? [a.bIp] : a.b.dev === id ? [a.aIp] : []));
  const block = (title: string, nets: string[], p: string, ad: number) => {
    out.push("Routing Protocol is \"" + title + "\"", "  Routing for Networks:", ...nets.map(n => "    " + n), "  Routing Information Sources:", "    Gateway         Distance      Last Update",
      ...sources(p).map(s => "    " + pad(s, 16) + pad(String(ad), 14) + "00:00:10"), "  Distance: (default is " + ad + ")", "");
  };
  if (lab.rip) block("rip", lab.rip.networks, "rip", 120);
  if (lab.ospf) block("ospf " + lab.ospf.pid, lab.ospf.networks.map(n => n.net + " " + n.wild + " area " + n.area), "ospf", 110);
  if (lab.eigrp) block("eigrp " + lab.eigrp.as, lab.eigrp.networks.map(n => n.net + (n.wild ? " " + n.wild : "")), "eigrp", 90);
  return out.length ? out : ["% No routing protocol is configured on this router."];
}
/** The running-config lines of the lab's additions (placed before the final `end`). */
function runningConfigLines(lab: LabRouter): string[] {
  const out: string[] = [];
  for (const p of SERIAL_PORTS) {
    const s = lab.serial[p];
    if (!s) continue;
    out.push("interface " + labIfName(p), ...(s.ip ? [" ip address " + s.ip + " " + s.mask] : [" no ip address"]), ...(s.encap ? [" encapsulation ppp"] : []), ...(s.clock ? [" clock rate " + s.clock] : []),
      ...(lab.ifAcl[p]?.in ? [" ip access-group " + lab.ifAcl[p].in + " in"] : []), ...(lab.ifAcl[p]?.out ? [" ip access-group " + lab.ifAcl[p].out + " out"] : []),
      ...(lab.nat.inside.includes(p) ? [" ip nat inside"] : []), ...(lab.nat.outside.includes(p) ? [" ip nat outside"] : []), ...(lab.v6.ifs[p] ? [" ipv6 address " + v6Display(lab.v6.ifs[p].addr) + "/" + lab.v6.ifs[p].len] : []),
      s.up ? " no shutdown" : " shutdown", "!");
  }
  const others = [...new Set([...Object.keys(lab.ifAcl), ...lab.nat.inside, ...lab.nat.outside, ...Object.keys(lab.v6.ifs)])].filter(n => !isSerialPort(n)).sort();
  for (const n of others) out.push("interface " + labIfName(n), ...(lab.ifAcl[n]?.in ? [" ip access-group " + lab.ifAcl[n].in + " in"] : []), ...(lab.ifAcl[n]?.out ? [" ip access-group " + lab.ifAcl[n].out + " out"] : []),
    ...(lab.nat.inside.includes(n) ? [" ip nat inside"] : []), ...(lab.nat.outside.includes(n) ? [" ip nat outside"] : []), ...(lab.v6.ifs[n] ? [" ipv6 address " + v6Display(lab.v6.ifs[n].addr) + "/" + lab.v6.ifs[n].len] : []), "!");
  if (lab.rip) out.push("router rip", " version 2", ...lab.rip.networks.map(n => " network " + n), ...(lab.rip.originate ? [" default-information originate"] : []), " no auto-summary", "!");
  if (lab.ospf) out.push("router ospf " + lab.ospf.pid, ...lab.ospf.networks.map(n => " network " + n.net + " " + n.wild + " area " + n.area), ...(lab.ospf.originate ? [" default-information originate"] : []), "!");
  if (lab.eigrp) out.push("router eigrp " + lab.eigrp.as, ...lab.eigrp.networks.map(n => " network " + n.net + (n.wild ? " " + n.wild : "")), "!");
  for (const s of lab.nat.statics) out.push("ip nat inside source static " + s.local + " " + s.global);
  if (lab.nat.overload) out.push("ip nat inside source list " + lab.nat.overload.acl + " interface " + labIfName(lab.nat.overload.iface) + " overload");
  for (const r of lab.routes) out.push("ip route " + r.net + " " + r.mask + " " + (isIpv4(r.via) ? r.via : labIfName(r.via)));
  for (const n of Object.keys(lab.acls).sort((a, b) => Number(a) - Number(b))) for (const e of lab.acls[n]) out.push("access-list " + n + " " + entryText(e, Number(n) <= 99));
  if (lab.v6.routing) out.push("ipv6 unicast-routing");
  for (const r of lab.v6.routes) out.push("ipv6 route " + v6Display(r.prefix) + "/" + r.len + " " + v6Display(r.via));
  if (out.length && out[out.length - 1] !== "!") out.push("!");
  return out;
}
