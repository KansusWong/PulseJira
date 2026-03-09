import { validateExternalUrl, filterSafeUrls } from '../url-validator';

describe('validateExternalUrl', () => {
  // --- Should PASS ---
  it('allows normal HTTPS URLs', () => {
    expect(validateExternalUrl('https://example.com/page')).toEqual({ valid: true });
  });

  it('allows normal HTTP URLs', () => {
    expect(validateExternalUrl('http://example.com')).toEqual({ valid: true });
  });

  it('allows public IP addresses', () => {
    expect(validateExternalUrl('http://8.8.8.8/dns')).toEqual({ valid: true });
  });

  // --- Should BLOCK: private IPs ---
  it('blocks localhost', () => {
    const result = validateExternalUrl('http://localhost:8080/admin');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('localhost');
  });

  it('blocks 127.0.0.1 (loopback)', () => {
    expect(validateExternalUrl('http://127.0.0.1:3000').valid).toBe(false);
  });

  it('blocks 10.x.x.x (private)', () => {
    expect(validateExternalUrl('http://10.0.0.1/internal').valid).toBe(false);
  });

  it('blocks 172.16-31.x.x (private)', () => {
    expect(validateExternalUrl('http://172.16.0.1').valid).toBe(false);
    expect(validateExternalUrl('http://172.31.255.255').valid).toBe(false);
    // 172.15.x.x is NOT private
    expect(validateExternalUrl('http://172.15.0.1').valid).toBe(true);
  });

  it('blocks 192.168.x.x (private)', () => {
    expect(validateExternalUrl('http://192.168.1.1').valid).toBe(false);
  });

  // --- Should BLOCK: cloud metadata endpoints ---
  it('blocks AWS/Azure metadata (169.254.169.254)', () => {
    expect(validateExternalUrl('http://169.254.169.254/latest/meta-data/').valid).toBe(false);
  });

  it('blocks GCP metadata endpoint', () => {
    expect(validateExternalUrl('http://metadata.google.internal/computeMetadata/v1/').valid).toBe(false);
  });

  // --- Should BLOCK: non-HTTP protocols ---
  it('blocks file:// protocol', () => {
    const result = validateExternalUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('protocol');
  });

  it('blocks ftp:// protocol', () => {
    expect(validateExternalUrl('ftp://ftp.example.com').valid).toBe(false);
  });

  // --- Should BLOCK: credentials in URL ---
  it('blocks URLs with embedded credentials', () => {
    expect(validateExternalUrl('http://admin:password@example.com').valid).toBe(false);
  });

  // --- Should BLOCK: invalid URLs ---
  it('blocks malformed URLs', () => {
    expect(validateExternalUrl('not-a-url').valid).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    expect(validateExternalUrl('http://0.0.0.0').valid).toBe(false);
  });
});

describe('filterSafeUrls', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns only safe URLs', () => {
    const urls = [
      'https://example.com',
      'http://localhost:8080',
      'https://news.ycombinator.com',
      'http://169.254.169.254/meta',
    ];
    const safe = filterSafeUrls(urls);
    expect(safe).toEqual(['https://example.com', 'https://news.ycombinator.com']);
  });

  it('returns empty array when all URLs are blocked', () => {
    expect(filterSafeUrls(['http://127.0.0.1', 'http://10.0.0.1'])).toEqual([]);
  });

  it('logs blocked URLs', () => {
    filterSafeUrls(['http://localhost']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[ssrf]'));
  });
});
