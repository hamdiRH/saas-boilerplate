import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ProfileForm } from '@/components/account/profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/data/session';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as 'en' | 'fr');
  const { user } = await requireSession();
  const t = await getTranslations('account.profile');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm name={user.name} />
      </CardContent>
    </Card>
  );
}
