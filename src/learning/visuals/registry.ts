// Learning Materials — SVG VISUAL ENRICHMENT registry.
//
// The EXACT allowlist that maps a content `visualId` (a plain string) to a TRUSTED repo SVG component. Security
// discipline (same spirit as the activity engine): content never names a component, module path or code; a visual
// is reached ONLY through an entry enumerated here. An unknown key resolves to `null`, and the Reader then renders
// a faithful "قيد الإعداد" fallback (never a blank or a guess).
//
// Phase 8E-6 — LOADING: every entry is a LAZY chunk. With 122 registered visuals the eager registry made the Reader's
// first chunk carry ~250 KB of SVG code for a page that shows at most one or two of them. Each entry now holds a
// statically-AUTHORED `import("./791381/groups/<module>")` plus a literal named export (both written in this file —
// never built from the `visualId`, never a template string, never a glob over content keys). Granularity: ONE small
// trusted chunk per CONTENT MODULE (791381/groups/*.ts barrels, 27 groups of 2–14 visuals) — measured against
// per-visual chunks (122 chunks, +10% total JS from per-chunk overhead) this keeps a first visual at a few KB while a
// learner reading through a module fetches its visuals once. `visual()` wraps the literal loader in the shared
// one-shot stale-chunk recovery (lazyWithRetry) and a cached React.lazy component; the registry itself stays
// synchronous: `resolveVisual` still answers immediately (null for an unknown key), and only rendering a resolved
// entry fetches its group chunk. The Reader shows a local status line inside the figure frame meanwhile.
//
// This registry is course-agnostic: keys are namespaced (`791381/ch1/...`) so later chapters/courses add entries
// WITHOUT touching the Reader, the block type, or existing visuals. The enumerated set + its size are pinned by
// visuals.guards.test.ts / registry.test.ts (the tests, not this comment, are the authority on the count), and the
// lazy-loading contract by registry.lazy.8e.test.ts + scripts/check-bundle-budget.mjs.

import { lazy } from "react";
import { lazyWithRetry } from "../../lazyWithRetry";
import type { LearningVisualModule, RegisteredVisual } from "./types";

/** One trusted entry: `load` is the literal, repo-authored dynamic import wrapped in the shared stale-chunk recovery;
 *  `component` is the cached React.lazy over that same loader (rendered inside the figure's local Suspense). */
function visual(id: string, importer: () => Promise<LearningVisualModule>, motion: boolean): RegisteredVisual {
  const load = lazyWithRetry(importer, "learning-visual:" + id);
  return { id, component: lazy(load), load, motion };
}
// Batch 2 — 40-page discovery batch across units m02 (number bases), m07 (IP addresses), m08 (class/subnet/CIDR),
// m09 (devices). Same data-only, exact-allowlist discipline; ids namespaced per source module.
// Batch 3 — the next six units in reading order (m10 topologies, m11 cables/MAC, m12 message types, m13 OSI &
// TCP/IP, m14 protocols, m15 network-check commands; source PDF 57–97). Same data-only, exact-allowlist,
// reduced-motion discipline.
// Batch 4 — network domains & security concepts (m16 PDF 98–105, m17 PDF 108–114; PDF115 SSH reuses the existing
// m14 ssh-vs-telnet visual, so it adds NO registry entry). Same data-only, exact-allowlist, reduced-motion discipline.
// Batch 5 — three owner-requested backlog visuals (m08 CIDR PDF41, m12 broadcast-message PDF74, m13 OSI seven-layers
// PDF78) + the next roadmap scope (m18 encapsulation/anatomy PDF116–117, m03 switch CLI & VLAN PDF121–138). The backlog
// components live here in batch5/ but keep their correct m08/m12/m13 ids. Same data-only, exact-allowlist, reduced-
// motion discipline.
// Batch 6 — the routing / switch-services arc across the previously visual-free modules: Router on a Stick & Trunk
// (m04, PDF 147–156), VTP (m19, PDF 141), well-known ports (m21, PDF 168), DHCP (m22, PDF 170–171), Port Security
// (m23, PDF 181), Cisco device access (m24, PDF 186), WAN (m26, PDF 207), routing protocols (m27, PDF 212–222) and
// ACL (m06, PDF 223). Same data-only, exact-allowlist, reduced-motion discipline; no CLI-simulator duplication.
// Batch 7 — VTP/Trunk remainder + Wi-Fi + IPv6: the previously-unenriched pages of m19 (VTP roles, PDF 140), m04
// (inter-switch trunk ports PDF 146, router sub-interfaces PDF 154/155 — split per source fidelity), m20 (Wi-Fi &
// wireless, PDF 159–165) and m21 (IPv6 anatomy/compression, PDF 166–167). Same data-only, exact-allowlist,
// reduced-motion discipline; finite one-shot motion only.
// Batch 8 — services / routing arc across the previously visual-free CONCEPT pages of m22 (DHCP), m23 (Port
// Security), m24 (Cisco device security), m05 (Cisco command reference), m26 (WAN) and m27 (routing protocols).
// Concept pages only — the CLI-simulator command pages get no redundant SVG. Same data-only, exact-allowlist,
// finite one-shot / reduced-motion discipline.
// Batch 9 — the FINAL visual-enrichment batch: the ACL decision detail (m06 Standard/Extended, PDF 224/227) and the
// comprehensive summary module m28 (PDF 231–262) — IP vs MAC, device roles, cable/media, the solved subnetting
// example, wildcard inversion, NAT/PAT/APIPA, the TCP handshake, the website journey and the CMD/Show map. After the
// controlled sync it also owns the four sensitive summary pages that could not reuse a Batch 7/8 component
// source-exactly: IPv6 (PDF244), Metro-Ethernet+VLAN (PDF250), route types (PDF251) and AD-only (PDF252). Same
// data-only, exact-allowlist, finite one-shot, reduced-motion discipline; summary pages that already own a strong
// visual REUSE it (no duplicate registry entry).
// Reader follow-up (visual gap pass) — a teacher-reported missing network diagram on m04 PDF150 (site page 138): the
// Sw6 ↔ Router trunk topology. Its own dir keeps the follow-up provenance clear; it is a normal data-only, exact-
// allowlist, reduced-motion-safe SVG like every other registered visual.

const VISUALS: readonly RegisteredVisual[] = [
  // Chapter 1 pilot
  visual("791381/ch1/network-connected-devices", () => import("./791381/groups/ch1").then(g => ({ default: g.NetworkConnectedDevices })), true),
  visual("791381/ch1/network-uses-map", () => import("./791381/groups/ch1").then(g => ({ default: g.NetworkUsesMap })), true),
  visual("791381/ch1/shared-printer", () => import("./791381/groups/ch1").then(g => ({ default: g.SharedPrinterDiagram })), true),
  visual("791381/ch1/network-building-blocks", () => import("./791381/groups/ch1").then(g => ({ default: g.NetworkBuildingBlocks })), true),
  visual("791381/ch1/network-management-cycle", () => import("./791381/groups/ch1").then(g => ({ default: g.NetworkManagementCycle })), true),
  // Batch 2 — number bases (m02)
  visual("791381/m02/binary-to-decimal", () => import("./791381/groups/m02").then(g => ({ default: g.BinaryToDecimal })), true),
  visual("791381/m02/hex-to-binary", () => import("./791381/groups/m02").then(g => ({ default: g.HexToBinary })), true),
  visual("791381/m02/conversion-map", () => import("./791381/groups/m02").then(g => ({ default: g.ConversionMap })), true),
  // Batch 2 — IP addresses (m07)
  visual("791381/m07/ip-identity", () => import("./791381/groups/m07").then(g => ({ default: g.IpIdentity })), true),
  visual("791381/m07/ipv4-vs-ipv6", () => import("./791381/groups/m07").then(g => ({ default: g.Ipv4VsIpv6 })), true),
  visual("791381/m07/private-public", () => import("./791381/groups/m07").then(g => ({ default: g.PrivatePublicIp })), true),
  visual("791381/m07/static-dynamic", () => import("./791381/groups/m07").then(g => ({ default: g.StaticDynamicIp })), true),
  // Batch 2 — class / subnet / CIDR (m08)
  visual("791381/m08/address-classes", () => import("./791381/groups/m08").then(g => ({ default: g.AddressClasses })), true),
  visual("791381/m08/subnet-mask", () => import("./791381/groups/m08").then(g => ({ default: g.SubnetMask })), true),
  visual("791381/m08/same-network", () => import("./791381/groups/m08").then(g => ({ default: g.SameNetwork })), true),
  // Batch 2 — devices (m09)
  visual("791381/m09/hub-flood", () => import("./791381/groups/m09").then(g => ({ default: g.HubFlood })), true),
  visual("791381/m09/switch-unicast", () => import("./791381/groups/m09").then(g => ({ default: g.SwitchUnicast })), true),
  visual("791381/m09/router-networks", () => import("./791381/groups/m09").then(g => ({ default: g.RouterNetworks })), true),
  // Batch 3 — topologies (m10)
  visual("791381/m10/p2p-direct", () => import("./791381/groups/m10").then(g => ({ default: g.P2pDirect })), true),
  visual("791381/m10/bus-collision", () => import("./791381/groups/m10").then(g => ({ default: g.BusCollision })), true),
  // Batch 3 — cables / MAC (m11)
  visual("791381/m11/utp-vs-stp", () => import("./791381/groups/m11").then(g => ({ default: g.UtpVsStp })), true),
  visual("791381/m11/mac-frame-delivery", () => import("./791381/groups/m11").then(g => ({ default: g.MacFrameDelivery })), true),
  // Batch 3 — message types (m12)
  visual("791381/m12/message-types", () => import("./791381/groups/m12").then(g => ({ default: g.MessageTypes })), true),
  visual("791381/m12/unicast-multicast", () => import("./791381/groups/m12").then(g => ({ default: g.UnicastMulticast })), true),
  visual("791381/m12/storage-units", () => import("./791381/groups/m12").then(g => ({ default: g.StorageUnits })), true),
  visual("791381/m12/message-structure", () => import("./791381/groups/m12").then(g => ({ default: g.MessageStructure })), true),
  // Batch 3 — communication models (m13)
  visual("791381/m13/tcpip-layers", () => import("./791381/groups/m13").then(g => ({ default: g.TcpIpLayers })), true),
  visual("791381/m13/osi-vs-tcpip", () => import("./791381/groups/m13").then(g => ({ default: g.OsiVsTcpIp })), true),
  visual("791381/m13/tcp-vs-udp", () => import("./791381/groups/m13").then(g => ({ default: g.TcpVsUdp })), true),
  // Batch 3 — protocols (m14)
  visual("791381/m14/protocol-agreement", () => import("./791381/groups/m14").then(g => ({ default: g.ProtocolAgreement })), true),
  visual("791381/m14/dns-http-dhcp", () => import("./791381/groups/m14").then(g => ({ default: g.DnsHttpDhcp })), true),
  visual("791381/m14/ssh-vs-telnet", () => import("./791381/groups/m14").then(g => ({ default: g.SshVsTelnet })), true),
  visual("791381/m14/protocols-by-transport", () => import("./791381/groups/m14").then(g => ({ default: g.ProtocolsByTransport })), true),
  // Batch 3 — network-check commands (m15)
  visual("791381/m15/ping-echo", () => import("./791381/groups/m15").then(g => ({ default: g.PingEcho })), true),
  visual("791381/m15/tracert-hops", () => import("./791381/groups/m15").then(g => ({ default: g.TracertHops })), true),
  visual("791381/m15/arp-association", () => import("./791381/groups/m15").then(g => ({ default: g.ArpAssociation })), true),
  // Batch 4 — domains & switching concepts (m16)
  visual("791381/m16/collision-domains", () => import("./791381/groups/m16").then(g => ({ default: g.CollisionDomains })), true),
  visual("791381/m16/broadcast-domain", () => import("./791381/groups/m16").then(g => ({ default: g.BroadcastDomain })), true),
  visual("791381/m16/stp-loop-blocking", () => import("./791381/groups/m16").then(g => ({ default: g.StpLoopBlocking })), true),
  visual("791381/m16/half-full-duplex", () => import("./791381/groups/m16").then(g => ({ default: g.HalfFullDuplex })), true),
  visual("791381/m16/localhost-loopback", () => import("./791381/groups/m16").then(g => ({ default: g.LocalhostLoopback })), true),
  visual("791381/m16/apipa-fallback", () => import("./791381/groups/m16").then(g => ({ default: g.ApipaFallback })), true),
  // Batch 4 — network security (m17)
  visual("791381/m17/attack-targets", () => import("./791381/groups/m17").then(g => ({ default: g.AttackTargets })), true),
  visual("791381/m17/dos-vs-ddos", () => import("./791381/groups/m17").then(g => ({ default: g.DosVsDdos })), true),
  visual("791381/m17/hijacking-vs-mitm", () => import("./791381/groups/m17").then(g => ({ default: g.HijackingVsMitm })), true),
  visual("791381/m17/phishing-vs-spoofing", () => import("./791381/groups/m17").then(g => ({ default: g.PhishingVsSpoofing })), true),
  visual("791381/m17/secure-two-pillars", () => import("./791381/groups/m17").then(g => ({ default: g.SecureTwoPillars })), true),
  visual("791381/m17/vpn-tunnel", () => import("./791381/groups/m17").then(g => ({ default: g.VpnTunnel })), true),
  visual("791381/m17/https-secure-channel", () => import("./791381/groups/m17").then(g => ({ default: g.HttpsSecureChannel })), true),
  // Batch 5 — backlog: CIDR (m08), broadcast message structure (m12), OSI seven layers (m13)
  visual("791381/m08/cidr-prefix", () => import("./791381/groups/m08").then(g => ({ default: g.CidrPrefix })), true),
  visual("791381/m12/broadcast-message-structure", () => import("./791381/groups/m12").then(g => ({ default: g.BroadcastMessageStructure })), true),
  visual("791381/m13/osi-seven-layers", () => import("./791381/groups/m13").then(g => ({ default: g.OsiSevenLayers })), true),
  // Batch 5 — data segmentation (m18)
  visual("791381/m18/encapsulation-stack", () => import("./791381/groups/m18").then(g => ({ default: g.EncapsulationStack })), true),
  visual("791381/m18/pdu-anatomy", () => import("./791381/groups/m18").then(g => ({ default: g.PduAnatomy })), true),
  // Batch 5 — switch CLI & VLAN (m03)
  visual("791381/m03/cli-interface", () => import("./791381/groups/m03").then(g => ({ default: g.CliInterface })), true),
  visual("791381/m03/cli-mode-ladder", () => import("./791381/groups/m03").then(g => ({ default: g.CliModeLadder })), true),
  visual("791381/m03/switch-ports-map", () => import("./791381/groups/m03").then(g => ({ default: g.SwitchPortsMap })), true),
  visual("791381/m03/svi-interface", () => import("./791381/groups/m03").then(g => ({ default: g.SviInterface })), true),
  visual("791381/m03/vlan-segmentation", () => import("./791381/groups/m03").then(g => ({ default: g.VlanSegmentation })), true),
  visual("791381/m03/vlan-access-trunk-terms", () => import("./791381/groups/m03").then(g => ({ default: g.VlanAccessTrunkTerms })), true),
  visual("791381/m03/vlan-example-topology", () => import("./791381/groups/m03").then(g => ({ default: g.VlanExampleTopology })), true),
  visual("791381/m03/create-vlan", () => import("./791381/groups/m03").then(g => ({ default: g.CreateVlan })), true),
  visual("791381/m03/access-port-assignment", () => import("./791381/groups/m03").then(g => ({ default: g.AccessPortToVlan })), true),
  visual("791381/m03/svi-gateway", () => import("./791381/groups/m03").then(g => ({ default: g.SviGateway })), true),
  visual("791381/m03/tagged-untagged-native", () => import("./791381/groups/m03").then(g => ({ default: g.TaggedUntaggedNative })), true),
  // Batch 6 — Router on a Stick & Trunk (m04)
  visual("791381/m04/trunk-multi-vlan", () => import("./791381/groups/m04").then(g => ({ default: g.TrunkMultiVlan })), true),
  visual("791381/m04/dot1q-tag-frame", () => import("./791381/groups/m04").then(g => ({ default: g.Dot1qTagFrame })), true),
  visual("791381/m04/router-on-a-stick", () => import("./791381/groups/m04").then(g => ({ default: g.RouterOnAStick })), false),
  visual("791381/m04/inter-vlan-flow", () => import("./791381/groups/m04").then(g => ({ default: g.InterVlanFlow })), true),
  // Batch 6 — VTP (m19)
  visual("791381/m19/vtp-propagation", () => import("./791381/groups/m19").then(g => ({ default: g.VtpPropagation })), true),
  // Batch 6 — well-known ports (m21)
  visual("791381/m21/well-known-ports", () => import("./791381/groups/m21").then(g => ({ default: g.WellKnownPorts })), false),
  // Batch 6 — DHCP (m22)
  visual("791381/m22/dhcp-dora", () => import("./791381/groups/m22").then(g => ({ default: g.DhcpDora })), true),
  visual("791381/m22/dhcp-pool-excluded", () => import("./791381/groups/m22").then(g => ({ default: g.DhcpPoolExcluded })), false),
  // Batch 6 — Port Security (m23)
  visual("791381/m23/port-security-scenario", () => import("./791381/groups/m23").then(g => ({ default: g.PortSecurityScenario })), false),
  // Batch 6 — Cisco device access (m24)
  visual("791381/m24/device-access-paths", () => import("./791381/groups/m24").then(g => ({ default: g.DeviceAccessPaths })), false),
  // Batch 6 — WAN (m26)
  visual("791381/m26/wan-vs-lan-scope", () => import("./791381/groups/m26").then(g => ({ default: g.WanVsLanScope })), false),
  // Batch 6 — routing protocols (m27)
  visual("791381/m27/admin-distance", () => import("./791381/groups/m27").then(g => ({ default: g.AdminDistance })), false),
  visual("791381/m27/routing-update-types", () => import("./791381/groups/m27").then(g => ({ default: g.RoutingUpdateTypes })), true),
  visual("791381/m27/ospf-topology", () => import("./791381/groups/m27").then(g => ({ default: g.OspfTopology })), false),
  visual("791381/m27/show-ip-route", () => import("./791381/groups/m27").then(g => ({ default: g.ShowIpRoute })), false),
  // Batch 6 — ACL (m06)
  visual("791381/m06/acl-gate", () => import("./791381/groups/m06").then(g => ({ default: g.AclGate })), true),
  // Batch 7 — VTP roles (m19)
  visual("791381/m19/vtp-roles", () => import("./791381/groups/m19").then(g => ({ default: g.VtpRoles })), false),
  // Batch 7 — inter-switch trunk ports & router sub-interfaces (m04)
  visual("791381/m04/inter-switch-trunk-ports", () => import("./791381/groups/m04").then(g => ({ default: g.InterSwitchTrunkPorts })), false),
  visual("791381/m04/subinterfaces-vlan10-20", () => import("./791381/groups/m04").then(g => ({ default: g.SubinterfacesVlan1020 })), false),
  visual("791381/m04/subinterfaces-vlan30-40", () => import("./791381/groups/m04").then(g => ({ default: g.SubinterfacesVlan3040 })), false),
  // Batch 7 — Wi-Fi & wireless (m20)
  visual("791381/m20/dmz-three-zone", () => import("./791381/groups/m20").then(g => ({ default: g.DmzThreeZone })), true),
  visual("791381/m20/wifi-radio-link", () => import("./791381/groups/m20").then(g => ({ default: g.WifiRadioLink })), true),
  visual("791381/m20/wireless-network-types", () => import("./791381/groups/m20").then(g => ({ default: g.WirelessNetworkTypes })), false),
  visual("791381/m20/ssid-beacon", () => import("./791381/groups/m20").then(g => ({ default: g.SsidBeacon })), true),
  visual("791381/m20/wifi-security", () => import("./791381/groups/m20").then(g => ({ default: g.WifiSecurity })), false),
  visual("791381/m20/wifi-protection-technologies", () => import("./791381/groups/m20").then(g => ({ default: g.WifiProtectionTechnologies })), false),
  visual("791381/m20/access-point-bridge", () => import("./791381/groups/m20").then(g => ({ default: g.AccessPointBridge })), false),
  // Batch 7 — IPv6 (m21)
  visual("791381/m21/ipv6-anatomy", () => import("./791381/groups/m21").then(g => ({ default: g.Ipv6Anatomy })), false),
  visual("791381/m21/ipv6-compression", () => import("./791381/groups/m21").then(g => ({ default: g.Ipv6Compression })), true),
  // Batch 8 — DHCP concept pages (m22)
  visual("791381/m22/dhcp-automatic-config", () => import("./791381/groups/m22").then(g => ({ default: g.DhcpAutomaticConfig })), true),
  visual("791381/m22/dedicated-dhcp-server", () => import("./791381/groups/m22").then(g => ({ default: g.DedicatedDhcpServer })), false),
  // Batch 8 — Port Security concept (m23)
  visual("791381/m23/port-security-concept", () => import("./791381/groups/m23").then(g => ({ default: g.PortSecurityConcept })), true),
  // Batch 8 — Cisco device security framing (m24)
  visual("791381/m24/device-security-layers", () => import("./791381/groups/m24").then(g => ({ default: g.DeviceSecurityLayers })), false),
  // Batch 8 — Cisco command reference maps (m05)
  visual("791381/m05/cisco-cli-overview", () => import("./791381/groups/m05").then(g => ({ default: g.CiscoCliOverview })), false),
  visual("791381/m05/show-commands-map", () => import("./791381/groups/m05").then(g => ({ default: g.ShowCommandsMap })), false),
  // Batch 8 — WAN technologies (m26)
  visual("791381/m26/frame-relay-vs-atm", () => import("./791381/groups/m26").then(g => ({ default: g.FrameRelayVsAtm })), false),
  visual("791381/m26/hdlc-vs-metro", () => import("./791381/groups/m26").then(g => ({ default: g.HdlcVsMetro })), false),
  // Batch 8 — routing protocols (m27)
  visual("791381/m27/routing-methods-overview", () => import("./791381/groups/m27").then(g => ({ default: g.RoutingMethodsOverview })), false),
  visual("791381/m27/static-route-path", () => import("./791381/groups/m27").then(g => ({ default: g.StaticRoutePath })), true),
  visual("791381/m27/eigrp-metric-adaptation", () => import("./791381/groups/m27").then(g => ({ default: g.EigrpMetricAdaptation })), false),
  // Batch 9 — ACL decision detail (m06)
  visual("791381/m06/standard-acl-source", () => import("./791381/groups/m06").then(g => ({ default: g.StandardAclSource })), true),
  visual("791381/m06/extended-acl-decision", () => import("./791381/groups/m06").then(g => ({ default: g.ExtendedAclDecision })), true),
  // Batch 9 — comprehensive summary (m28)
  visual("791381/m28/ip-vs-mac-summary", () => import("./791381/groups/m28").then(g => ({ default: g.IpVsMacSummary })), false),
  visual("791381/m28/network-device-roles", () => import("./791381/groups/m28").then(g => ({ default: g.NetworkDeviceRoles })), false),
  visual("791381/m28/cable-media-overview", () => import("./791381/groups/m28").then(g => ({ default: g.CableMediaOverview })), false),
  visual("791381/m28/subnetting-walkthrough", () => import("./791381/groups/m28").then(g => ({ default: g.SubnettingWalkthrough })), true),
  visual("791381/m28/wildcard-inversion", () => import("./791381/groups/m28").then(g => ({ default: g.WildcardInversion })), true),
  visual("791381/m28/nat-pat-apipa", () => import("./791381/groups/m28").then(g => ({ default: g.NatPatApipa })), false),
  visual("791381/m28/tcp-three-way-handshake", () => import("./791381/groups/m28").then(g => ({ default: g.TcpThreeWayHandshake })), true),
  visual("791381/m28/web-opening-journey", () => import("./791381/groups/m28").then(g => ({ default: g.WebOpeningJourney })), true),
  visual("791381/m28/troubleshooting-command-map", () => import("./791381/groups/m28").then(g => ({ default: g.TroubleshootingCommandMap })), false),
  // Batch 9 review-fix — source-exact Port Security config summary (m28 PDF 255; replaces the PDF181 scenario reuse)
  visual("791381/m28/port-security-config-summary", () => import("./791381/groups/m28").then(g => ({ default: g.PortSecurityConfigSummary })), false),
  // Batch 9 controlled sync — source-exact summaries for the four sensitive pages that could not reuse a Batch 7/8
  // component exactly (m28 PDF 244 IPv6, PDF 250 Metro-Ethernet+VLAN, PDF 251 route types, PDF 252 AD-only)
  visual("791381/m28/ipv6-summary", () => import("./791381/groups/m28").then(g => ({ default: g.Ipv6Summary })), false),
  visual("791381/m28/metro-vlan-summary", () => import("./791381/groups/m28").then(g => ({ default: g.MetroVlanSummary })), false),
  visual("791381/m28/route-types-summary", () => import("./791381/groups/m28").then(g => ({ default: g.RouteTypesSummary })), false),
  visual("791381/m28/admin-distance-summary", () => import("./791381/groups/m28").then(g => ({ default: g.AdminDistanceSummary })), false),
  // Reader follow-up — Sw6 ↔ Router trunk topology (m04 PDF150, site page 138)
  visual("791381/m04/sw6-router-trunk", () => import("./791381/groups/m04").then(g => ({ default: g.Sw6RouterTrunk })), false),
];

// Build the lookup once. A duplicate id is a programming error (a later entry silently shadowing an earlier one), so
// fail loudly at module load rather than resolve ambiguously.
const BY_ID = new Map<string, RegisteredVisual>();
for (const v of VISUALS) {
  if (BY_ID.has(v.id)) throw new Error(`duplicate visual id "${v.id}" in registry`);
  BY_ID.set(v.id, v);
}

/** Resolve a content `visualId` to its trusted registered visual, or `null` when there is no exact match. */
export function resolveVisual(id: string): RegisteredVisual | null {
  return (typeof id === "string" && BY_ID.get(id)) || null;
}

/** The enumerated visual ids (stable order) — used by guards/tests and never derived from content. */
export const REGISTERED_VISUAL_IDS: readonly string[] = VISUALS.map(v => v.id);
