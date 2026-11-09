import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">
        SaaS Boilerplate
      </h1>
      <p className="text-muted-foreground text-center">
        Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui
      </p>
      <Button>It works</Button>
    </main>
  );
}
