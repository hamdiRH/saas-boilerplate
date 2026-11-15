import { afterEach, describe, expect, it, vi } from 'vitest';

import { getEmailTransport, setEmailTransport } from './index';
import { ResendTransport } from './resend-transport';

const env = vi.hoisted(() => ({
  EMAIL_FROM: undefined as string | undefined,
  EMAIL_TRANSPORT: undefined as 'console' | 'memory' | 'resend' | undefined,
  LOG_LEVEL: 'error' as const,
  NODE_ENV: 'test' as const,
  RESEND_API_KEY: undefined as string | undefined,
}));

vi.mock('@/libs/env', () => ({ Env: env }));

describe('getEmailTransport', () => {
  afterEach(() => {
    setEmailTransport(undefined);
    env.EMAIL_FROM = undefined;
    env.EMAIL_TRANSPORT = undefined;
    env.RESEND_API_KEY = undefined;
  });

  it('requires an explicit sender for the Resend transport', () => {
    env.EMAIL_TRANSPORT = 'resend';
    env.RESEND_API_KEY = 'test-key';

    expect(() => getEmailTransport()).toThrow(
      'EMAIL_TRANSPORT=resend requires EMAIL_FROM to use a sender address on a verified Resend domain',
    );
  });

  it('automatically selects Resend when a key is configured', () => {
    env.RESEND_API_KEY = 'test-key';
    env.EMAIL_FROM = 'Example <sender@example.com>';

    expect(getEmailTransport()).toBeInstanceOf(ResendTransport);
  });
});
