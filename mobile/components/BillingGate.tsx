import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useAuthStore } from '@/lib/auth/store';
import {
  hasActiveAccess,
  isTrialExpired,
  type SubscriptionInfo,
} from '@amixos/shared/lib/subscription';
import { PricingModal } from '@/components/PricingModal';

// Full-screen mobile "billing gate". When the active business has no access
// (expired trial / canceled / un-activated 'none'), it overlays the whole
// dashboard with a clear "purchase a plan to continue" message. Self-hides
// whenever the business has active access (or there is no business yet), so it
// can be mounted unconditionally in the dashboard layout above the Tabs.
//
// Subscriptions are bought on the web (Apple/Google IAP rules bar in-app sale
// of digital subs) — owners/admins get a PricingModal that links out to the
// web billing page; non-admins are told to contact the owner.
function buildSubInfo(business: {
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}): SubscriptionInfo {
  return {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  };
}

export function BillingGate() {
  const { locale } = useLang();
  const en = locale === 'en';

  const business = useAuthStore((s) => s.business);
  const businesses = useAuthStore((s) => s.businesses);
  const currentRole = useAuthStore((s) => s.currentRole);
  const setActiveBusiness = useAuthStore((s) => s.setActiveBusiness);
  const logout = useAuthStore((s) => s.logout);

  const [open, setOpen] = useState(false);

  if (!business) return null;

  const sub = buildSubInfo(business);
  if (hasActiveAccess(sub)) return null;

  const status = sub.subscription_status;
  const expired = isTrialExpired(sub);

  let heading: string;
  let body: string;
  if (expired) {
    heading = en ? 'Your trial has ended' : 'Tu prueba terminó';
    body = en
      ? 'Purchase a plan to keep using Amixos.'
      : 'Compra uno de los planes si deseas continuar usando Amixos.';
  } else if (status === 'none') {
    heading = en ? 'Activate this business' : 'Activa este negocio';
    body = en ? 'Choose a plan to continue.' : 'Elige un plan para continuar.';
  } else if (status === 'canceled') {
    heading = en ? 'Your subscription ended' : 'Tu suscripción terminó';
    body = en
      ? 'Renew your plan to continue.'
      : 'Renueva tu plan para continuar.';
  } else {
    heading = en ? 'Choose a plan' : 'Elige un plan';
    body = en ? 'Choose a plan to continue.' : 'Elige un plan para continuar.';
  }

  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  // Other businesses the user can switch to that still have access.
  const otherActive = businesses.filter(
    (b) => b.id !== business.id && hasActiveAccess(buildSubInfo(b)),
  );

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        elevation: 9999,
      }}
      className="bg-surface items-center justify-center"
    >
      <View className="bg-card rounded-2xl border border-border-soft p-6 m-4 w-full max-w-md items-center">
        <Text className="text-xl font-bold text-ink text-center">
          {heading}
        </Text>
        <Text className="text-base text-muted text-center mt-2">{body}</Text>

        {isAdmin ? (
          <Pressable
            onPress={() => setOpen(true)}
            className="mt-6 w-full py-3 rounded-2xl items-center bg-primary active:opacity-90"
          >
            <Text className="text-base font-semibold text-white">
              {en ? 'View plans' : 'Ver planes'}
            </Text>
          </Pressable>
        ) : (
          <Text className="text-sm text-muted text-center mt-6">
            {en
              ? 'Contact your business owner to renew the plan.'
              : 'Contacta al dueño de tu negocio para renovar el plan.'}
          </Text>
        )}

        {otherActive.length > 0 ? (
          <View className="mt-6 w-full">
            <Text className="text-xs font-semibold text-muted uppercase mb-2">
              {en ? 'Switch business' : 'Cambiar de negocio'}
            </Text>
            <View className="gap-2">
              {otherActive.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setActiveBusiness(b.id)}
                  className="w-full py-3 px-4 rounded-2xl border border-border active:opacity-90"
                >
                  <Text className="text-base font-medium text-ink">
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Pressable onPress={() => logout()} className="mt-6 py-2" hitSlop={8}>
          <Text className="text-sm font-medium text-muted">
            {en ? 'Sign out' : 'Cerrar sesión'}
          </Text>
        </Pressable>
      </View>

      {isAdmin ? (
        <PricingModal visible={open} onClose={() => setOpen(false)} />
      ) : null}
    </View>
  );
}
