import { Env } from '@/libs/env';
import { AppError, ExternalServiceError } from '@/libs/errors';
import { getLogger } from '@/libs/logger';

import { ConsoleTransport } from './console-transport';
import { MemoryTransport } from './memory-transport';
import { ResendTransport } from './resend-transport';
import type { EmailMessage, EmailTransport } from './types';

let transport: EmailTransport | undefined;

function selectTransport(): EmailTransport {
  let kind = Env.EMAIL_TRANSPORT;
  if (kind === undefined) {
    if (Env.RESEND_API_KEY) {
      kind = 'resend';
    } else if (Env.NODE_ENV !== 'production') {
      kind = 'console';
    }
  }

  switch (kind) {
    case 'resend': {
      if (!Env.RESEND_API_KEY) {
        throw new ExternalServiceError({
          message: 'EMAIL_TRANSPORT=resend but RESEND_API_KEY is missing',
        });
      }
      if (!Env.EMAIL_FROM) {
        throw new ExternalServiceError({
          message:
            'EMAIL_TRANSPORT=resend requires EMAIL_FROM to use a sender address on a verified Resend domain',
        });
      }
      return new ResendTransport(Env.RESEND_API_KEY, Env.EMAIL_FROM);
    }
    case 'console': {
      return new ConsoleTransport('.emails');
    }
    case 'memory': {
      return new MemoryTransport();
    }
    default: {
      throw new ExternalServiceError({
        message:
          'No email transport configured. Set RESEND_API_KEY (or EMAIL_TRANSPORT) in production.',
      });
    }
  }
}

export function getEmailTransport(): EmailTransport {
  transport ??= selectTransport();
  return transport;
}

/** Tests inject a MemoryTransport; pass `undefined` to reset. */
export function setEmailTransport(next: EmailTransport | undefined): void {
  transport = next;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await getEmailTransport().send(message);
  } catch (error) {
    // Never log the recipient or body (PII / secrets in links)
    const reason = error instanceof Error ? error.message : 'Unknown email provider error';
    getLogger('email').error('Failed to send email: {reason}', { reason, tags: message.tags });
    throw error instanceof AppError ? error : new ExternalServiceError({ cause: error });
  }
}
