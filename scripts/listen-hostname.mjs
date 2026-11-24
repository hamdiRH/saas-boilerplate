import { isIP } from 'node:net';

/**
 * Next.js standalone `server.js` binds to `process.env.HOSTNAME` (default `0.0.0.0`).
 * Git Bash on Windows sets HOSTNAME to the PC name, so the server never listens on
 * localhost and both the browser and Playwright time out.
 *
 * @param {string | undefined} value - The hostname configured for the server.
 * @returns {string} A hostname usable by local browser clients.
 */
export const resolveListenHostname = (value) => {
  if (!value || value === 'localhost' || isIP(value)) {
    return value || '0.0.0.0';
  }
  return '0.0.0.0';
};
