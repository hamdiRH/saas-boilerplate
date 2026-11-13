import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ContactForm } from '@/components/forms/contact-form';
import { PageHeader } from '@/components/layout/page-header';

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: 'en' | 'fr' }>;
}) {
  const { locale }: { locale: 'en' | 'fr' } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('contact');

  return (
    <section className="mx-auto max-w-xl px-4 py-16">
      <PageHeader title={t('title')} description={t('description')} />
      <ContactForm />
    </section>
  );
}
