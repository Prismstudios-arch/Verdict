import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for the audit crawler.
 *
 * Every URL the crawler is asked to touch (the audit entry URL, every
 * sub-request host, and every redirect hop) must pass `assertPublicUrl`.
 * The check: scheme is http/https, the hostname is not an obviously-internal
 * name, and EVERY resolved IP (v4 and v6) is outside private / link-local /
 * loopback / metadata / reserved ranges.
 */

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],        // "this" network
  ["10.0.0.0", 8],       // private
  ["100.64.0.0", 10],    // CGNAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local (cloud metadata 169.254.169.254)
  ["172.16.0.0", 12],    // private
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.168.0.0", 16],   // private
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved + broadcast
];

export function isPrivateIp(address: string): boolean {
  const kind = net.isIP(address);
  if (kind === 4) {
    const ip = ipv4ToInt(address);
    return PRIVATE_V4.some(([base, bits]) => inCidr4(ip, base, bits));
  }
  if (kind === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // IPv4-mapped in hex form (::ffff:a00:1) — WHATWG URL normalizes the
    // dotted form to this, so it must be decoded and re-checked too.
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (lower === "::" || lower === "::1") return true;
    const firstGroup = lower.split(":")[0] || "0";
    const first = parseInt(firstGroup === "" ? "0" : firstGroup, 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (lower.startsWith("2001:db8")) return true; // documentation
    if (lower.startsWith("64:ff9b")) return true;  // NAT64 — may embed private v4
    return false;
  }
  // Not an IP literal at all — caller must resolve first.
  return true;
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.intranet$/i,
  /\.corp$/i,
  /\.home$/i,
  /\.lan$/i,
];

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.replace(/\.$/, "");
  return BLOCKED_HOSTNAME_PATTERNS.some((re) => re.test(h));
}

export interface SafeUrlResult {
  url: URL;
  addresses: string[];
}

/**
 * Throws SsrfBlockedError unless the URL is a public http(s) URL whose
 * hostname resolves exclusively to public IPs. Returns the resolved
 * addresses so callers can pin/cross-check later hops.
 */
export async function assertPublicUrl(
  rawUrl: string,
  resolver: Resolver = defaultResolver,
): Promise<SafeUrlResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Blocked scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("Credentials in URL are not allowed");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) throw new SsrfBlockedError("Missing hostname");
  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(`Blocked hostname: ${hostname}`);
  }

  // IP literal — check directly, no DNS involved.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SsrfBlockedError(`Blocked IP literal: ${hostname}`);
    }
    return { url, addresses: [hostname] };
  }

  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new SsrfBlockedError(`DNS resolution failed for ${hostname}`);
  }
  if (!addresses.length) {
    throw new SsrfBlockedError(`No DNS records for ${hostname}`);
  }
  for (const address of addresses) {
    if (isPrivateIp(address)) {
      throw new SsrfBlockedError(
        `Hostname ${hostname} resolves to blocked address ${address}`,
      );
    }
  }
  return { url, addresses };
}

/**
 * Per-audit host gate used by the crawler's request interception.
 * Re-validates every distinct host seen during a page load (sub-resources,
 * redirect targets). Caches verdicts for the lifetime of one audit; the
 * short cache lifetime plus per-host re-resolution limits DNS-rebinding
 * windows.
 */
export function createHostGate(resolver: Resolver = defaultResolver) {
  const cache = new Map<string, Promise<boolean>>();
  return async function isAllowed(rawUrl: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const key = url.hostname;
    let pending = cache.get(key);
    if (!pending) {
      pending = assertPublicUrl(`${url.protocol}//${url.host}/`, resolver)
        .then(() => true)
        .catch(() => false);
      cache.set(key, pending);
    }
    return pending;
  };
}
