import { ExternalServiceError } from '@/libs/errors';

import type { EmailMessage, EmailTransport } from './types';

/** Minimal Resend client over fetch — no SDK dependency. */
export class ResendTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, from: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.from = from;
    this.fetchImpl = fetchImpl;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: this.from,
        html: message.html,
        subject: message.subject,
        tags: Object.entries(message.tags ?? {}).map(([name, value]) => ({ name, value })),
        text: message.text,
        to: [message.to],
      }),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      // Details stay server-side; callers only see a generic ExternalServiceError
      throw new ExternalServiceError({ message: `Resend responded with HTTP ${response.status}` });
    }
  }
}
