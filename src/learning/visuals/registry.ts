// Learning Materials — SVG VISUAL ENRICHMENT registry (pilot, Chapter 1).
//
// The EXACT allowlist that maps a content `visualId` (a plain string) to a TRUSTED repo SVG component. Security
// discipline (same spirit as the activity engine): content never names a component, module path or code; a visual
// is reached ONLY through an entry enumerated here. An unknown key resolves to `null`, and the Reader then renders
// a faithful "قيد الإعداد" fallback (never a blank or a guess). Components are imported EAGERLY — each SVG is a few
// hundred bytes of markup, so a code-split chunk would cost more than it saves.
//
// This registry is course-agnostic: keys are namespaced (`791381/ch1/...`) so later chapters/courses add entries
// WITHOUT touching the Reader, the block type, or existing visuals. The enumerated set + its size are pinned by
// visuals.guards.test.ts (the test, not this comment, is the authority on the count).

import type { RegisteredVisual } from "./types";
import NetworkConnectedDevices from "./791381/chapter1/NetworkConnectedDevices";
import NetworkUsesMap from "./791381/chapter1/NetworkUsesMap";
import SharedPrinterDiagram from "./791381/chapter1/SharedPrinterDiagram";
import NetworkBuildingBlocks from "./791381/chapter1/NetworkBuildingBlocks";
import NetworkManagementCycle from "./791381/chapter1/NetworkManagementCycle";
// Batch 2 — 40-page discovery batch across units m02 (number bases), m07 (IP addresses), m08 (class/subnet/CIDR),
// m09 (devices). Same data-only, exact-allowlist discipline; ids namespaced per source module.
import BinaryToDecimal from "./791381/batch2/BinaryToDecimal";
import HexToBinary from "./791381/batch2/HexToBinary";
import ConversionMap from "./791381/batch2/ConversionMap";
import IpIdentity from "./791381/batch2/IpIdentity";
import Ipv4VsIpv6 from "./791381/batch2/Ipv4VsIpv6";
import PrivatePublicIp from "./791381/batch2/PrivatePublicIp";
import StaticDynamicIp from "./791381/batch2/StaticDynamicIp";
import AddressClasses from "./791381/batch2/AddressClasses";
import SubnetMask from "./791381/batch2/SubnetMask";
import SameNetwork from "./791381/batch2/SameNetwork";
import HubFlood from "./791381/batch2/HubFlood";
import SwitchUnicast from "./791381/batch2/SwitchUnicast";
import RouterNetworks from "./791381/batch2/RouterNetworks";
// Batch 3 — the next six units in reading order (m10 topologies, m11 cables/MAC, m12 message types, m13 OSI &
// TCP/IP, m14 protocols, m15 network-check commands; source PDF 57–97). Same data-only, exact-allowlist,
// reduced-motion discipline.
import P2pDirect from "./791381/batch3/P2pDirect";
import BusCollision from "./791381/batch3/BusCollision";
import UtpVsStp from "./791381/batch3/UtpVsStp";
import MacFrameDelivery from "./791381/batch3/MacFrameDelivery";
import MessageTypes from "./791381/batch3/MessageTypes";
import UnicastMulticast from "./791381/batch3/UnicastMulticast";
import StorageUnits from "./791381/batch3/StorageUnits";
import MessageStructure from "./791381/batch3/MessageStructure";
import TcpIpLayers from "./791381/batch3/TcpIpLayers";
import OsiVsTcpIp from "./791381/batch3/OsiVsTcpIp";
import TcpVsUdp from "./791381/batch3/TcpVsUdp";
import ProtocolAgreement from "./791381/batch3/ProtocolAgreement";
import DnsHttpDhcp from "./791381/batch3/DnsHttpDhcp";
import SshVsTelnet from "./791381/batch3/SshVsTelnet";
import ProtocolsByTransport from "./791381/batch3/ProtocolsByTransport";
import PingEcho from "./791381/batch3/PingEcho";
import TracertHops from "./791381/batch3/TracertHops";
// Batch 4 — network domains & security concepts (m16 PDF 98–105, m17 PDF 108–114; PDF115 SSH reuses the existing
// m14 ssh-vs-telnet visual, so it adds NO registry entry). Same data-only, exact-allowlist, reduced-motion discipline.
import CollisionDomains from "./791381/batch4/CollisionDomains";
import BroadcastDomain from "./791381/batch4/BroadcastDomain";
import StpLoopBlocking from "./791381/batch4/StpLoopBlocking";
import HalfFullDuplex from "./791381/batch4/HalfFullDuplex";
import LocalhostLoopback from "./791381/batch4/LocalhostLoopback";
import ApipaFallback from "./791381/batch4/ApipaFallback";
import AttackTargets from "./791381/batch4/AttackTargets";
import DosVsDdos from "./791381/batch4/DosVsDdos";
import HijackingVsMitm from "./791381/batch4/HijackingVsMitm";
import PhishingVsSpoofing from "./791381/batch4/PhishingVsSpoofing";
import SecureTwoPillars from "./791381/batch4/SecureTwoPillars";
import VpnTunnel from "./791381/batch4/VpnTunnel";
import HttpsSecureChannel from "./791381/batch4/HttpsSecureChannel";
import ArpAssociation from "./791381/batch3/ArpAssociation";

const VISUALS: readonly RegisteredVisual[] = [
  // Chapter 1 pilot
  { id: "791381/ch1/network-connected-devices", component: NetworkConnectedDevices, motion: true },
  { id: "791381/ch1/network-uses-map", component: NetworkUsesMap, motion: true },
  { id: "791381/ch1/shared-printer", component: SharedPrinterDiagram, motion: true },
  { id: "791381/ch1/network-building-blocks", component: NetworkBuildingBlocks, motion: true },
  { id: "791381/ch1/network-management-cycle", component: NetworkManagementCycle, motion: true },
  // Batch 2 — number bases (m02)
  { id: "791381/m02/binary-to-decimal", component: BinaryToDecimal, motion: true },
  { id: "791381/m02/hex-to-binary", component: HexToBinary, motion: true },
  { id: "791381/m02/conversion-map", component: ConversionMap, motion: true },
  // Batch 2 — IP addresses (m07)
  { id: "791381/m07/ip-identity", component: IpIdentity, motion: true },
  { id: "791381/m07/ipv4-vs-ipv6", component: Ipv4VsIpv6, motion: true },
  { id: "791381/m07/private-public", component: PrivatePublicIp, motion: true },
  { id: "791381/m07/static-dynamic", component: StaticDynamicIp, motion: true },
  // Batch 2 — class / subnet / CIDR (m08)
  { id: "791381/m08/address-classes", component: AddressClasses, motion: true },
  { id: "791381/m08/subnet-mask", component: SubnetMask, motion: true },
  { id: "791381/m08/same-network", component: SameNetwork, motion: true },
  // Batch 2 — devices (m09)
  { id: "791381/m09/hub-flood", component: HubFlood, motion: true },
  { id: "791381/m09/switch-unicast", component: SwitchUnicast, motion: true },
  { id: "791381/m09/router-networks", component: RouterNetworks, motion: true },
  // Batch 3 — topologies (m10)
  { id: "791381/m10/p2p-direct", component: P2pDirect, motion: true },
  { id: "791381/m10/bus-collision", component: BusCollision, motion: true },
  // Batch 3 — cables / MAC (m11)
  { id: "791381/m11/utp-vs-stp", component: UtpVsStp, motion: true },
  { id: "791381/m11/mac-frame-delivery", component: MacFrameDelivery, motion: true },
  // Batch 3 — message types (m12)
  { id: "791381/m12/message-types", component: MessageTypes, motion: true },
  { id: "791381/m12/unicast-multicast", component: UnicastMulticast, motion: true },
  { id: "791381/m12/storage-units", component: StorageUnits, motion: true },
  { id: "791381/m12/message-structure", component: MessageStructure, motion: true },
  // Batch 3 — communication models (m13)
  { id: "791381/m13/tcpip-layers", component: TcpIpLayers, motion: true },
  { id: "791381/m13/osi-vs-tcpip", component: OsiVsTcpIp, motion: true },
  { id: "791381/m13/tcp-vs-udp", component: TcpVsUdp, motion: true },
  // Batch 3 — protocols (m14)
  { id: "791381/m14/protocol-agreement", component: ProtocolAgreement, motion: true },
  { id: "791381/m14/dns-http-dhcp", component: DnsHttpDhcp, motion: true },
  { id: "791381/m14/ssh-vs-telnet", component: SshVsTelnet, motion: true },
  { id: "791381/m14/protocols-by-transport", component: ProtocolsByTransport, motion: true },
  // Batch 3 — network-check commands (m15)
  { id: "791381/m15/ping-echo", component: PingEcho, motion: true },
  { id: "791381/m15/tracert-hops", component: TracertHops, motion: true },
  { id: "791381/m15/arp-association", component: ArpAssociation, motion: true },
  // Batch 4 — domains & switching concepts (m16)
  { id: "791381/m16/collision-domains", component: CollisionDomains, motion: true },
  { id: "791381/m16/broadcast-domain", component: BroadcastDomain, motion: true },
  { id: "791381/m16/stp-loop-blocking", component: StpLoopBlocking, motion: true },
  { id: "791381/m16/half-full-duplex", component: HalfFullDuplex, motion: true },
  { id: "791381/m16/localhost-loopback", component: LocalhostLoopback, motion: true },
  { id: "791381/m16/apipa-fallback", component: ApipaFallback, motion: true },
  // Batch 4 — network security (m17)
  { id: "791381/m17/attack-targets", component: AttackTargets, motion: true },
  { id: "791381/m17/dos-vs-ddos", component: DosVsDdos, motion: true },
  { id: "791381/m17/hijacking-vs-mitm", component: HijackingVsMitm, motion: true },
  { id: "791381/m17/phishing-vs-spoofing", component: PhishingVsSpoofing, motion: true },
  { id: "791381/m17/secure-two-pillars", component: SecureTwoPillars, motion: true },
  { id: "791381/m17/vpn-tunnel", component: VpnTunnel, motion: true },
  { id: "791381/m17/https-secure-channel", component: HttpsSecureChannel, motion: true },
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
