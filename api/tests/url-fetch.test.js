import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import {
  safeFetch,
  UnsafeUrlError,
  isBlockedIPv4,
  isBlockedIPv6,
  validateUrlShape,
  resolveAndValidate,
  requestOnce,
  pickPreferredAddress
} from "../src/lib/url-fetch.js";

describe("isBlockedIPv4 - the actual SSRF boundary", () => {
  it("blocks the cloud instance-metadata address specifically", () => {
    expect(isBlockedIPv4("169.254.169.254")).toBe(true);
  });

  it("blocks the whole link-local /16, RFC1918 private ranges, and loopback", () => {
    expect(isBlockedIPv4("169.254.1.1")).toBe(true);
    expect(isBlockedIPv4("10.0.0.1")).toBe(true);
    expect(isBlockedIPv4("172.16.5.5")).toBe(true);
    expect(isBlockedIPv4("192.168.1.1")).toBe(true);
    expect(isBlockedIPv4("127.0.0.1")).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isBlockedIPv4("8.8.8.8")).toBe(false);
    expect(isBlockedIPv4("140.82.112.3")).toBe(false); // github.com's general range
  });

  it("refuses a malformed address rather than risk treating it as safe", () => {
    expect(isBlockedIPv4("not-an-ip")).toBe(true);
  });
});

describe("isBlockedIPv6", () => {
  it("blocks loopback, link-local, and unique-local", () => {
    expect(isBlockedIPv6("::1")).toBe(true);
    expect(isBlockedIPv6("fe80::1")).toBe(true);
    expect(isBlockedIPv6("fd00::1")).toBe(true);
  });

  it("blocks an IPv4-mapped IPv6 address whose embedded IPv4 is private", () => {
    expect(isBlockedIPv6("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isBlockedIPv6("2001:4860:4860::8888")).toBe(false); // google public DNS
  });
});

describe("validateUrlShape", () => {
  it("rejects non-http(s) schemes", () => {
    expect(() => validateUrlShape("file:///etc/passwd", null)).toThrow(UnsafeUrlError);
    expect(() => validateUrlShape("ftp://example.com/x", null)).toThrow(UnsafeUrlError);
  });

  it("rejects a malformed URL", () => {
    expect(() => validateUrlShape("not a url", null)).toThrow(UnsafeUrlError);
  });

  it("accepts http/https", () => {
    expect(() => validateUrlShape("https://example.com/page", null)).not.toThrow();
    expect(() => validateUrlShape("http://example.com/page", null)).not.toThrow();
  });

  it("enforces an allowedHosts allowlist case-insensitively", () => {
    expect(() => validateUrlShape("https://EVIL.example.com/x", ["docs.google.com"])).toThrow(UnsafeUrlError);
    expect(() => validateUrlShape("https://docs.google.com/forms/d/x", ["docs.google.com"])).not.toThrow();
  });
});

describe("resolveAndValidate - the DNS-time SSRF check", () => {
  it("rejects a hostname that resolves to a loopback address", async () => {
    await expect(resolveAndValidate("localhost")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("pickPreferredAddress - avoids pinning to an unreachable IPv6 record", () => {
  it("prefers an IPv4 record when the host resolves to both families (e.g. GitHub Pages)", () => {
    const records = [
      { address: "2606:50c0:8003::153", family: 6 },
      { address: "2606:50c0:8000::153", family: 6 },
      { address: "185.199.108.153", family: 4 },
      { address: "185.199.109.153", family: 4 }
    ];
    expect(pickPreferredAddress(records)).toEqual({ address: "185.199.108.153", family: 4 });
  });

  it("falls back to the first record when only IPv6 is available", () => {
    const records = [{ address: "2001:4860:4860::8888", family: 6 }];
    expect(pickPreferredAddress(records)).toEqual({ address: "2001:4860:4860::8888", family: 6 });
  });

  it("keeps the first IPv4 record's order when multiple IPv4 records exist", () => {
    const records = [
      { address: "192.0.2.10", family: 4 },
      { address: "192.0.2.20", family: 4 }
    ];
    expect(pickPreferredAddress(records)).toEqual({ address: "192.0.2.10", family: 4 });
  });
});

// Exercises the actual HTTP client logic (redirects, size cap, success) against a real local
// server - no network access needed, and importantly this bypasses resolveAndValidate entirely by
// calling requestOnce() directly with a manually-supplied pinned address, so it never has to
// weaken the production DNS/IP-blocking path to be testable.
describe("requestOnce - redirect handling and size cap against a real local server", () => {
  let server;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  function listen(handler) {
    return new Promise(resolve => {
      server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
  }

  it("returns the body and content-type on a normal 200 response", async () => {
    const port = await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body>hi</body></html>");
    });

    const url = new URL(`http://127.0.0.1:${port}/page`);
    const result = await requestOnce(url, { address: "127.0.0.1", family: 4 }, { timeoutMs: 2000, maxBytes: 1024 });

    expect(result.buffer.toString("utf8")).toContain("hi");
    expect(result.contentType).toContain("text/html");
  });

  // Unlike every other test in this block, the target hostname here is deliberately NOT a literal
  // IP - Node skips the custom `lookup` entirely when the hostname is already a valid IP literal
  // (as "127.0.0.1" is above), so those tests never actually exercise it. A real hostname forces
  // Node to call `lookup`, and on Node 20+ (Happy Eyeballs / autoSelectFamily, on by default) that
  // call arrives as `lookup(hostname, {all:true}, cb)` expecting an ARRAY back - the single
  // (address, family) callback shape crashed with ERR_INVALID_IP_ADDRESS, reported to the caller
  // as a generic "couldn't connect" (see production bug: a real, reachable, GitHub Pages URL was
  // rejected this way).
  it("honors the pinned address when Node requests it via the Happy-Eyeballs {all:true} lookup shape", async () => {
    const port = await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });

    const url = new URL(`http://this-hostname-is-not-a-literal-ip.invalid:${port}/page`);
    const result = await requestOnce(url, { address: "127.0.0.1", family: 4 }, { timeoutMs: 2000, maxBytes: 1024 });

    expect(result.buffer.toString("utf8")).toBe("ok");
  });

  it("reports a redirect instead of following it automatically", async () => {
    const port = await listen((req, res) => {
      res.writeHead(302, { location: "https://example.com/elsewhere" });
      res.end();
    });

    const url = new URL(`http://127.0.0.1:${port}/start`);
    const result = await requestOnce(url, { address: "127.0.0.1", family: 4 }, { timeoutMs: 2000, maxBytes: 1024 });

    expect(result.redirect).toBe("https://example.com/elsewhere");
  });

  it("aborts once the response exceeds the byte cap", async () => {
    const port = await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write(Buffer.alloc(2000, "a"));
      // Keep the connection open a bit so the size check fires before the response ever completes.
      setTimeout(() => { try { res.end(); } catch { /* client already destroyed it */ } }, 50);
    });

    const url = new URL(`http://127.0.0.1:${port}/big`);
    await expect(
      requestOnce(url, { address: "127.0.0.1", family: 4 }, { timeoutMs: 2000, maxBytes: 100 })
    ).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a non-2xx/redirect status", async () => {
    const port = await listen((req, res) => {
      res.writeHead(404);
      res.end("not found");
    });

    const url = new URL(`http://127.0.0.1:${port}/missing`);
    await expect(
      requestOnce(url, { address: "127.0.0.1", family: 4 }, { timeoutMs: 2000, maxBytes: 1024 })
    ).rejects.toThrow(UnsafeUrlError);
  });
});

describe("safeFetch - end-to-end SSRF rejection (no bypass)", () => {
  it("refuses to fetch a loopback URL even though it is syntactically a valid http(s) URL", async () => {
    await expect(safeFetch("http://127.0.0.1:9/anything")).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses the literal cloud metadata address", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses a host outside an explicit allowlist before ever attempting DNS/connect", async () => {
    await expect(
      safeFetch("https://example.com/form", { allowedHosts: ["docs.google.com", "forms.gle"] })
    ).rejects.toThrow(UnsafeUrlError);
  });
});
