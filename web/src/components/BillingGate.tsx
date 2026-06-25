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
  const { locale } = useLang();
  const es = locale === 'es';
  const [open, setOpen] = useState(false);

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

  const otherActive = businesses.filter(
    (b) => b.id !== business.id && hasActiveAccess(subInfoOf(b)),
  );

  async function handleSignOut() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{heading}</h1>
        {body && <p className="mt-2 text-sm text-gray-600">{body}</p>}

        {canManage ? (
          <Button variant="primary" fullWidth className="mt-6" onClick={() => setOpen(true)}>
            {es ? 'Ver planes' : 'View plans'}
          </Button>
        ) : (
          <p className="mt-6 text-sm text-gray-500">
            {es
              ? 'Contacta al dueño de tu negocio para renovar el plan.'
              : 'Contact your business owner to renew the plan.'}
          </p>
        )}

        {otherActive.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {es ? 'Cambiar de negocio' : 'Switch business'}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {otherActive.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBusiness(b.id)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 text-sm font-medium text-gray-400 hover:text-gray-600"
        >
          {es ? 'Cerrar sesión' : 'Sign out'}
        </button>
      </div>

      <PricingModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
