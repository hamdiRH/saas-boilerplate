import { localeFromRequest } from '@/i18n/request-locale';
import { sendEmail } from '@/libs/email';
import { getEmailTranslator } from '@/templates/emails/i18n';
import { renderEmail } from '@/templates/emails/render';
import {
  ChangeEmailEmail,
  MagicLinkEmail,
  OtpEmail,
  PasswordChangedEmail,
  ResetPasswordEmail,
  VerifyEmail,
} from '@/templates/emails/templates';

interface Recipient {
  email: string;
  name: string;
}
interface Input {
  user: Recipient;
  request?: Request;
}

export async function sendVerificationEmail({ user, url, request }: Input & { url: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <VerifyEmail locale={locale} name={user.name} url={url} />,
  );
  await sendEmail({
    html,
    subject: getEmailTranslator(locale)('verify.subject'),
    tags: { type: 'verify-email' },
    text,
    to: user.email,
  });
}

export async function sendResetPasswordEmail({ user, url, request }: Input & { url: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <ResetPasswordEmail locale={locale} name={user.name} url={url} />,
  );
  await sendEmail({
    html,
    subject: getEmailTranslator(locale)('reset.subject'),
    tags: { type: 'reset-password' },
    text,
    to: user.email,
  });
}

export async function sendPasswordChangedEmail({ user, request }: Input) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <PasswordChangedEmail locale={locale} name={user.name} />,
  );
  await sendEmail({
    html,
    subject: getEmailTranslator(locale)('passwordChanged.subject'),
    tags: { type: 'password-changed' },
    text,
    to: user.email,
  });
}

export async function sendChangeEmailEmail({
  user,
  newEmail,
  url,
  request,
}: Input & { newEmail: string; url: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <ChangeEmailEmail locale={locale} name={user.name} url={url} newEmail={newEmail} />,
  );
  await sendEmail({
    html,
    subject: getEmailTranslator(locale)('changeEmail.subject'),
    tags: { type: 'change-email' },
    text,
    to: user.email,
  });
}

export async function sendMagicLinkEmail({
  email,
  url,
  request,
}: {
  email: string;
  url: string;
  request?: Request;
}) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(<MagicLinkEmail locale={locale} url={url} />);
  await sendEmail({
    to: email,
    subject: getEmailTranslator(locale)('magicLink.subject'),
    html,
    text,
    tags: { type: 'magic-link' },
  });
}

export async function sendOtpEmail({ user, code, request }: Input & { code: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <OtpEmail locale={locale} name={user.name} code={code} />,
  );
  await sendEmail({
    to: user.email,
    subject: getEmailTranslator(locale)('otp.subject'),
    html,
    text,
    tags: { type: 'email-otp' },
  });
}
