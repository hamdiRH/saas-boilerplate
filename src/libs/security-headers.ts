export interface HeaderEntry {
  key: string;
  value: string;
}

/**
 * Baseline response headers for every route. A Content-Security-Policy is added in Sprint 6
 * (its `frame-ancestors` will supersede X-Frame-Options).
 */
export function getSecurityHeaders({ isProduction }: { isProduction: boolean }): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];

  if (isProduction) {
    // Browsers ignore HSTS over plain http, but never send it from local development builds.
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
  }

  return headers;
}
