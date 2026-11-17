import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleTransport, extractLinks, readLastEmail } from './console-transport';
import { MemoryTransport } from './memory-transport';
import { ResendTransport } from './resend-transport';
import type { EmailMessage } from './types';

const message: EmailMessage = {
  html: '<p>Hi</p>',
  subject: 'Hello',
  tags: { type: 'test' },
  text: 'Open https://app.test/verify?token=abc123 to continue',
  to: 'ada@example.com',
};

describe('MemoryTransport', () => {
  it('stores messages and finds the last one per recipient', async () => {
    const transport = new MemoryTransport();
    await transport.send(message);
    await transport.send({ ...message, to: 'bob@example.com' });

    expect(transport.outbox).toHaveLength(2);
    expect(transport.last('ada@example.com')?.to).toBe('ada@example.com');
    transport.clear();
    expect(transport.last()).toBeUndefined();
  });
});

describe('ConsoleTransport', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('stores the email as JSON with extracted links', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'emails-'));
    dirs.push(dir);

    await new ConsoleTransport(dir).send(message);

    expect(readdirSync(dir)).toHaveLength(1);
    const stored = readLastEmail(dir, 'ada@example.com');
    expect(stored?.links).toEqual(['https://app.test/verify?token=abc123']);
    expect(readLastEmail(dir, 'nobody@example.com')).toBeUndefined();
  });

  it('does not throw when the folder cannot be written', async () => {
    // A regular FILE in the middle of the path makes mkdir fail (ENOTDIR) on every OS.
    // Never point recursive mkdirSync at /proc: Node loops forever there on Linux.
    const dir = mkdtempSync(path.join(tmpdir(), 'emails-'));
    dirs.push(dir);
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, '');

    await expect(
      new ConsoleTransport(path.join(blocker, 'sub')).send(message),
    ).resolves.toBeUndefined();
  });
});

describe('extractLinks', () => {
  it('finds unique URLs', () => {
    expect(extractLinks('a https://x.io/a b https://x.io/a c http://y.io')).toEqual([
      'https://x.io/a',
      'http://y.io',
    ]);
  });
});

describe('ResendTransport', () => {
  it('posts the message with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await new ResendTransport('re_key', 'App <a@b.co>', fetchMock).send(message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'App <a@b.co>',
      tags: [{ name: 'type', value: 'test' }],
      to: ['ada@example.com'],
    });
  });

  it('includes sender configuration guidance when Resend rejects an email', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 422 }));
    await expect(new ResendTransport('k', 'f', fetchMock).send(message)).rejects.toMatchObject({
      message: expect.stringContaining('verify the sender domain'),
      name: 'ExternalServiceError',
    });
  });
});
