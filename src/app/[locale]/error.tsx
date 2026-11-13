'use client';

import { ErrorView } from '@/components/layout/error-view';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Sprint 6 reports `error` to Sentry here
  return <ErrorView digest={error.digest} onRetry={reset} />;
}
