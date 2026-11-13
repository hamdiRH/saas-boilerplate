import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getLogger } from '@/libs/logger';

import type { EmailMessage, EmailTransport } from './types';

export type CapturedEmail = EmailMessage & { links: string[]; createdAt: number };

export function extractLinks(text: string): string[] {
  return [...new Set([...text.matchAll(/https?:\/\/[^\s"'<>)]+/gu)].map(([link]) => link))];
}

const fileSafe = (value: string) => value.replaceAll(/[^a-z0-9]+/giu, '_');

/** Prints the message (with clickable links) and stores it as JSON in `dir`. */
export class ConsoleTransport implements EmailTransport {
  readonly dir: string;

  constructor(dir = '.emails') {
    this.dir = dir;
  }

  send(message: EmailMessage): Promise<void> {
    const links = extractLinks(message.text);
    const captured: CapturedEmail = { ...message, createdAt: Date.now(), links };

    getLogger('email').info('📧 "{subject}" → {to}\n{links}', {
      links: links.join('\n'),
      subject: message.subject,
      to: message.to,
    });

    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(
        path.join(this.dir, `${captured.createdAt}-${fileSafe(message.to)}.json`),
        JSON.stringify(captured, null, 2),
      );
    } catch (error) {
      // Read-only filesystems (serverless) must not break sign-up
      getLogger('email').warning('Could not store email on disk', { error });
    }

    return Promise.resolve();
  }
}

/** Newest captured email for a recipient (used by tests). */
export function readLastEmail(dir: string, to: string): CapturedEmail | undefined {
  const files = readdirSync(dir).toSorted().toReversed();
  for (const file of files) {
    const email = JSON.parse(readFileSync(path.join(dir, file), 'utf-8')) as CapturedEmail;
    if (email.to === to) {
      return email;
    }
  }
  return undefined;
}
