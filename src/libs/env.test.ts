import { afterEach, describe, expect, it, vi } from 'vitest';

const baseline = () => {
  vi.stubEnv('ALLOW_LOCAL_SERVICES', 'false');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
  vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');
  vi.stubEnv('NODE_ENV', 'production');
};

describe('Env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('requires all VAPID values when PUSH_ENABLED=true', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    baseline();
    vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');
    vi.stubEnv('PUSH_ENABLED', 'true');

    await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
  });

  it('accepts push when every VAPID value is present', async () => {
    baseline();
    vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');
    vi.stubEnv('PUSH_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:ops@example.com');

    const { Env } = await import('./env');

    expect(Env.PUSH_ENABLED).toBe(true);
  });

  it('leaves push disabled by default and the PWA enabled', async () => {
    baseline();
    vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');

    const { Env } = await import('./env');

    expect(Env.PUSH_ENABLED).toBe(false);
    expect(Env.NEXT_PUBLIC_PWA_ENABLED).toBe(true);
  });

  it('loads when all variables are valid', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

    const { Env } = await import('./env');

    expect(Env.NEXT_PUBLIC_APP_URL).toBe('https://example.com');
    expect(Env.NEXT_PUBLIC_APP_NAME).toBe('My App');
  });

  it('throws when NEXT_PUBLIC_APP_URL is not a URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not-a-url');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

    await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
  });

  it('throws when a required variable is empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', '');

    await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
  });

  it('does not supply a default sender address', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');
    vi.stubEnv('EMAIL_FROM', '');

    const { Env } = await import('./env');

    expect(Env.EMAIL_FROM).toBeUndefined();
  });

  describe('production safety', () => {
    it('requires DATABASE_URL in production', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      baseline();
      vi.stubEnv('DATABASE_URL', '');

      await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
    });

    it('rejects the console and memory email transports in production', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      baseline();
      vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
      vi.stubEnv('EMAIL_TRANSPORT', 'console');

      await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
    });

    it('accepts a proper production configuration', async () => {
      baseline();
      vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
      vi.stubEnv('EMAIL_TRANSPORT', 'resend');

      const { Env } = await import('./env');

      expect(Env.NODE_ENV).toBe('production');
    });

    it('lets CI/e2e opt in to local services with ALLOW_LOCAL_SERVICES', async () => {
      baseline();
      vi.stubEnv('DATABASE_URL', '');
      vi.stubEnv('EMAIL_TRANSPORT', 'console');
      vi.stubEnv('ALLOW_LOCAL_SERVICES', 'true');

      const { Env } = await import('./env');

      expect(Env.ALLOW_LOCAL_SERVICES).toBe(true);
    });

    it('defaults the trusted IP header to x-forwarded-for', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
      vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

      const { Env } = await import('./env');

      expect(Env.AUTH_IP_HEADER).toBe('x-forwarded-for');
    });
  });
});
