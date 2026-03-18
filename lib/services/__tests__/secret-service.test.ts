jest.mock('server-only', () => {});
jest.mock('@/lib/db/client', () => ({
  supabase: {},
  supabaseConfigured: true,
}));

import { encrypt, decrypt } from '../secret-service';

describe('secret-service', () => {
  const testKey = 'a'.repeat(64); // 32 bytes hex = 256-bit key

  beforeAll(() => {
    process.env.PLATFORM_ENCRYPTION_KEY = testKey;
  });

  it('encrypts and decrypts a string', () => {
    const plaintext = 'sk-test-api-key-12345';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).not.toContain('sk-test');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const a = encrypt('same-input');
    const b = encrypt('same-input');
    expect(a).not.toBe(b);
  });
});
