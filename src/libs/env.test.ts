import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('loads when all variables are valid', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

    const { Env } = await import('./env');

    expect(Env.NEXT_PUBLIC_APP_URL).toBe('https://example.com');
    expect(Env.NEXT_PUBLIC_APP_NAME).toBe('My App');
  });

  it('throws when NEXT_PUBLIC_APP_URL is not a URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not-a-url');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

    await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
  });

  it('throws when a required variable is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', '');

    await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
  });
});
