import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ChangeEmailForm } from '@/components/account/change-email-form';
import { ProfileForm } from '@/components/account/profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/data/session';

export const instant = false;

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as 'fr' | 'en');
  const { user } = await requireSession();
  const t = await getTranslations('account.profile');
  const tEmail = await getTranslations('account.email');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tEmail('title')}</CardTitle>
          <CardDescription>{tEmail('description', { email: user.email })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm />
        </CardContent>
      </Card>
    </div>
  );
}
