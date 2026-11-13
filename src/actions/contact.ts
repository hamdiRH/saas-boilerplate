'use server';

import { getLogger } from '@/libs/logger';
import { createAction } from '@/utils/action';
import { contactSchema } from '@/validations/contact';

const handleContact = createAction(contactSchema, (input) => {
  // Sprint 7 sends this through the EmailTransport; for now we only log metadata (no PII)
  getLogger('app').info('Contact form received', { messageLength: input.message.length });
  return { received: true as const };
});

export async function submitContact(input: unknown) {
  const result = await handleContact(input);
  return result;
}
