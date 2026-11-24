import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp } from 'node:fs/promises';
import path from 'node:path';

import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const standaloneDirectory = path.resolve('.next/standalone');

await cp(path.resolve('public'), path.join(standaloneDirectory, 'public'), {
  force: true,
  recursive: true,
});
await cp(path.resolve('.next/static'), path.join(standaloneDirectory, '.next', 'static'), {
  force: true,
  recursive: true,
});

const server = spawn(process.execPath, ['server.js'], {
  cwd: standaloneDirectory,
  stdio: 'inherit',
});

server.on('error', (error) => {
  throw error;
});

const [exitCode] = await once(server, 'close');
process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
