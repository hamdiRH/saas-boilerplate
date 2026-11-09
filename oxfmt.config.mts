import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

export default defineConfig({
  ...ultracite,
  endOfLine: 'lf',
  ignorePatterns: [
    '.next',
    'node_modules',
    'coverage',
    'drizzle',
    'pnpm-lock.yaml',
    'playwright-report',
    'test-results',
  ],
  printWidth: 100,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
});
