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
// Batch 5 — three owner-requested backlog visuals (m08 CIDR PDF41, m12 broadcast-message PDF74, m13 OSI seven-layers
// PDF78) + the next roadmap scope (m18 encapsulation/anatomy PDF116–117, m03 switch CLI & VLAN PDF121–138). The backlog
// components live here in batch5/ but keep their correct m08/m12/m13 ids. Same data-only, exact-allowlist, reduced-
// motion discipline.
import CidrPrefix from "./791381/batch5/CidrPrefix";
import BroadcastMessageStructure from "./791381/batch5/BroadcastMessageStructure";
import OsiSevenLayers from "./791381/batch5/OsiSevenLayers";
import EncapsulationStack from "./791381/batch5/EncapsulationStack";
import PduAnatomy from "./791381/batch5/PduAnatomy";
import CliInterface from "./791381/batch5/CliInterface";
import CliModeLadder from "./791381/batch5/CliModeLadder";
import SwitchPortsMap from "./791381/batch5/SwitchPortsMap";
import SviInterface from "./791381/batch5/SviInterface";
import VlanSegmentation from "./791381/batch5/VlanSegmentation";
import VlanAccessTrunkTerms from "./791381/batch5/VlanAccessTrunkTerms";
import VlanExampleTopology from "./791381/batch5/VlanExampleTopology";
import CreateVlan from "./791381/batch5/CreateVlan";
import AccessPortToVlan from "./791381/batch5/AccessPortToVlan";
import SviGateway from "./791381/batch5/SviGateway";
import TaggedUntaggedNative from "./791381/batch5/TaggedUntaggedNative";
// Batch 6 — the routing / switch-services arc across the previously visual-free modules: Router on a Stick & Trunk
// (m04, PDF 147–156), VTP (m19, PDF 141), well-known ports (m21, PDF 168), DHCP (m22, PDF 170–171), Port Security
// (m23, PDF 181), Cisco device access (m24, PDF 186), WAN (m26, PDF 207), routing protocols (m27, PDF 212–222) and
// ACL (m06, PDF 223). Same data-only, exact-allowlist, reduced-motion discipline; no CLI-simulator duplication.
import TrunkMultiVlan from "./791381/batch6/TrunkMultiVlan";
import Dot1qTagFrame from "./791381/batch6/Dot1qTagFrame";
import RouterOnAStick from "./791381/batch6/RouterOnAStick";
import InterVlanFlow from "./791381/batch6/InterVlanFlow";
import VtpPropagation from "./791381/batch6/VtpPropagation";
import WellKnownPorts from "./791381/batch6/WellKnownPorts";
import DhcpDora from "./791381/batch6/DhcpDora";
import DhcpPoolExcluded from "./791381/batch6/DhcpPoolExcluded";
import PortSecurityScenario from "./791381/batch6/PortSecurityScenario";
import DeviceAccessPaths from "./791381/batch6/DeviceAccessPaths";
import WanVsLanScope from "./791381/batch6/WanVsLanScope";
import AdminDistance from "./791381/batch6/AdminDistance";
import RoutingUpdateTypes from "./791381/batch6/RoutingUpdateTypes";
import OspfTopology from "./791381/batch6/OspfTopology";
import ShowIpRoute from "./791381/batch6/ShowIpRoute";
import AclGate from "./791381/batch6/AclGate";

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
  // Batch 5 — backlog: CIDR (m08), broadcast message structure (m12), OSI seven layers (m13)
  { id: "791381/m08/cidr-prefix", component: CidrPrefix, motion: true },
  { id: "791381/m12/broadcast-message-structure", component: BroadcastMessageStructure, motion: true },
  { id: "791381/m13/osi-seven-layers", component: OsiSevenLayers, motion: true },
  // Batch 5 — data segmentation (m18)
  { id: "791381/m18/encapsulation-stack", component: EncapsulationStack, motion: true },
  { id: "791381/m18/pdu-anatomy", component: PduAnatomy, motion: true },
  // Batch 5 — switch CLI & VLAN (m03)
  { id: "791381/m03/cli-interface", component: CliInterface, motion: true },
  { id: "791381/m03/cli-mode-ladder", component: CliModeLadder, motion: true },
  { id: "791381/m03/switch-ports-map", component: SwitchPortsMap, motion: true },
  { id: "791381/m03/svi-interface", component: SviInterface, motion: true },
  { id: "791381/m03/vlan-segmentation", component: VlanSegmentation, motion: true },
  { id: "791381/m03/vlan-access-trunk-terms", component: VlanAccessTrunkTerms, motion: true },
  { id: "791381/m03/vlan-example-topology", component: VlanExampleTopology, motion: true },
  { id: "791381/m03/create-vlan", component: CreateVlan, motion: true },
  { id: "791381/m03/access-port-assignment", component: AccessPortToVlan, motion: true },
  { id: "791381/m03/svi-gateway", component: SviGateway, motion: true },
  { id: "791381/m03/tagged-untagged-native", component: TaggedUntaggedNative, motion: true },
  // Batch 6 — Router on a Stick & Trunk (m04)
  { id: "791381/m04/trunk-multi-vlan", component: TrunkMultiVlan, motion: false },
  { id: "791381/m04/dot1q-tag-frame", component: Dot1qTagFrame, motion: true },
  { id: "791381/m04/router-on-a-stick", component: RouterOnAStick, motion: false },
  { id: "791381/m04/inter-vlan-flow", component: InterVlanFlow, motion: true },
  // Batch 6 — VTP (m19)
  { id: "791381/m19/vtp-propagation", component: VtpPropagation, motion: true },
  // Batch 6 — well-known ports (m21)
  { id: "791381/m21/well-known-ports", component: WellKnownPorts, motion: false },
  // Batch 6 — DHCP (m22)
  { id: "791381/m22/dhcp-dora", component: DhcpDora, motion: true },
  { id: "791381/m22/dhcp-pool-excluded", component: DhcpPoolExcluded, motion: false },
  // Batch 6 — Port Security (m23)
  { id: "791381/m23/port-security-scenario", component: PortSecurityScenario, motion: false },
  // Batch 6 — Cisco device access (m24)
  { id: "791381/m24/device-access-paths", component: DeviceAccessPaths, motion: false },
  // Batch 6 — WAN (m26)
  { id: "791381/m26/wan-vs-lan-scope", component: WanVsLanScope, motion: false },
  // Batch 6 — routing protocols (m27)
  { id: "791381/m27/admin-distance", component: AdminDistance, motion: false },
  { id: "791381/m27/routing-update-types", component: RoutingUpdateTypes, motion: true },
  { id: "791381/m27/ospf-topology", component: OspfTopology, motion: false },
  { id: "791381/m27/show-ip-route", component: ShowIpRoute, motion: false },
  // Batch 6 — ACL (m06)
  { id: "791381/m06/acl-gate", component: AclGate, motion: true },
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
