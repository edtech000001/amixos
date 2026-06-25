import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from './store';

// Root-level routing gate. Subscribes to status (not booleans) and decides
// where the user should be sent. Runs on every segment change.
//
// Three settled outcomes:
//   logged_out + on protected page → /auth/login
//   authenticated + no business    → /onboarding
//   authenticated + has business   → /dashboard (if currently on auth/splash)
//
// All loading states (unknown, loading, logging_in, signing_up) are no-ops
// — the screen renders normally; we wait for status to settle before
// redirecting. Same for the gap between SIGNED_IN firing and the business
// fetch resolving (we wait until businessLoaded).
export function useProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const business = useAuthStore((s) => s.business);
  const businessLoaded = useAuthStore((s) => s.businessLoaded);
  const businessLoadError = useAuthStore((s) => s.businessLoadError);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated' && status !== 'logged_out') return;

    const seg = segments[0];
    const inAuthGroup = seg === 'auth';
    const inOnboarding = seg === 'onboarding';
    const inDashboard = seg === 'dashboard';
    const inLoadError = seg === 'load-error';
    const onSplash = seg === '(tabs)' || !seg;

    if (status === 'logged_out' && (inDashboard || inOnboarding || inLoadError)) {
      router.replace('/auth/login');
      return;
    }

    if (status === 'authenticated') {
      // Wait for business fetch before deciding onboarding vs dashboard,
      // otherwise we'd flash to /onboarding while business is still loading.
      if (!businessLoaded) return;

      // The fetch FAILED (vs returned zero businesses). Send the user to a
      // retry screen — never to onboarding, which would look like their
      // account/business vanished. Most common cause: a not-yet-run migration.
      if (businessLoadError) {
        if (!inLoadError && !inAuthGroup) router.replace('/load-error');
        return;
      }

      // No business yet → onboarding. This must also fire from the auth group:
      // an OAuth sign-in (Apple/Google) for a brand-new account lands the user
      // here while still on /auth/login, and unlike email register there's no
      // manual nav to onboarding. Only `inOnboarding` guards against a loop.
      if (!business && !inOnboarding) {
        router.replace('/onboarding');
        return;
      }
      if (business && (inAuthGroup || onSplash || inLoadError)) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [status, business, businessLoaded, businessLoadError, segments, router]);
}
