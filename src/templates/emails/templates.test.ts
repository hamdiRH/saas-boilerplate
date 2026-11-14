import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderEmail } from './render';
import { PasswordChangedEmail, ResetPasswordEmail, VerifyEmail } from './templates';

const url = 'https://app.test/api/auth/verify-email?token=tok_123';

describe('email templates', () => {
  it('renders HTML + plain text with the action link (en)', async () => {
    const { html, text } = await renderEmail(
      createElement(VerifyEmail, { locale: 'en', name: 'Ada', url }),
    );

    expect(html).toContain(url.replaceAll('&', '&amp;'));
    expect(html).toContain('lang="en"');
    expect(text).toContain('Hi Ada,');
    expect(text).toContain(url);
    expect(text).toMatchSnapshot();
  });

  it('renders French copy', async () => {
    const { text } = await renderEmail(
      createElement(ResetPasswordEmail, { locale: 'fr', name: 'Ada', url }),
    );
    expect(text).toContain('Bonjour Ada,');
    expect(text).toContain("Si vous n'êtes pas à l'origine");
  });

  it('informational emails have no button', async () => {
    const { text } = await renderEmail(
      createElement(PasswordChangedEmail, { locale: 'en', name: 'Ada' }),
    );
    expect(text).not.toMatch(/https?:\/\//u);
  });
});
