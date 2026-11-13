import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';
import { ContactForm } from './contact-form';

const submitContact = vi.hoisted(() => vi.fn());
vi.mock('@/actions/contact', () => ({ submitContact }));

beforeEach(() => {
  submitContact.mockReset();
});

test('shows translated validation errors and does not call the action', async () => {
  const screen = await renderWithIntl(<ContactForm />);

  await screen.getByRole('button', { name: 'Send message' }).click();

  await expect.element(screen.getByText('Name must be at least 2 characters')).toBeVisible();
  await expect.element(screen.getByText('Enter a valid email address')).toBeVisible();
  expect(submitContact).not.toHaveBeenCalled();
});

test('submits valid data to the server action', async () => {
  submitContact.mockResolvedValue({ data: { received: true }, ok: true });
  const screen = await renderWithIntl(<ContactForm />);

  await screen.getByLabelText('Name').fill('Ada Lovelace');
  await screen.getByLabelText('Email').fill('ada@example.com');
  await screen.getByLabelText('Message').fill('Hello there, this is a test.');
  await screen.getByRole('button', { name: 'Send message' }).click();

  await vi.waitFor(() =>
    expect(submitContact).toHaveBeenCalledWith({
      email: 'ada@example.com',
      message: 'Hello there, this is a test.',
      name: 'Ada Lovelace',
    }),
  );
});

test('displays server-side field errors returned by the action', async () => {
  submitContact.mockResolvedValue({
    error: {
      code: 'VALIDATION_ERROR',
      fieldErrors: { email: ['validation.email'] },
      messageKey: 'errors.validation',
    },
    ok: false,
  });
  const screen = await renderWithIntl(<ContactForm />);

  await screen.getByLabelText('Name').fill('Ada Lovelace');
  await screen.getByLabelText('Email').fill('ada@example.com');
  await screen.getByLabelText('Message').fill('Hello there, this is a test.');
  await screen.getByRole('button', { name: 'Send message' }).click();

  await expect.element(screen.getByText('Enter a valid email address')).toBeVisible();
});
