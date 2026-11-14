import { localeFromRequest } from '@/i18n/request-locale';
import { sendEmail } from '@/libs/email';
import { getEmailTranslator } from '@/templates/emails/i18n';
import { renderEmail } from '@/templates/emails/render';
import {
  ChangeEmailEmail,
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
