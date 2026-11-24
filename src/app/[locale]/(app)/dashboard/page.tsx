import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { requireSession } from '@/data/session';

export const instant = false;

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as 'en' | 'fr');

  // Authoritative check — do NOT rely on the layout or the proxy (ADR-003)
  const { user } = await requireSession();
  const t = await getTranslations('dashboard');

  return (
    <PageHeader title={t('title')} description={t('welcome', { name: user.name || user.email })} />
  );
}
