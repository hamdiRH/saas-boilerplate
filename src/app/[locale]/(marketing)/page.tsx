import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { Button } from '@/components/ui/button';
import { getLogger } from '@/libs/logger';

getLogger('app').info('home rendered', { password: 'hunter2', user: 'ada' });
export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale as 'en' | 'fr');
  const t = useTranslations('marketing');

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('subtitle')}</p>
      <Button>{t('cta')}</Button>
    </section>
  );
}
