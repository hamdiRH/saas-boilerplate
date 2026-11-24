import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// No baseURL → same origin. Works on localhost, preview URLs and production without config.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
