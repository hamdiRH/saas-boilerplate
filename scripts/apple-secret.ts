import { readFileSync } from 'node:fs';

import { importPKCS8, SignJWT } from 'jose';

/**
 * Usage: pnpm apple:secret <TEAM_ID> <SERVICES_ID (client id)> <KEY_ID> <path/to/AuthKey_XXXX.p8>
 * Output: the JWT to put in APPLE_CLIENT_SECRET. Apple caps its lifetime at 6 months.
 */
async function main() {
  const [teamId, clientId, keyId, keyPath] = process.argv.slice(2);
  if (!teamId || !clientId || !keyId || !keyPath) {
    console.error('Usage: pnpm apple:secret <TEAM_ID> <CLIENT_ID> <KEY_ID> <path-to-p8>');
    process.exit(1);
  }

  const privateKey = await importPKCS8(readFileSync(keyPath, 'utf-8'), 'ES256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('180d')
    .sign(privateKey);

  console.log(jwt);
  console.error(
    '\n⏰ Expires in 180 days — renew it before then (or sign-in with Apple stops working).',
  );
}

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    console.error('❌', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

void run();
