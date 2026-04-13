import { URL } from 'url';
import net from 'net';

const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'data:', 'javascript:', 'vbscript:'];

const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
];

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const ipLong = ipToLong(ip);
  return PRIVATE_RANGES.some(
    (range) => ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end)
  );
}

export interface UrlValidationResult {
  valid: boolean;
  url?: string;
  error?: string;
}

export function validateUrl(input: string): UrlValidationResult {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  if (input.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum length of 2048 characters' };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, error: `Protocol "${parsed.protocol}" is not allowed` };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
  }

  const hostname = parsed.hostname;

  if (hostname === 'localhost' || hostname === '') {
    return { valid: false, error: 'Localhost URLs are not allowed' };
  }

  if (net.isIPv4(hostname) && isPrivateIp(hostname)) {
    return { valid: false, error: 'Private/internal IP addresses are not allowed' };
  }

  // Block IPv6 loopback and link-local
  if (hostname === '::1' || hostname.startsWith('fe80')) {
    return { valid: false, error: 'Private/internal IP addresses are not allowed' };
  }

  return { valid: true, url: parsed.href };
}
