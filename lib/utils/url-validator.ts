/**
 * URL validation utilities for SSRF protection (#5).
 * Blocks requests to private/internal networks, metadata endpoints,
 * and non-HTTP protocols.
 */

/** IP ranges that must never be accessed from server-side fetches. */
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,           // 127.0.0.0/8 loopback
  /^10\.\d+\.\d+\.\d+$/,            // 10.0.0.0/8 private
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12 private
  /^192\.168\.\d+\.\d+$/,           // 192.168.0.0/16 private
  /^169\.254\.\d+\.\d+$/,           // link-local (AWS/Azure/GCP metadata)
  /^0\.0\.0\.0$/,                    // unspecified
  /^\[::1?\]$/,                      // IPv6 loopback
  /^metadata\.google\.internal$/i,   // GCP metadata
  /^kubernetes\.default/i,           // Kubernetes API
];

/** Specific hostnames always blocked. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'kubernetes.default.svc',
]);

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a URL for safe external fetching.
 * Returns `{ valid: true }` if the URL is safe to fetch,
 * or `{ valid: false, reason }` with the rejection reason.
 */
export function validateExternalUrl(url: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check exact hostname blocklist
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Check regex patterns (private IPs, link-local, loopback)
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: `Blocked address: ${hostname}` };
    }
  }

  // Block URLs with credentials (user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URLs with embedded credentials are not allowed' };
  }

  return { valid: true };
}

/**
 * Filter an array of URLs, returning only those safe to fetch.
 * Logs blocked URLs for auditing.
 */
export function filterSafeUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    const result = validateExternalUrl(url);
    if (!result.valid) {
      console.warn(`[ssrf] Blocked URL: ${url} — ${result.reason}`);
    }
    return result.valid;
  });
}
