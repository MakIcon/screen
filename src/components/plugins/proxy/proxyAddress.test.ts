import { describe, expect, it } from "vitest";
import {
  PROXY_PROTOCOLS,
  EMPTY_PROXY_FIELDS,
  LOCAL_BYPASS,
  PRIVATE_BYPASS,
  buildProxyAddress,
  parseProxyAddress,
  proxyEndpoint,
  bypassEntries,
  toggleBypassPreset,
} from "./proxyAddress";
import { normalizeProxySettings } from "../pluginSettings";

describe("proxy addresses", () => {
  it.each(PROXY_PROTOCOLS)("accepts %s with IPv4 and IPv6", (protocol) => {
    for (const host of ["127.0.0.1", "proxy.example.com", "[2001:db8::1]"]) {
      const result = parseProxyAddress(`${protocol}://${host}:8080`);
      expect(result).toMatchObject({ ok: true, url: `${protocol}://${host}:8080` });
    }
  });

  it("round-trips reserved characters and Unicode in credentials", () => {
    const fields = {
      ...EMPTY_PROXY_FIELDS,
      host: "proxy.example.com",
      username: "user@home",
      password: "пароль:p@ss/#%? +",
    };
    const result = buildProxyAddress(fields);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid proxy");
    expect(result.url).toContain("user%40home:");
    expect(result.url).not.toContain(fields.password);
    expect(parseProxyAddress(result.url)).toEqual(result);
  });

  it("imports provider strings and retains colons in the password", () => {
    expect(parseProxyAddress("proxy.example.com:3128:user:p:a:ss", "http")).toMatchObject({
      ok: true,
      fields: { username: "user", password: "p:a:ss", protocol: "http" },
    });
    expect(parseProxyAddress("[::1]:1080:user:pass", "socks5h")).toMatchObject({
      ok: true,
      fields: { host: "[::1]", username: "user" },
    });
    expect(parseProxyAddress("user:pass@proxy.example.com:443", "https")).toMatchObject({
      ok: true,
      url: "https://user:pass@proxy.example.com:443",
    });
  });

  it("preserves legacy bare HTTP addresses and fills standard ports", () => {
    expect(parseProxyAddress("127.0.0.1:8080")).toMatchObject({
      ok: true,
      url: "http://127.0.0.1:8080",
    });
    expect(parseProxyAddress("https://proxy.example.com/")).toMatchObject({
      ok: true,
      url: "https://proxy.example.com:443",
    });
    expect(parseProxyAddress("socks5h://[::1]")).toMatchObject({
      ok: true,
      url: "socks5h://[::1]:1080",
    });
    expect(buildProxyAddress({ ...EMPTY_PROXY_FIELDS, host: "2001:db8::1" })).toMatchObject({
      ok: true,
      fields: { host: "[2001:db8::1]" },
    });
  });

  it.each([
    "ftp://host:80",
    "vless://user@host:443",
    "http://host:8080/path",
    "http://host:8080?x=1",
    "http://host:8080?",
    "http://host:8080#",
    "http://us\ter:pass@host:80",
    "http://host#part",
    "http://host:0",
    "http://host:65536",
    "socks5://us%ZZ:pass@host:1080",
    "http://user:p%00ss@host:80",
  ])("rejects invalid or unsupported input %s", (value) => {
    expect(parseProxyAddress(value).ok).toBe(false);
  });

  it("rejects unsupported SOCKS4 credentials and incomplete SOCKS5 authentication", () => {
    expect(parseProxyAddress("socks4://user:pass@host:1080")).toEqual({
      ok: false,
      error: "socks4Auth",
    });
    expect(parseProxyAddress("socks5h://user@host:1080")).toEqual({
      ok: false,
      error: "socks5Auth",
    });
    expect(
      buildProxyAddress({
        ...EMPTY_PROXY_FIELDS,
        host: "host",
        username: "я".repeat(128),
        password: "pass",
      }),
    ).toEqual({ ok: false, error: "socks5Auth" });
  });

  it("does not display credentials, even when a saved URL is invalid", () => {
    expect(proxyEndpoint("http://user:secret@host:80")).toBe("host:80");
    expect(proxyEndpoint("vless://user:secret@host:80")).toBe("");
    expect(proxyEndpoint("http://user:secret@host:80/path")).toBe("");
  });

  it.each(["host:8080", "host/path", "user@host", "host name", "host?x=1"])(
    "rejects a host field containing extra URL parts: %s",
    (host) => {
      expect(buildProxyAddress({ ...EMPTY_PROXY_FIELDS, host }).ok).toBe(false);
    },
  );
});

describe("proxy exceptions and profiles", () => {
  it("normalizes mixed separators and toggles presets without losing custom entries", () => {
    const initial = ".example.com; localhost\nlocalhost, ";
    expect(bypassEntries(initial)).toEqual([".example.com", "localhost"]);
    const local = toggleBypassPreset(initial, LOCAL_BYPASS);
    expect(bypassEntries(local)).toEqual([".example.com", ...LOCAL_BYPASS]);
    const both = toggleBypassPreset(local, PRIVATE_BYPASS);
    expect(bypassEntries(toggleBypassPreset(both, LOCAL_BYPASS))).toEqual([
      ".example.com",
      ...PRIVATE_BYPASS,
    ]);
  });

  it("migrates old settings and removes malformed or duplicate profiles", () => {
    expect(
      normalizeProxySettings({ enabled: true, url: "http://host:80", bypass: "localhost" }),
    ).toEqual({ enabled: true, url: "http://host:80", bypass: "localhost", profiles: [] });
    expect(
      normalizeProxySettings({
        profiles: [
          null,
          {},
          { id: "1", name: " Home ", url: "http://host:80" },
          { id: "1", name: "Duplicate", url: "http://host:80" },
          { id: "2", name: "", url: "http://host:80" },
        ],
      }).profiles,
    ).toEqual([{ id: "1", name: "Home", url: "http://host:80", bypass: "" }]);
  });
});
