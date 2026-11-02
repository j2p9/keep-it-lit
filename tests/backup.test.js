import { describe, expect, it, vi } from 'vitest';

// The crypto helpers don't touch the network; keep the Supabase client out of the test.
vi.mock('../src/lib/supabase.js', () => ({ supabase: null, cloudConfigured: false }));

const { decryptJSON, deriveKey, encryptJSON, fromBase64, toBase64 } = await import('../src/lib/backup.js');

describe('Encrypted backup', () => {
  const salt = new Uint8Array(16).fill(7);
  const data = { app: 'keep-it-lit', goals: [{ id: 'g1', title: 'Read 📚' }], checkins: Array.from({ length: 500 }, (_, i) => ({ i })) };

  it('round-trips through base64', () => {
    // Longer than one 32 KB chunk, with every byte value.
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('decrypts with the same passphrase', async () => {
    const key = await deriveKey('correct horse battery', salt, 1000);
    const box = await encryptJSON(data, key);
    expect(box.ciphertext).not.toContain('Read');
    expect(box.bytes).toBeLessThan(JSON.stringify(data).length); // compressed before encrypting
    const again = await deriveKey('correct horse battery', salt, 1000);
    expect(await decryptJSON(box, again)).toEqual(data);
  });

  it('fails cleanly with the wrong passphrase', async () => {
    const box = await encryptJSON(data, await deriveKey('correct horse battery', salt, 1000));
    const wrong = await deriveKey('wrong horse battery', salt, 1000);
    await expect(decryptJSON(box, wrong)).rejects.toThrow(/passphrase/);
  });

  it('uses a fresh IV every time', async () => {
    const key = await deriveKey('pass phrase', salt, 1000);
    const a = await encryptJSON(data, key);
    const b = await encryptJSON(data, key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
