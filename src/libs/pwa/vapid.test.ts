import { describe, expect, it } from 'vitest';

import { urlBase64ToUint8Array } from './vapid';

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "hello" → aGVsbG8 (base64url, unpadded)
    expect([...urlBase64ToUint8Array('aGVsbG8')]).toEqual([104, 101, 108, 108, 111]);
  });

  it('handles the url-safe alphabet (- and _)', () => {
    // bytes 251, 255, 190 → "-_--" in base64url ("+/+-" would be standard base64 "+/++")
    expect([...urlBase64ToUint8Array('-_--')]).toEqual([251, 255, 190]);
  });

  it('decodes a 65-byte uncompressed P-256 public key to 65 bytes', () => {
    const key = Buffer.alloc(65, 7).toString('base64url');
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});
