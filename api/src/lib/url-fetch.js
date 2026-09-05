// Fetches a teacher-supplied URL server-side. This is the first place in the whole backend that
// makes an outbound HTTP request to an address a user controls (every other outbound call targets
// a fixed AI-provider base URL from server env vars) - so there is no existing SSRF mitigation to
// inherit here, and everything below is deliberate:
//   - only http/https schemes
//   - DNS-resolves the hostname up front and rejects any private/loopback/link-local address,
//     including 169.254.169.254 specifically (the cloud instance-metadata IP on Azure/AWS/GCP)
//   - pins the ACTUAL socket connection to that exact validated address (a custom `lookup`), so a
//     second DNS query at connect time can never return a different, unvalidated address
//     (DNS-rebinding) - the bytes always go to the IP that was actually checked
//   - never auto-follows redirects; each hop's URL is re-validated from scratch, up to a hard cap
//   - a hard timeout and a hard response-size cap
//   - an optional allowedHosts allowlist, checked before any of the above

const http = require("http");
const https = require("https");
const dns = require("dns").promises;
const { URL } = require("url");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

class UnsafeUrlError extends Error {}

const IPV4_BLOCKED_RANGES = [
  ["0.0.0.0", 8],       // "this network"
  ["10.0.0.0", 8],      // RFC1918 private
  ["100.64.0.0", 10],   // carrier-grade NAT
  ["127.0.0.0", 8],     // loopback
  ["169.254.0.0", 16],  // link-local - includes 169.254.169.254 (cloud metadata service)
  ["172.16.0.0", 12],   // RFC1918 private
  ["192.0.0.0", 24],    // IETF protocol assignments
  ["192.168.0.0", 16],  // RFC1918 private
  ["198.18.0.0", 15],   // benchmarking
  ["224.0.0.0", 4],     // multicast
  ["240.0.0.0", 4]      // reserved
];

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIPv4(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return true; // not a well-formed IPv4 literal - refuse rather than risk misparsing it as safe
  }
  const value = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") {
    return true;
  }
  if (lower.startsWith("::ffff:")) {
    const embedded = lower.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(embedded)) {
      return isBlockedIPv4(embedded);
    }
  }
  // fe80::/10 (link-local) and fc00::/7 (unique local) - both cover the same "not globally
  // routable, could be an internal service" risk as the IPv4 private/link-local ranges above.
  if (/^fe[89ab]/.test(lower) || /^f[cd]/.test(lower)) {
    return true;
  }
  return false;
}

function isBlockedIP(address, family) {
  return family === 6 ? isBlockedIPv6(address) : isBlockedIPv4(address);
}

function validateUrlShape(rawUrl, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("الرابط غير صالح.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("يُسمح فقط بروابط http/https.");
  }

  if (allowedHosts && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new UnsafeUrlError("هذا الرابط ليس ضمن النطاقات المسموحة.");
  }

  return parsed;
}

// Pure and exported for testing. Many hosting environments (including this app's Azure Functions
// host) have no outbound IPv6 route at all, so pinning to an IPv6 record from a dual-stack host
// (e.g. GitHub Pages, which publishes both AAAA and A records) fails to connect even though the
// address itself is safe. Prefer an IPv4 record when one exists.
function pickPreferredAddress(records) {
  return records.find(record => record.family === 4) || records[0];
}

async function resolveAndValidate(hostname) {
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("تعذر تحليل اسم النطاق.");
  }

  if (!records.length) {
    throw new UnsafeUrlError("تعذر تحليل اسم النطاق.");
  }

  // Reject if ANY resolved address is disallowed, not just the first - a hostname resolving to
  // multiple records where only some are private is still treated as unsafe.
  for (const record of records) {
    if (isBlockedIP(record.address, record.family)) {
      throw new UnsafeUrlError("هذا الرابط يشير إلى عنوان شبكي غير مسموح.");
    }
  }

  return pickPreferredAddress(records);
}

function requestOnce(parsedUrl, pinnedAddress, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const client = parsedUrl.protocol === "https:" ? https : http;

    const req = client.request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: { "User-Agent": "ExamBank791381-ImportBot/1.0", Accept: "text/html, */*" },
      timeout: timeoutMs,
      // Node's Happy Eyeballs (autoSelectFamily, on by default since Node 20+) calls a custom
      // `lookup` with options.all=true and expects an ARRAY of {address, family} back - the old
      // single-address (address, family) callback form silently crashed the connection with
      // ERR_INVALID_IP_ADDRESS ("Invalid IP address: undefined"), which the generic error handler
      // below then reported as an ordinary "couldn't connect" - masking the real cause. Support
      // both callback shapes so the pinned address is honored either way.
      lookup: (_hostname, options, callback) => (options && options.all
        ? callback(null, [{ address: pinnedAddress.address, family: pinnedAddress.family }])
        : callback(null, pinnedAddress.address, pinnedAddress.family))
    }, res => {
      const status = res.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(status)) {
        res.resume();
        resolve({ redirect: res.headers.location || null });
        return;
      }

      if (status < 200 || status >= 300) {
        res.resume();
        reject(new UnsafeUrlError("فشل تحميل الرابط (HTTP " + status + ")."));
        return;
      }

      const contentType = String(res.headers["content-type"] || "");
      const chunks = [];
      let received = 0;

      res.on("data", chunk => {
        received += chunk.length;
        if (received > maxBytes) {
          req.destroy(new Error("response-too-large"));
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType }));
      res.on("error", reject);
    });

    req.on("timeout", () => req.destroy(new Error("request-timeout")));

    req.on("error", err => {
      if (err.message === "response-too-large") {
        reject(new UnsafeUrlError("محتوى الرابط أكبر من الحد المسموح."));
      }
      else if (err.message === "request-timeout") {
        reject(new UnsafeUrlError("انتهت مهلة تحميل الرابط."));
      }
      else {
        reject(new UnsafeUrlError("تعذر الاتصال بالرابط."));
      }
    });

    req.end();
  });
}

async function safeFetch(rawUrl, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowedHosts = options.allowedHosts
    ? options.allowedHosts.map(h => h.toLowerCase())
    : null;

  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = validateUrlShape(currentUrl, allowedHosts);
    const pinnedAddress = await resolveAndValidate(parsed.hostname);
    const result = await requestOnce(parsed, pinnedAddress, { timeoutMs, maxBytes });

    if (result.redirect) {
      if (hop === maxRedirects) {
        throw new UnsafeUrlError("عدد كبير جدًا من إعادة التوجيه.");
      }
      currentUrl = new URL(result.redirect, currentUrl).toString();
      continue;
    }

    return result;
  }

  throw new UnsafeUrlError("تعذر تحميل الرابط.");
}

module.exports = {
  safeFetch,
  UnsafeUrlError,
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedIP,
  validateUrlShape,
  resolveAndValidate,
  requestOnce,
  pickPreferredAddress
};
