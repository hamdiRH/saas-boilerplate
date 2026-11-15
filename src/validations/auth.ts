import { z } from 'zod';

const email = z.email({ message: 'validation.email' });
const name = z.string().trim().min(2, { message: 'validation.nameMin' });

export const newPassword = z
  .string()
  .min(12, { message: 'validation.passwordMin' })
  .max(128, { message: 'validation.passwordMax' })
  .regex(/[a-z]/u, { message: 'validation.passwordComplexity' })
  .regex(/[A-Z]/u, { message: 'validation.passwordComplexity' })
  .regex(/\d/u, { message: 'validation.passwordComplexity' });

const required = z.string().min(1, { message: 'validation.required' });

function matching<T extends { confirmPassword: string }>(
  data: T,
  field: Exclude<keyof T, 'confirmPassword'>,
) {
  return data[field] === data.confirmPassword;
}

export const signUpSchema = z
  .object({ confirmPassword: required, email, name, password: newPassword })
  .refine((data) => matching(data, 'password'), {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export const signInSchema = z.object({ email, password: required });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ confirmPassword: required, password: newPassword })
  .refine((data) => matching(data, 'password'), {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
