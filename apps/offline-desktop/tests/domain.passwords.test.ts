import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/domain/passwords';

describe('hashPassword / verifyPassword', () => {
  it('round-trips: a hashed password verifies against the same plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('never stores the plaintext password anywhere in the encoded hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 8 characters/);
  });

  it('two hashes of the same password are different (random salt) but both verify', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password-123', a)).toBe(true);
    expect(await verifyPassword('same-password-123', b)).toBe(true);
  });

  it('verifyPassword returns false (never throws) on a malformed/foreign hash', async () => {
    await expect(verifyPassword('anything', 'not-a-real-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$10$somesalt$somehash')).resolves.toBe(false);
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
  });
});
