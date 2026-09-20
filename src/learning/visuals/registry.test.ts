// SVG visual-enrichment REGISTRY — exact-allowlist resolution and pilot scope.
import { describe, it, expect } from "vitest";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "./registry";

describe("visuals registry", () => {
  it("enumerates exactly the Chapter 1 pilot + Batch 2 + Batch 3 visuals (stable, namespaced ids)", () => {
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
      "791381/m10/topology-shapes",
      "791381/m10/bus-collision",
      // Batch 3 — cables / MAC (m11)
      "791381/m11/cable-types",
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
      "791381/m14/protocols-overview",
      "791381/m14/dns-http-dhcp",
      "791381/m14/ssh-vs-telnet",
      "791381/m14/protocols-by-transport",
    ]);
    expect(REGISTERED_VISUAL_IDS.length).toBe(33);
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
