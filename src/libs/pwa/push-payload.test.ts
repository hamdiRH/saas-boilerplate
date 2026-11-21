import { describe, expect, it } from 'vitest';

import {
  MAX_PUSH_PAYLOAD_BYTES,
  parsePushPayload,
  safeNotificationUrl,
  serializePushPayload,
} from './push-payload';

const ORIGIN = 'https://app.example.com';

describe('safeNotificationUrl', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/dashboard?tab=1#x', '/dashboard?tab=1#x'],
    ['https://app.example.com/fr/dashboard', '/fr/dashboard'],
  ])('keeps same-origin %s', (input, expected) => {
    expect(safeNotificationUrl(input, ORIGIN)).toBe(expected);
  });

  it.each([
    'https://evil.example.com/phish',
    '//evil.example.com',
    ['java', 'script:alert(1)'].join(''),
    'data:text/html,<script>1</script>',
    '',
    undefined,
    null,
    42,
    {},
  ])('falls back to "/" for %o', (input) => {
    expect(safeNotificationUrl(input, ORIGIN)).toBe('/');
  });
});

describe('parsePushPayload', () => {
  it('parses a valid payload and sanitizes the url', () => {
    expect(
      parsePushPayload({ body: 'Hi', title: 'Hello', url: 'https://evil.test/x' }, ORIGIN),
    ).toEqual({ body: 'Hi', title: 'Hello', url: '/' });
  });

  it('keeps a bounded tag', () => {
    const parsed = parsePushPayload({ tag: 'a'.repeat(200), title: 'T' }, ORIGIN);
    expect(parsed?.tag).toHaveLength(64);
  });

  it.each([null, undefined, 'text', 1, [], {}, { title: '' }, { title: '   ' }, { title: 5 }])(
    'rejects %o',
    (input) => {
      expect(parsePushPayload(input, ORIGIN)).toBeNull();
    },
  );
});

describe('serializePushPayload', () => {
  it('serializes small payloads', () => {
    expect(JSON.parse(serializePushPayload({ body: 'b', title: 't', url: '/' }))).toEqual({
      body: 'b',
      title: 't',
      url: '/',
    });
  });

  it('refuses oversized payloads', () => {
    const body = 'x'.repeat(MAX_PUSH_PAYLOAD_BYTES);
    expect(() => serializePushPayload({ body, title: 't', url: '/' })).toThrow(RangeError);
  });
});
