import { describe, it, expect } from "vitest";
import {
  assertPublicUrl,
  createHostGate,
  isBlockedHostname,
  isPrivateIp,
  SsrfBlockedError,
  type Resolver,
} from "./ssrf.js";

const publicResolver: Resolver = async () => ["93.184.216.34"];
const privateResolver: Resolver = async () => ["10.1.2.3"];
const mixedResolver: Resolver = async () => ["93.184.216.34", "192.168.0.10"];
const failingResolver: Resolver = async () => {
  throw new Error("ENOTFOUND");
};

describe("isPrivateIp — IPv4", () => {
  const privates = [
    "0.0.0.0", "0.255.255.255",
    "10.0.0.1", "10.255.255.255",
    "100.64.0.1", "100.127.255.254",
    "127.0.0.1", "127.53.1.1",
    "169.254.169.254", "169.254.0.1",
    "172.16.0.1", "172.20.10.5", "172.31.255.255",
    "192.0.0.1", "192.0.2.44",
    "192.168.0.1", "192.168.255.255",
    "198.18.0.1", "198.19.255.255",
    "198.51.100.7", "203.0.113.9",
    "224.0.0.251", "239.255.255.255",
    "240.0.0.1", "255.255.255.255",
  ];
  for (const ip of privates) {
    it(`blocks ${ip}`, () => expect(isPrivateIp(ip)).toBe(true));
  }

  const publics = [
    "1.1.1.1", "8.8.8.8", "93.184.216.34", "104.16.0.1",
    "172.15.255.255", "172.32.0.1", // just outside 172.16/12
    "9.255.255.255", "11.0.0.1",    // just outside 10/8
    "100.63.255.255", "100.128.0.1", // just outside CGNAT
    "126.255.255.255", "128.0.0.1",  // just outside loopback
    "169.253.255.255", "169.255.0.1", // just outside link-local
    "192.167.255.255", "192.169.0.1", // just outside 192.168/16
    "223.255.255.255",
  ];
  for (const ip of publics) {
    it(`allows ${ip}`, () => expect(isPrivateIp(ip)).toBe(false));
  }
});

describe("isPrivateIp — IPv6", () => {
  const privates = [
    "::1", "::",
    "fd00::1", "fc00::1", "fdff:ffff::1",
    "fe80::1", "febf::1",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1",
  ];
  for (const ip of privates) {
    it(`blocks ${ip}`, () => expect(isPrivateIp(ip)).toBe(true));
  }

  const publics = ["2606:4700:4700::1111", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8"];
  for (const ip of publics) {
    it(`allows ${ip}`, () => expect(isPrivateIp(ip)).toBe(false));
  }
});

describe("isBlockedHostname", () => {
  const blocked = [
    "localhost", "LOCALHOST", "foo.localhost",
    "printer.local", "db.internal", "intranet.corp",
    "nas.lan", "router.home", "wiki.intranet",
  ];
  for (const h of blocked) {
    it(`blocks ${h}`, () => expect(isBlockedHostname(h)).toBe(true));
  }
  const allowed = ["example.com", "localhost.example.com", "internal-tools.example.com", "mylocal.dev"];
  for (const h of allowed) {
    it(`allows ${h}`, () => expect(isBlockedHostname(h)).toBe(false));
  }
});

describe("assertPublicUrl", () => {
  it("allows a public https URL", async () => {
    const res = await assertPublicUrl("https://example.com/page", publicResolver);
    expect(res.addresses).toEqual(["93.184.216.34"]);
  });

  it("rejects non-http(s) schemes", async () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com", "gopher://x", "javascript:alert(1)"]) {
      await expect(assertPublicUrl(u, publicResolver)).rejects.toThrow(SsrfBlockedError);
    }
  });

  it("rejects invalid URLs", async () => {
    await expect(assertPublicUrl("not a url", publicResolver)).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects credentials in the URL", async () => {
    await expect(assertPublicUrl("https://user:pass@example.com", publicResolver)).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects localhost and internal hostnames without resolving", async () => {
    for (const u of ["http://localhost:3000", "http://db.internal/admin", "http://printer.local"]) {
      await expect(assertPublicUrl(u, failingResolver)).rejects.toThrow(SsrfBlockedError);
    }
  });

  it("rejects private IPv4 literals", async () => {
    for (const u of [
      "http://127.0.0.1/", "http://127.0.0.1:8080/", "http://10.0.0.1/",
      "http://169.254.169.254/latest/meta-data/", "http://192.168.1.1/",
      "http://172.16.0.1/", "http://0.0.0.0/",
    ]) {
      await expect(assertPublicUrl(u, publicResolver)).rejects.toThrow(SsrfBlockedError);
    }
  });

  it("rejects private IPv6 literals", async () => {
    for (const u of ["http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:10.0.0.1]/"]) {
      await expect(assertPublicUrl(u, publicResolver)).rejects.toThrow(SsrfBlockedError);
    }
  });

  it("rejects hostnames that resolve to private addresses (internal DNS)", async () => {
    await expect(assertPublicUrl("https://internal-dashboard.example.com", privateResolver)).rejects.toThrow(
      /blocked address/,
    );
  });

  it("rejects hostnames where ANY resolved address is private (rebinding via multi-A)", async () => {
    await expect(assertPublicUrl("https://evil.example.com", mixedResolver)).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects when DNS fails", async () => {
    await expect(assertPublicUrl("https://nope.example.com", failingResolver)).rejects.toThrow(
      /DNS resolution failed/,
    );
  });
});

describe("createHostGate (redirect/sub-request interception)", () => {
  it("blocks redirect targets into private space, allows public hosts", async () => {
    const resolver: Resolver = async (host) =>
      host === "public.example.com" ? ["93.184.216.34"] : ["10.0.0.5"];
    const gate = createHostGate(resolver);
    expect(await gate("https://public.example.com/start")).toBe(true);
    expect(await gate("https://internal.example.com/admin")).toBe(false);
    expect(await gate("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(await gate("http://localhost:9000/")).toBe(false);
    expect(await gate("file:///etc/passwd")).toBe(false);
  });

  it("caches per-host verdicts within one audit", async () => {
    let calls = 0;
    const resolver: Resolver = async () => {
      calls++;
      return ["93.184.216.34"];
    };
    const gate = createHostGate(resolver);
    await gate("https://a.example.com/1");
    await gate("https://a.example.com/2");
    await gate("https://a.example.com/3");
    expect(calls).toBe(1);
  });
});
