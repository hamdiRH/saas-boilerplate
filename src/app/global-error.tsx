'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold">Something went wrong · Une erreur est survenue</h1>
        <button type="button" className="underline" onClick={reset}>
          Try again · Réessayer
        </button>
      </body>
    </html>
  );
}
