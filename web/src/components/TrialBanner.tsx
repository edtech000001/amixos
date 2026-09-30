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

// Slim banner shown while the active business is trialing, its trial has
// expired, it has no plan yet, or its card payment FAILED (past_due — Stripe is
// retrying; access continues meanwhile). Active / canceled → nothing (canceled
// is handled by BillingGate).
export function TrialBanner() {
  const { business, currentRole } = useApp();
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

  // Card payment failed. Only owners/admins can fix billing, so only they see
  // it — no point alarming the crew. Nothing else told them until Stripe gave
  // up and the business locked.
  const pastDue = sub.subscription_status === 'past_due' && (currentRole === 'owner' || currentRole === 'admin');
  if (pastDue) {
    return (
      <Link
        href={SETTINGS_HREF}
        className="block px-4 py-2 text-center text-sm font-semibold transition-colors bg-red-500/10 text-red-700 hover:bg-red-100 border-b border-red-200"
      >
        {es
          ? 'No pudimos cobrar tu suscripción · Actualiza tu tarjeta para no perder el acceso'
          : "We couldn't charge your subscription · Update your card to keep access"}
      </Link>
    );
  }
  if (!trialing && !expired && !needsPlan) return null;

  const attention = expired || needsPlan;

  return (
    <Link
      href={SETTINGS_HREF}
      className={clsx(
        'block px-4 py-2 text-center text-sm font-semibold transition-colors',
        attention
          ? 'bg-amber-500/10 text-amber-800 hover:bg-amber-100 border-b border-amber-200'
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
