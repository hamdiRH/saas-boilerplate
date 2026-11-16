import { expect, it } from 'vitest';

import { describeUserAgent } from './user-agent';

it.each([
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    'Chrome on Windows',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0',
    'Edge on Windows',
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    'Safari on macOS',
  ],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox on Linux'],
  [null, 'Unknown device'],
])('describes %s', (ua, expected) => {
  expect(describeUserAgent(ua)).toBe(expected);
});
