export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Free-form labels, e.g. { type: 'verify-email' } */
  tags?: Record<string, string>;
}

export interface EmailTransport {
  send: (message: EmailMessage) => Promise<void>;
}
