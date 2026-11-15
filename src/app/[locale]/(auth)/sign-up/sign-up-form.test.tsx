import { beforeEach, expect, test, vi } from 'vitest';

import { SignUpForm } from '@/components/auth/sign-up-form';

import { renderWithIntl } from '../../../../../tests/utils/render';

const signUpEmail = vi.hoisted(() => vi.fn());
vi.mock('@/i18n/navigation', () => ({
  getPathname: () => '/verify-email',
}));
vi.mock('@/libs/auth-client', () => ({
  authClient: { sendVerificationEmail: vi.fn(), signUp: { email: signUpEmail } },
}));

beforeEach(() => signUpEmail.mockReset());

async function fill(
  screen: Awaited<ReturnType<typeof renderWithIntl>>,
  password: string,
  confirm: string,
) {
  await screen.getByLabelText('Name', { exact: true }).fill('Ada Lovelace');
  await screen.getByLabelText('Email', { exact: true }).fill('ada@example.com');
  await screen.getByLabelText('Password', { exact: true }).fill(password);
  await screen.getByLabelText('Confirm password', { exact: true }).fill(confirm);
  await screen.getByRole('button', { name: 'Create account' }).click();
}

test('shows a mismatch error and does not call the API', async () => {
  const screen = await renderWithIntl(<SignUpForm />);
  await fill(screen, 'Str0ng-Passw0rd', 'Different-Passw0rd');

  await expect.element(screen.getByText('Passwords do not match')).toBeVisible();
  expect(signUpEmail).not.toHaveBeenCalled();
});

test('shows the "check your email" screen after a successful sign-up', async () => {
  signUpEmail.mockResolvedValue({ data: { user: {} }, error: null });
  const screen = await renderWithIntl(<SignUpForm />);
  await fill(screen, 'Str0ng-Passw0rd', 'Str0ng-Passw0rd');

  await expect.element(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(signUpEmail).toHaveBeenCalledWith(
    expect.objectContaining({ callbackURL: '/verify-email', email: 'ada@example.com' }),
  );
});

test('shows a generic error when the API refuses', async () => {
  signUpEmail.mockResolvedValue({
    data: null,
    error: { code: 'USER_ALREADY_EXISTS', status: 422 },
  });
  const screen = await renderWithIntl(<SignUpForm />);
  await fill(screen, 'Str0ng-Passw0rd', 'Str0ng-Passw0rd');

  await expect.element(screen.getByText(/couldn't create your account/iu)).toBeVisible();
});
