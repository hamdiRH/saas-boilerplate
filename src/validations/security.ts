import { z } from 'zod';

export const passkeyNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'validation.passkeyName' })
    .max(40, { message: 'validation.passkeyName' }),
});
export type PasskeyNameInput = z.infer<typeof passkeyNameSchema>;
