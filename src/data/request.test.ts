import { describe, expect, it, vi } from 'vitest';

import { currentRequest } from './request';

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers({ 'x-test': 'value' })),
}));

vi.mock('@/libs/env', () => ({
  Env: { NEXT_PUBLIC_APP_URL: 'https://example.com' },
}));

describe('currentRequest', () => {
  it('returns a Request with the app URL and forwarded headers', async () => {
    const request = await currentRequest();

    expect(request.url).toBe('https://example.com/');
    expect(request.headers.get('x-test')).toBe('value');
  });
});
