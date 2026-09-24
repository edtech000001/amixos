'use client';

import { useState } from 'react';
import {
  hasActiveAccess,
  isTrialExpired,
  type SubscriptionInfo,
} from '@amixos/shared/lib/subscription';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { PricingModal } from '@/components/PricingModal';
import { AccountDangerZone } from '@/components/dashboard/AccountDangerZone';
import { createSupabaseClient } from '@/lib/supabase';

function subInfoOf(b: {
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}): SubscriptionInfo {
  return {
    plan: b.plan,
    subscription_status: b.subscription_status,
    trial_ends_at: b.trial_ends_at,
    current_period_end: b.current_period_end,
  };
}

export function BillingGate() {
  const { business, businesses, currentRole, setActiveBusiness } = useApp();
  const { t: full, locale } = useLang();
  const dt = full.dashboard.settings.account.danger;
  const es = locale === 'es';
  const [open, setOpen] = useState(false);
  // A user who decides NOT to pay still has to be able to delete their data.
  // Without this the gate offered only "view plans" or "sign out", which left
  // the account and its business sitting there with no in-app way to remove
  // them — a dead end for the user, and on mobile an App Store 5.1.1(v)
  // problem, since deletion has to be reachable from inside the app.
  const [danger, setDanger] = useState(false);

  if (!business) return null;

  const subInfo = subInfoOf(business);
  if (hasActiveAccess(subInfo)) return null;

  const canManage = currentRole === 'owner' || currentRole === 'admin';

  // Heading + body by status.
  let heading: string;
  let body: string;
  if (isTrialExpired(subInfo)) {
    heading = es ? 'Tu prueba terminó' : 'Your trial has ended';
    body = es
      ? 'Compra uno de los planes si deseas continuar usando Amixos.'
      : 'Purchase a plan to keep using Amixos.';
  } else if (business.subscription_status === 'none') {
    heading = es ? 'Activa este negocio' : 'Activate this business';
    body = es ? 'Elige un plan para continuar.' : 'Choose a plan to continue.';
  } else if (business.subscription_status === 'canceled') {
    heading = es ? 'Tu suscripción terminó' : 'Your subscription ended';
    body = es ? 'Renueva tu plan para continuar.' : 'Renew your plan to continue.';
  } else {
    heading = es ? 'Elige un plan para continuar.' : 'Choose a plan to continue.';
    body = '';
  }

  // EVERY other business, not just the ones with access: with two unpaid
  // businesses the list used to be empty, leaving no way out of the gate but
  // signing out. Ones that also need a plan are labelled as such.
  const others = businesses
    .filter((b) => b.id !== business.id)
    .map((b) => ({ ...b, active: hasActiveAccess(subInfoOf(b)) }))
    .sort((a, b) => Number(b.active) - Number(a.active));

  async function handleSignOut() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <div className="fixed inset-0 z-[100] bg-surface overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center p-4 gap-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border-soft shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-ink">{heading}</h1>
        {/* WHICH business this gate is for. Without it, a user with two
            businesses can't tell the paywall apart from the one they just
            switched away from — and the switch list below (which names the
            OTHER business) reads as "you're still on that one". */}
        <p className="mt-1 text-base font-semibold text-primary">{business.name}</p>
        {body && <p className="mt-2 text-sm text-muted">{body}</p>}

        {canManage ? (
          <Button variant="primary" fullWidth className="mt-6" onClick={() => setOpen(true)}>
            {es ? `Ver planes para ${business.name}` : `View plans for ${business.name}`}
          </Button>
        ) : (
          <p className="mt-6 text-sm text-muted">
            {es
              ? 'Contacta al dueño de tu negocio para renovar el plan.'
              : 'Contact your business owner to renew the plan.'}
          </p>
        )}

        {others.length > 0 && (
          <div className="mt-6 border-t border-border-soft pt-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {es ? 'Cambiar a otro negocio' : 'Switch to another business'}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {others.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBusiness(b.id)}
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-left transition-colors hover:bg-surface"
                >
                  <span className="block text-sm font-medium text-ink">{b.name}</span>
                  {!b.active && (
                    <span className="block text-xs text-faint">
                      {es ? 'También necesita un plan' : 'Also needs a plan'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 block w-full text-sm font-medium text-faint hover:text-muted"
        >
          {es ? 'Cerrar sesión' : 'Sign out'}
        </button>

        {!danger && (
          <button
            type="button"
            onClick={() => setDanger(true)}
            className="mt-2 block w-full text-sm font-medium text-red-600 hover:text-red-700"
          >
            {dt.paywallLink}
          </button>
        )}
      </div>

      {danger && (
        <div className="max-w-md w-full">
          <p className="mb-2 text-center text-xs text-muted">{dt.paywallHint}</p>
          <AccountDangerZone />
        </div>
      )}
      </div>

      <PricingModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
