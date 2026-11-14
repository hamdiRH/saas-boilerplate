/**
 * Only same-origin relative paths are allowed as post-login destinations.
 * Anything else (absolute URLs, //host, backslashes, control chars) → fallback.
 */
export function sanitizeCallbackUrl(raw: string | null | undefined, fallback: string): string {
  if (!raw) {
    return fallback;
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback;
  }
  if (
    [...raw].some((char) => {
      const code = char.codePointAt(0);
      return code !== undefined && (code <= 0x1f || code === 0x7f);
    })
  ) {
    return fallback;
  }

  try {
    const url = new URL(raw, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
