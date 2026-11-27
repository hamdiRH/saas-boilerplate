import { expect, it } from 'vitest';

import { buildPasskeyConfig } from './auth-passkey';

it('derives rpID and origin from the app URL', () => {
  expect(buildPasskeyConfig({ appUrl: 'http://localhost:3000', appName: 'App' })).toEqual({
    rpID: 'localhost',
    rpName: 'App',
    origin: 'http://localhost:3000',
  });
  expect(buildPasskeyConfig({ appUrl: 'https://app.example.com/', appName: 'App' }).rpID).toBe(
    'app.example.com',
  );
});

it('honours explicit overrides (e.g. a parent domain shared by subdomains)', () => {
  const config = buildPasskeyConfig({
    appUrl: 'https://app.example.com',
    appName: 'App',
    rpId: 'example.com',
    rpName: 'Example',
  });
  expect(config).toMatchObject({
    rpID: 'example.com',
    rpName: 'Example',
    origin: 'https://app.example.com',
  });
});
