import { hashPassword, verifyPassword } from '../password';

describe('password', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).not.toBe('test-password-123');
    expect(hash.startsWith('$2b$')).toBe(true);

    const valid = await verifyPassword('test-password-123', hash);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('wrong-password', hash);
    expect(invalid).toBe(false);
  });
});
