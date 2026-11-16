import { z } from 'zod';

import { emailField, nameField, newPassword, requiredField } from './auth';

export const updateProfileSchema = z.object({ name: nameField });

export const changePasswordSchema = z
  .object({
    confirmPassword: requiredField,
    currentPassword: requiredField,
    newPassword,
    revokeOtherSessions: z.boolean(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export function createDeleteAccountSchema(phrase: string) {
  return z
    .object({ confirm: z.string(), password: requiredField })
    .refine((data) => data.confirm.trim() === phrase, {
      message: 'validation.confirmPhrase',
      path: ['confirm'],
    });
}

export const changeEmailSchema = z.object({ newEmail: emailField });
export type DeleteAccountInput = z.infer<ReturnType<typeof createDeleteAccountSchema>>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
