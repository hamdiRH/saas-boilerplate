import { Button } from '@/components/ui/button';
import { Env } from '@/libs/env';

const HomePage = () => (
  <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
    <h1 className="text-4xl font-semibold tracking-tight">{Env.NEXT_PUBLIC_APP_NAME}</h1>
    <p className="text-muted-foreground">
      Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui
    </p>
    <Button>It works</Button>
  </section>
);

export default HomePage;
