export const PROXY_PROTOCOLS = ["http", "https", "socks5", "socks5h", "socks4", "socks4a"] as const;
export type ProxyProtocol = (typeof PROXY_PROTOCOLS)[number];

export type ProxyFields = {
  protocol: ProxyProtocol;
  host: string;
  port: string;
  username: string;
  password: string;
};

export const EMPTY_PROXY_FIELDS: ProxyFields = {
  protocol: "socks5h",
  host: "",
  port: "1080",
  username: "",
  password: "",
};

export type ProxyAddressError =
  | "emptyAddress"
  | "invalidAddress"
  | "unsupportedProtocol"
  | "invalidHost"
  | "invalidPort"
  | "invalidCredentials"
  | "socks4Auth"
  | "socks5Auth";

export type ProxyAddressResult =
  | { ok: true; url: string; fields: ProxyFields }
  | { ok: false; error: ProxyAddressError };

export function defaultProxyPort(protocol: ProxyProtocol): string {
  return protocol === "http" ? "80" : protocol === "https" ? "443" : "1080";
}

export function isSocks4(protocol: ProxyProtocol): boolean {
  return protocol === "socks4" || protocol === "socks4a";
}

export function buildProxyAddress(fields: ProxyFields): ProxyAddressResult {
  const { protocol, username, password } = fields;
  let host = fields.host.trim();
  if (!host) return { ok: false, error: "emptyAddress" };
  if (!PROXY_PROTOCOLS.includes(protocol)) return { ok: false, error: "unsupportedProtocol" };
  if (/[\s/@?#\\]/u.test(host)) return { ok: false, error: "invalidHost" };
  if (host.includes(":") && !host.startsWith("[")) host = `[${host}]`;
  try {
    // Validate all hosts with the same rules, including IDN and bracketed IPv6.
    const authority = new URL(`http://${host}`);
    if (!authority.hostname || authority.port || authority.username || authority.password)
      return { ok: false, error: "invalidHost" };
    host = authority.hostname;
  } catch {
    return { ok: false, error: "invalidHost" };
  }
  const port = fields.port.trim();
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    return { ok: false, error: "invalidPort" };
  const hasControl = [...username, ...password].some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
  if (hasControl || (password && !username)) return { ok: false, error: "invalidCredentials" };
  if (isSocks4(protocol) && (username || password)) return { ok: false, error: "socks4Auth" };
  if (protocol.startsWith("socks5") && (username || password)) {
    const encoder = new TextEncoder();
    if (
      !username ||
      !password ||
      encoder.encode(username).length > 255 ||
      encoder.encode(password).length > 255
    )
      return { ok: false, error: "socks5Auth" };
  }
  if ((protocol === "http" || protocol === "https") && username.includes(":"))
    return { ok: false, error: "invalidCredentials" };
  try {
    const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
    const normalized = { ...fields, host, port: String(Number(port)) };
    return { ok: true, fields: normalized, url: `${protocol}://${auth}${host}:${normalized.port}` };
  } catch {
    return { ok: false, error: "invalidCredentials" };
  }
}

/** Accept provider URLs, user:password@host:port and host:port:user:password. */
export function parseProxyAddress(
  value: string,
  fallback: ProxyProtocol = "http",
): ProxyAddressResult {
  let input = value.trim();
  if (!input) return { ok: false, error: "emptyAddress" };
  if ([...input].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    return { ok: false, error: "invalidAddress" };
  if (!input.includes("://")) {
    const provider = input.match(/^(\[[^\]]+\]|[^:@/\s]+):(\d+):([^:]+):(.+)$/u);
    if (provider) {
      return buildProxyAddress({
        protocol: fallback,
        host: provider[1],
        port: provider[2],
        username: provider[3],
        password: provider[4],
      });
    }
    input = `${fallback}://${input}`;
  }
  try {
    const parsed = new URL(input);
    const protocol = parsed.protocol.slice(0, -1) as ProxyProtocol;
    if (!PROXY_PROTOCOLS.includes(protocol)) return { ok: false, error: "unsupportedProtocol" };
    if (
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.href.includes("?") ||
      parsed.href.includes("#")
    )
      return { ok: false, error: "invalidAddress" };
    return buildProxyAddress({
      protocol,
      host: parsed.hostname,
      port: parsed.port || defaultProxyPort(protocol),
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    });
  } catch {
    return { ok: false, error: "invalidAddress" };
  }
}

/** Only display validated endpoints; never fall back to a URL containing credentials. */
export function proxyEndpoint(value: string): string {
  const parsed = parseProxyAddress(value);
  return parsed.ok ? `${parsed.fields.host}:${parsed.fields.port}` : "";
}

export function bypassEntries(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;\r\n]/u)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export const LOCAL_BYPASS = ["localhost", "127.0.0.0/8", "::1"];
export const PRIVATE_BYPASS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"];

export function toggleBypassPreset(value: string, preset: string[]): string {
  const entries = bypassEntries(value);
  return (
    preset.every((entry) => entries.includes(entry))
      ? entries.filter((entry) => !preset.includes(entry))
      : [...new Set([...entries, ...preset])]
  ).join(", ");
}
