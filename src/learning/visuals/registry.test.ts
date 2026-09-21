// SVG visual-enrichment REGISTRY — exact-allowlist resolution and pilot scope.
import { describe, it, expect } from "vitest";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "./registry";

describe("visuals registry", () => {
  it("enumerates exactly the Chapter 1 pilot + Batch 2 + Batch 3 + Batch 4 visuals (stable, namespaced ids)", () => {
    expect(REGISTERED_VISUAL_IDS).toEqual([
      // Chapter 1 pilot
      "791381/ch1/network-connected-devices",
      "791381/ch1/network-uses-map",
      "791381/ch1/shared-printer",
      "791381/ch1/network-building-blocks",
      "791381/ch1/network-management-cycle",
      // Batch 2 — number bases (m02)
      "791381/m02/binary-to-decimal",
      "791381/m02/hex-to-binary",
      "791381/m02/conversion-map",
      // Batch 2 — IP addresses (m07)
      "791381/m07/ip-identity",
      "791381/m07/ipv4-vs-ipv6",
      "791381/m07/private-public",
      "791381/m07/static-dynamic",
      // Batch 2 — class / subnet / CIDR (m08)
      "791381/m08/address-classes",
      "791381/m08/subnet-mask",
      "791381/m08/same-network",
      // Batch 2 — devices (m09)
      "791381/m09/hub-flood",
      "791381/m09/switch-unicast",
      "791381/m09/router-networks",
      // Batch 3 — topologies (m10)
      "791381/m10/p2p-direct",
      "791381/m10/bus-collision",
      // Batch 3 — cables / MAC (m11)
      "791381/m11/utp-vs-stp",
      "791381/m11/mac-frame-delivery",
      // Batch 3 — message types (m12)
      "791381/m12/message-types",
      "791381/m12/unicast-multicast",
      "791381/m12/storage-units",
      "791381/m12/message-structure",
      // Batch 3 — communication models (m13)
      "791381/m13/tcpip-layers",
      "791381/m13/osi-vs-tcpip",
      "791381/m13/tcp-vs-udp",
      // Batch 3 — protocols (m14)
      "791381/m14/protocol-agreement",
      "791381/m14/dns-http-dhcp",
      "791381/m14/ssh-vs-telnet",
      "791381/m14/protocols-by-transport",
      // Batch 3 — network-check commands (m15)
      "791381/m15/ping-echo",
      "791381/m15/tracert-hops",
      "791381/m15/arp-association",
      // Batch 4 — domains & switching concepts (m16)
      "791381/m16/collision-domains",
      "791381/m16/broadcast-domain",
      "791381/m16/stp-loop-blocking",
      "791381/m16/half-full-duplex",
      "791381/m16/localhost-loopback",
      "791381/m16/apipa-fallback",
      // Batch 4 — network security (m17)
      "791381/m17/attack-targets",
      "791381/m17/dos-vs-ddos",
      "791381/m17/hijacking-vs-mitm",
      "791381/m17/phishing-vs-spoofing",
      "791381/m17/secure-two-pillars",
      "791381/m17/vpn-tunnel",
      "791381/m17/https-secure-channel",
      // Batch 5 — backlog (m08 CIDR, m12 broadcast message, m13 OSI seven layers)
      "791381/m08/cidr-prefix",
      "791381/m12/broadcast-message-structure",
      "791381/m13/osi-seven-layers",
      // Batch 5 — data segmentation (m18)
      "791381/m18/encapsulation-stack",
      "791381/m18/pdu-anatomy",
      // Batch 5 — switch CLI & VLAN (m03)
      "791381/m03/cli-interface",
      "791381/m03/cli-mode-ladder",
      "791381/m03/switch-ports-map",
      "791381/m03/svi-interface",
      "791381/m03/vlan-segmentation",
      "791381/m03/vlan-access-trunk-terms",
      "791381/m03/vlan-example-topology",
      "791381/m03/create-vlan",
      "791381/m03/access-port-assignment",
      "791381/m03/svi-gateway",
      "791381/m03/tagged-untagged-native",
      // Batch 6 — Router on a Stick & Trunk (m04)
      "791381/m04/trunk-multi-vlan",
      "791381/m04/dot1q-tag-frame",
      "791381/m04/router-on-a-stick",
      "791381/m04/inter-vlan-flow",
      // Batch 6 — VTP (m19)
      "791381/m19/vtp-propagation",
      // Batch 6 — well-known ports (m21)
      "791381/m21/well-known-ports",
      // Batch 6 — DHCP (m22)
      "791381/m22/dhcp-dora",
      "791381/m22/dhcp-pool-excluded",
      // Batch 6 — Port Security (m23)
      "791381/m23/port-security-scenario",
      // Batch 6 — Cisco device access (m24)
      "791381/m24/device-access-paths",
      // Batch 6 — WAN (m26)
      "791381/m26/wan-vs-lan-scope",
      // Batch 6 — routing protocols (m27)
      "791381/m27/admin-distance",
      "791381/m27/routing-update-types",
      "791381/m27/ospf-topology",
      "791381/m27/show-ip-route",
      // Batch 6 — ACL (m06)
      "791381/m06/acl-gate",
      // Batch 9 — ACL decision detail (m06)
      "791381/m06/standard-acl-source",
      "791381/m06/extended-acl-decision",
      // Batch 9 — comprehensive summary (m28)
      "791381/m28/ip-vs-mac-summary",
      "791381/m28/network-device-roles",
      "791381/m28/cable-media-overview",
      "791381/m28/subnetting-walkthrough",
      "791381/m28/wildcard-inversion",
      "791381/m28/nat-pat-apipa",
      "791381/m28/tcp-three-way-handshake",
      "791381/m28/web-opening-journey",
      "791381/m28/troubleshooting-command-map",
      // Batch 9 review-fix — source-exact Port Security config summary (m28 PDF 255)
      "791381/m28/port-security-config-summary",
    ]);
    expect(REGISTERED_VISUAL_IDS.length).toBe(93);
  });

  it("every id is course/namespace scoped (reusable pattern for later chapters)", () => {
    for (const id of REGISTERED_VISUAL_IDS) expect(id).toMatch(/^791381\/(ch1|m\d{2})\/[a-z0-9-]+$/);
  });

  it("resolves each registered id to a component with a motion flag", () => {
    for (const id of REGISTERED_VISUAL_IDS) {
      const entry = resolveVisual(id);
      expect(entry).not.toBeNull();
      expect(typeof entry!.component).toBe("function");
      expect(typeof entry!.motion).toBe("boolean");
    }
  });

  it("returns null (never throws, never guesses) for an unknown or non-string key", () => {
    expect(resolveVisual("791381/ch1/does-not-exist")).toBeNull();
    expect(resolveVisual("")).toBeNull();
    expect(resolveVisual(undefined as unknown as string)).toBeNull();
    expect(resolveVisual({ toString: () => "791381/ch1/shared-printer" } as unknown as string)).toBeNull();
  });

  it("has no duplicate ids", () => {
    expect(new Set(REGISTERED_VISUAL_IDS).size).toBe(REGISTERED_VISUAL_IDS.length);
  });
});
