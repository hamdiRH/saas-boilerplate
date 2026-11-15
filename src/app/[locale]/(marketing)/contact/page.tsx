import { getTranslations } from 'next-intl/server';

import { ContactForm } from '@/components/forms/contact-form';
import { PageHeader } from '@/components/layout/page-header';

export default async function ContactPage() {
  const t = await getTranslations('contact');

  return (
    <section className="mx-auto max-w-xl px-4 py-16">
      <PageHeader title={t('title')} description={t('description')} />
      <ContactForm />
    </section>
  );
}
