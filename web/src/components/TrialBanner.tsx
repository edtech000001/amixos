'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import {
  isTrialExpired,
  trialDaysLeft,
  type SubscriptionInfo,
} from '@amixos/shared/lib/subscription';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';

const SETTINGS_HREF = '/dashboard/ajustes?tab=cuenta';

// Slim banner shown ONLY while the active business is trialing or its trial
// has expired. Active / past_due / canceled / none → renders nothing.
export function TrialBanner() {
  const { business } = useApp();
  const { locale } = useLang();
  const es = locale === 'es';

  if (!business) return null;

  const sub: SubscriptionInfo = {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  };

  const expired = isTrialExpired(sub);
  const daysLeft = trialDaysLeft(sub);
  const trialing = !expired && daysLeft !== null;
  // Additional businesses (no trial granted) land at 'none' — prompt to pick a
  // plan instead of leaving them in a silent un-activated state.
  const needsPlan = sub.subscription_status === 'none';

  if (!trialing && !expired && !needsPlan) return null;

  const attention = expired || needsPlan;

  return (
    <Link
      href={SETTINGS_HREF}
      className={clsx(
        'block px-4 py-2 text-center text-sm font-semibold transition-colors',
        attention
          ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-b border-amber-200'
          : 'bg-primary/10 text-primary hover:bg-primary/15 border-b border-primary/20',
      )}
    >
      {needsPlan
        ? es
          ? 'Elige un plan para activar este negocio'
          : 'Choose a plan to activate this business'
        : expired
          ? es
            ? 'Tu prueba terminó · Suscríbete'
            : 'Your trial ended · Subscribe'
          : es
            ? `Te quedan ${daysLeft} día${daysLeft === 1 ? '' : 's'} de prueba · Suscríbete`
            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial · Subscribe`}
    </Link>
  );
}
