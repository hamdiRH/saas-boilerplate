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
      let hint: string | undefined;
      if (response.status === 401) {
        hint = 'Check RESEND_API_KEY.';
      } else if (response.status === 403 || response.status === 422) {
        hint = 'Check EMAIL_FROM and verify the sender domain in Resend.';
      }

      const errorMessage = `Resend responded with HTTP ${response.status}.${hint ? ` ${hint}` : ''}`;
      throw new ExternalServiceError({ message: errorMessage });
    }
  }
}
