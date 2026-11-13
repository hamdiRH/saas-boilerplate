import { z } from 'zod';

// Messages are i18n KEYS (see src/locales/*.json → "validation")
export const contactSchema = z.object({
  email: z.email({ message: 'validation.email' }),
  message: z
    .string()
    .trim()
    .min(10, { message: 'validation.messageMin' })
    .max(1000, { message: 'validation.messageMax' }),
  name: z.string().trim().min(2, { message: 'validation.nameMin' }),
});

export type ContactInput = z.infer<typeof contactSchema>;
