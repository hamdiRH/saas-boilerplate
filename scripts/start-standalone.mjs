import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';

import nextEnv from '@next/env';

import { resolveListenHostname } from './listen-hostname.mjs';

nextEnv.loadEnvConfig(process.cwd());

const standaloneDirectory = path.resolve('.next/standalone');
const serverJs = path.join(standaloneDirectory, 'server.js');

if (!existsSync(serverJs)) {
  throw new Error(
    'Missing .next/standalone/server.js. Run `pnpm build` first (next.config output is "standalone").',
  );
}

await cp(path.resolve('public'), path.join(standaloneDirectory, 'public'), {
  force: true,
  recursive: true,
});
await cp(path.resolve('.next/static'), path.join(standaloneDirectory, '.next', 'static'), {
  force: true,
  recursive: true,
});

const hostname = resolveListenHostname(process.env.HOSTNAME);
const port = process.env.PORT ?? '3000';

const server = spawn(process.execPath, ['server.js'], {
  cwd: standaloneDirectory,
  env: {
    ...process.env,
    HOSTNAME: hostname,
    PORT: port,
  },
  stdio: 'inherit',
});

server.on('error', (error) => {
  throw error;
});

const [exitCode] = await once(server, 'close');
process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
