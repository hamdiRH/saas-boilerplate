import type { EmailMessage, EmailTransport } from './types';

export class MemoryTransport implements EmailTransport {
  readonly outbox: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    return Promise.resolve();
  }

  /** Latest message, optionally filtered by recipient. */
  last(to?: string): EmailMessage | undefined {
    return this.outbox.toReversed().find((m) => (to ? m.to === to : true));
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
