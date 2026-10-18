import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {}

function v4ToInt(ip: string) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const inV4 = (ip: string, cidr: string) => {
  const [base, bits] = cidr.split('/');
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
};

/** 'metadata' is always blocked; 'private' is blocked only when private networks are disallowed. */
export function classifyIp(ip: string): 'public' | 'private' | 'metadata' {
  let v4 = isIP(ip) === 4 ? ip : undefined;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) v4 = mapped[1];
  if (v4) {
    if (inV4(v4, '169.254.0.0/16') || inV4(v4, '100.100.100.200/32')) return 'metadata';
    if (['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '0.0.0.0/8', '100.64.0.0/10'].some((c) => inV4(v4!, c))) return 'private';
    return 'public';
  }
  if (lower.startsWith('fe80:') || lower === 'fd00:ec2::254') return 'metadata';
  if (lower === '::1' || lower === '::' || /^f[cd][0-9a-f]{2}:/.test(lower)) return 'private';
  return 'public';
}

/**
 * Validates an LLM base URL. Resolves DNS so a public-looking name pointing at an internal address is caught.
 * ponytail: checks at configure + call time; DNS-rebinding between check and connect is not pinned. Pin the
 * resolved IP in a custom agent if this runs as a multi-tenant hosted service.
 */
export async function checkBaseUrl(raw: string, allowPrivate: boolean): Promise<{ url: URL; isLocal: boolean }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Base URL is not a valid URL (example: http://localhost:11434/v1)');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UnsafeUrlError('Base URL must use http or https');
  if (url.username || url.password) throw new UnsafeUrlError('Do not put credentials in the base URL; use the API key field');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addrs: string[];
  try {
    addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new UnsafeUrlError(`Cannot resolve host "${host}"`);
  }
  const classes = addrs.map(classifyIp);
  if (classes.includes('metadata')) throw new UnsafeUrlError('Cloud metadata / link-local addresses are not allowed');
  const isLocal = classes.includes('private');
  if (isLocal && !allowPrivate) throw new UnsafeUrlError('Private and loopback addresses are disabled on this server (LLM_ALLOW_PRIVATE_NETWORK=false)');
  return { url, isLocal };
}
