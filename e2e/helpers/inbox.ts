import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect } from '@playwright/test';

const DIRS = [path.resolve('.emails'), path.resolve('.next/standalone/.emails')];

export interface CapturedEmail {
  to: string;
  subject: string;
  text: string;
  links: string[];
  createdAt: number;
}

function find(to: string, since: number): CapturedEmail | undefined {
  for (const dir of DIRS) {
    if (!existsSync(dir)) {
      continue;
    }

    for (const file of readdirSync(dir).toSorted().toReversed()) {
      try {
        const email = JSON.parse(readFileSync(path.join(dir, file), 'utf-8')) as CapturedEmail;
        if (email.to === to && email.createdAt >= since) {
          return email;
        }
      } catch {
        // file still being written — try again on the next poll
      }
    }
  }
  return undefined;
}

export function firstLink(email: CapturedEmail): string {
  const [link] = email.links;
  if (!link) {
    throw new Error('Email has no link');
  }
  return link;
}

/** Waits for an email to `to` created at/after `since` (ms epoch). */
export async function waitForEmail(
  to: string,
  { since, timeout = 15_000 }: { since: number; timeout?: number },
): Promise<CapturedEmail> {
  let email: CapturedEmail | undefined;
  await expect
    .poll(
      () => {
        email = find(to, since);
        return email;
      },
      { timeout },
    )
    .toBeDefined();
  if (!email) {
    throw new Error(`No email for ${to} within ${timeout} ms (is EMAIL_TRANSPORT=console?)`);
  }
  return email;
}
