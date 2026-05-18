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
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated' && status !== 'logged_out') return;

    const seg = segments[0];
    const inAuthGroup = seg === 'auth';
    const inOnboarding = seg === 'onboarding';
    const inDashboard = seg === 'dashboard';
    const onSplash = seg === '(tabs)' || !seg;

    if (status === 'logged_out' && (inDashboard || inOnboarding)) {
      router.replace('/auth/login');
      return;
    }

    if (status === 'authenticated') {
      // Wait for business fetch before deciding onboarding vs dashboard,
      // otherwise we'd flash to /onboarding while business is still loading.
      if (!businessLoaded) return;

      if (!business && !inOnboarding && !inAuthGroup) {
        router.replace('/onboarding');
        return;
      }
      if (business && (inAuthGroup || onSplash)) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [status, business, businessLoaded, segments, router]);
}
