import { z } from 'zod';

// Messages are i18n KEYS (see src/locales/*.json → "validation")
const httpsEndpoint = z
  .url({ message: 'validation.invalid' })
  .max(2048, { message: 'validation.invalid' })
  .refine((value) => value.startsWith('https://'), { message: 'validation.invalid' });

export const pushSubscriptionSchema = z.object({
  endpoint: httpsEndpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    auth: z.string().min(1).max(64),
    p256dh: z.string().min(1).max(256),
  }),
});

export const unsubscribePushSchema = z.object({ endpoint: httpsEndpoint });
