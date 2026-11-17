import { describe, it, expect } from "vitest";
import {
  parseIpv4, formatIpv4, binaryIpv4, maskFromPrefix, prefixFromMask, parsePrefixOrMask, parseCidrInput, analyzeIpv4, analyzeCidrText,
  addressClass, addressScope, splitSubnets, prefixForHosts, prefixForSubnetCount, MAX_SUBNET_ROWS
} from "./ipv4Calculator";

const ip = (s: string): number => { const n = parseIpv4(s); if (n === null) throw new Error("fixture " + s); return n; };
const analyze = (s: string) => { const r = analyzeCidrText(s); if (!r.ok) throw new Error(r.message); return r.value; };

describe("T1 — IPv4 parsing", () => {
  it.each(["0.0.0.0", "255.255.255.255", "192.168.1.10", " 10.0.0.1 "])("accepts %s", s => {
    expect(parseIpv4(s)).not.toBeNull();
  });
  it.each(["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1.2.3.-4", "1.2.3.4a", "1..3.4", "0x1.2.3.4", "1.2.3.4 5", "١٩٢.١٦٨.١.١"])("refuses %j", s => {
    expect(parseIpv4(s)).toBeNull();
  });
  it("round-trips through the unsigned integer form", () => {
    for (const s of ["0.0.0.0", "255.255.255.255", "128.0.0.1", "172.16.254.3"]) expect(formatIpv4(ip(s))).toBe(s);
    expect(ip("255.255.255.255")).toBe(4294967295);
  });
  it("prints the dotted binary form", () => {
    expect(binaryIpv4(ip("192.168.1.10"))).toBe("11000000.10101000.00000001.00001010");
  });
});

describe("T1 — masks and prefixes", () => {
  it("maps prefixes to masks at the edges", () => {
    expect(formatIpv4(maskFromPrefix(0))).toBe("0.0.0.0");
    expect(formatIpv4(maskFromPrefix(1))).toBe("128.0.0.0");
    expect(formatIpv4(maskFromPrefix(26))).toBe("255.255.255.192");
    expect(formatIpv4(maskFromPrefix(32))).toBe("255.255.255.255");
  });
  it("maps every prefix back from its mask", () => {
    for (let p = 0; p <= 32; p++) expect(prefixFromMask(maskFromPrefix(p))).toBe(p);
  });
  it("refuses a non-contiguous mask", () => {
    expect(prefixFromMask(ip("255.0.255.0"))).toBeNull();
    expect(prefixFromMask(ip("0.255.255.255"))).toBeNull();
    expect(parsePrefixOrMask("255.255.0.255")).toBeNull();
  });
  it("reads /n, n and dotted masks; refuses out-of-range and padded forms", () => {
    expect(parsePrefixOrMask("/24")).toBe(24);
    expect(parsePrefixOrMask("8")).toBe(8);
    expect(parsePrefixOrMask("255.255.240.0")).toBe(20);
    expect(parsePrefixOrMask("/33")).toBeNull();
    expect(parsePrefixOrMask("/024")).toBeNull();
    expect(parsePrefixOrMask("-1")).toBeNull();
  });
});

describe("T1 — CIDR input", () => {
  it("accepts slash, spaced slash and dotted-mask notations", () => {
    expect(parseCidrInput("192.168.1.10/26")).toEqual({ ok: true, value: { address: ip("192.168.1.10"), prefix: 26 } });
    expect(parseCidrInput("192.168.1.10 /26")).toEqual({ ok: true, value: { address: ip("192.168.1.10"), prefix: 26 } });
    expect(parseCidrInput("192.168.1.10 255.255.255.192")).toEqual({ ok: true, value: { address: ip("192.168.1.10"), prefix: 26 } });
  });
  it.each([
    ["", "EMPTY"], ["192.168.1.10", "MISSING_PREFIX"], ["192.168.1/24", "INVALID_ADDRESS"], ["192.168.1.10/40", "INVALID_PREFIX"],
    ["192.168.1.10 255.0.255.0", "INVALID_PREFIX"], ["192.168.1.10/24/8", "INVALID_PREFIX"]
  ])("refuses %j with %s and an Arabic message", (text, code) => {
    const r = parseCidrInput(text);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe(code); expect(r.message).toMatch(/[؀-ۿ]/); }
  });
});

describe("T1 — analysis", () => {
  it("computes a textbook /26", () => {
    expect(analyze("192.168.1.10/26")).toEqual({
      address: "192.168.1.10", prefix: 26, mask: "255.255.255.192", wildcard: "0.0.0.63",
      network: "192.168.1.0", broadcast: "192.168.1.63", firstHost: "192.168.1.1", lastHost: "192.168.1.62",
      totalAddresses: 64, usableHosts: 62, addressClass: "C", scope: "private",
      binary: { address: "11000000.10101000.00000001.00001010", mask: "11111111.11111111.11111111.11000000", network: "11000000.10101000.00000001.00000000" }
    });
  });
  it("computes a non-octet-aligned /20 in class B", () => {
    const a = analyze("172.16.37.200/20");
    expect([a.network, a.broadcast, a.firstHost, a.lastHost, a.usableHosts]).toEqual(["172.16.32.0", "172.16.47.255", "172.16.32.1", "172.16.47.254", 4094]);
  });
  it("follows RFC 3021 for /31 and the host-route convention for /32", () => {
    const p31 = analyze("10.0.0.7/31");
    expect([p31.network, p31.broadcast, p31.firstHost, p31.lastHost, p31.usableHosts, p31.totalAddresses]).toEqual(["10.0.0.6", null, "10.0.0.6", "10.0.0.7", 2, 2]);
    const p32 = analyze("10.0.0.7/32");
    expect([p32.network, p32.broadcast, p32.firstHost, p32.lastHost, p32.usableHosts]).toEqual(["10.0.0.7", null, "10.0.0.7", "10.0.0.7", 1]);
  });
  it("handles /0 and the top of the address space without sign errors", () => {
    const all = analyze("200.1.2.3/0");
    expect([all.network, all.broadcast, all.mask, all.wildcard, all.totalAddresses, all.usableHosts]).toEqual(["0.0.0.0", "255.255.255.255", "0.0.0.0", "255.255.255.255", 4294967296, 4294967294]);
    const top = analyze("255.255.255.255/24");
    expect([top.network, top.broadcast, top.lastHost]).toEqual(["255.255.255.0", "255.255.255.255", "255.255.255.254"]);
  });
  it("refuses an out-of-range prefix", () => {
    expect(analyzeIpv4(0, 33).ok).toBe(false);
    expect(analyzeIpv4(0, 2.5).ok).toBe(false);
  });
  it("classifies address classes and scopes", () => {
    expect(["1.0.0.0", "128.0.0.0", "192.0.0.0", "224.0.0.0", "240.0.0.0"].map(s => addressClass(ip(s)))).toEqual(["A", "B", "C", "D", "E"]);
    expect(["10.1.2.3", "172.31.255.255", "172.32.0.0", "192.168.0.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "224.0.0.5", "240.0.0.1", "0.1.2.3", "8.8.8.8"].map(s => addressScope(ip(s))))
      .toEqual(["private", "private", "public", "private", "loopback", "linkLocal", "sharedAddress", "multicast", "reserved", "thisNetwork", "public"]);
  });
});

describe("T1 — subnetting", () => {
  it("splits a /24 into four /26 subnets", () => {
    const r = splitSubnets(ip("192.168.1.77"), 24, 26);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.value.borrowedBits, r.value.totalSubnets, r.value.hostsPerSubnet, r.value.truncated]).toEqual([2, 4, 62, false]);
    expect(r.value.subnets.map(s => [s.network, s.firstHost, s.lastHost, s.broadcast])).toEqual([
      ["192.168.1.0", "192.168.1.1", "192.168.1.62", "192.168.1.63"],
      ["192.168.1.64", "192.168.1.65", "192.168.1.126", "192.168.1.127"],
      ["192.168.1.128", "192.168.1.129", "192.168.1.190", "192.168.1.191"],
      ["192.168.1.192", "192.168.1.193", "192.168.1.254", "192.168.1.255"]
    ]);
  });
  it("bounds the listed rows but reports the exact count", () => {
    const r = splitSubnets(ip("10.0.0.0"), 8, 30);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalSubnets).toBe(4194304);
    expect(r.value.subnets).toHaveLength(MAX_SUBNET_ROWS);
    expect(r.value.truncated).toBe(true);
    expect(r.value.subnets[MAX_SUBNET_ROWS - 1].network).toBe("10.0.0.252");
    const small = splitSubnets(ip("10.0.0.0"), 8, 30, 3);
    expect(small.ok && small.value.subnets.length).toBe(3);
  });
  it("splits the whole space without overflow", () => {
    const r = splitSubnets(0, 0, 1);
    expect(r.ok && r.value.subnets.map(s => [s.network, s.broadcast])).toEqual([["0.0.0.0", "127.255.255.255"], ["128.0.0.0", "255.255.255.255"]]);
  });
  it("refuses a new prefix that is not longer than the base", () => {
    expect(splitSubnets(0, 24, 24).ok).toBe(false);
    expect(splitSubnets(0, 24, 33).ok).toBe(false);
    expect(splitSubnets(0, 33, 34).ok).toBe(false);
  });
  it("finds the prefix for a host count", () => {
    expect([1, 2, 3, 62, 63, 254, 255].map(prefixForHosts)).toEqual([32, 31, 29, 26, 25, 24, 23]);
    expect(prefixForHosts(0)).toBeNull();
    expect(prefixForHosts(2 ** 32)).toBeNull();
  });
  it("finds the prefix for a subnet count", () => {
    expect([1, 2, 3, 4, 5, 8, 9].map(c => prefixForSubnetCount(24, c))).toEqual([24, 25, 26, 26, 27, 27, 28]);
    expect(prefixForSubnetCount(30, 8)).toBeNull();
    expect(prefixForSubnetCount(24, 0)).toBeNull();
  });
});
