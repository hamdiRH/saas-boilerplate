// Bundles src/sw/sw.ts into public/sw.js (or the kill-switch worker when the PWA is disabled).
// Cross-platform: plain Node + esbuild. Runs before `next build` (see package.json "build").
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { build } from 'esbuild';

const OUTFILE = 'public/sw.js';
const TSCONFIG = 'src/sw/tsconfig.json';
// Only PUBLIC files that must work with zero network. Never add pages or user data here.
const PRECACHE = ['/offline.html'];

const killSwitch = process.env.NEXT_PUBLIC_PWA_ENABLED === 'false';
const entry = killSwitch ? 'src/sw/kill.ts' : 'src/sw/sw.ts';

const bundle = (buildId, write) =>
  build({
    bundle: true,
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
      __PRECACHE__: JSON.stringify(PRECACHE),
    },
    entryPoints: [entry],
    format: 'iife',
    legalComments: 'none',
    minify: true,
    outfile: OUTFILE,
    platform: 'browser',
    target: 'es2020',
    tsconfig: TSCONFIG,
    write,
  });

/**
 * Build id: the commit when CI/hosting provides one, otherwise a hash of the worker bundle and
 * the precached files, so it changes whenever the worker or its offline page changes.
 */
const resolveBuildId = async () => {
  const fromEnvironment =
    process.env.PWA_BUILD_ID ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.BUILD_SOURCEVERSION;
  if (fromEnvironment) {
    return fromEnvironment.slice(0, 12);
  }

  const dry = await bundle('pending', false);
  const hash = createHash('sha256');
  for (const file of dry.outputFiles) {
    hash.update(file.contents);
  }
  const offline = await Promise.all(PRECACHE.map((url) => readFile(`public${url}`)));
  for (const content of offline) {
    hash.update(content);
  }
  return hash.digest('hex').slice(0, 12);
};

const main = async () => {
  const buildId = await resolveBuildId();
  await bundle(buildId, true);
  console.log(
    `✅ ${OUTFILE} built (${killSwitch ? 'KILL SWITCH' : 'worker'}, build id ${buildId})`,
  );
};

try {
  await main();
} catch (error) {
  console.error(
    '❌ Service worker build failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
