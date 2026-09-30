import Stripe from 'stripe';

// Server-side Stripe client. STRIPE_SECRET_KEY is a server-only env var (never
// NEXT_PUBLIC_). Used by the billing route handlers for Checkout, the customer
// portal, and webhook signature verification.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  // Pin nothing — use the SDK's bundled API version.
  typescript: true,
});

/**
 * The Stripe locale for an Amixos user — drives the language of every email
 * Stripe sends them (receipts, renewal reminders, failed-payment notices) via
 * the customer's preferred_locales, and of the Checkout / Billing Portal
 * pages. Read from auth user_metadata.locale, which the app keeps in sync with
 * its own language switcher (shared/src/lib/userLocale.ts). Latin-American
 * Spanish by default: Amixos is Spanish-first, and es-419 reads right for its
 * users where Spain's Spanish ('es') doesn't.
 */
export function stripeLocaleFor(user: { user_metadata?: Record<string, unknown> | null }): 'en' | 'es-419' {
  return user.user_metadata?.locale === 'en' ? 'en' : 'es-419';
}

/** Keep an existing customer's email language in step with the app — the
 *  owner may have switched languages since the customer was created. Best
 *  effort: a language preference must never block checkout or the portal. */
export async function syncCustomerLocale(customerId: string, locale: 'en' | 'es-419'): Promise<void> {
  try {
    await stripe.customers.update(customerId, { preferred_locales: [locale] });
  } catch (err) {
    console.warn('[stripe] could not update customer locale', customerId, err);
  }
}
